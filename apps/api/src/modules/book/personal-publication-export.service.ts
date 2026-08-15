import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import {
  PersonalPublicationSnapshotDescriptorSchema,
  serializePersonalPublicationSnapshotDescriptor,
} from '@reader/shared-types';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { DEFAULT_SHARE_TOKEN, toScopedId } from '../../common/request-boundary';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_PUBLICATION_BYTES = 20 * 1024 * 1024;
const MAX_RECEIPTS = 8;
const RECEIPT_TTL_MS = 5 * 60 * 1000;

const sha256 = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');

export interface PersonalPublicationDbSnapshot {
  scopedBookId: string;
  scopeSalt: string;
  book: {
    title: string;
    author?: string;
    description?: string;
    format: string;
    chapterCount: number;
  };
  chapters: Array<{
    index: number;
    title: string;
    contentHash: string;
  }>;
}

@Injectable()
export class PersonalPublicationExportRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: LibSQLDatabase<typeof schema>,
  ) {}

  async readSnapshot(
    bookId: string,
    token: string,
  ): Promise<PersonalPublicationDbSnapshot | null> {
    const scopedBookId = toScopedId(bookId, token);
    return this.db.transaction(async (tx) => {
      const [books, chapters, states] = await Promise.all([
        tx
          .select()
          .from(schema.books)
          .where(eq(schema.books.id, scopedBookId))
          .limit(1),
        tx
          .select({
            index: schema.chapters.index,
            title: schema.chapters.title,
            contentHash: schema.chapters.contentHash,
          })
          .from(schema.chapters)
          .where(eq(schema.chapters.bookId, scopedBookId))
          .orderBy(asc(schema.chapters.index)),
        tx
          .select({ scopeSalt: schema.personalExportState.scopeSalt })
          .from(schema.personalExportState)
          .where(and(eq(schema.personalExportState.id, 1)))
          .limit(1),
      ]);
      const book = books[0];
      const state = states[0];
      if (!book) return null;
      if (!state || !SHA256_PATTERN.test(state.scopeSalt)) {
        throw new Error('PERSONAL_EXPORT_SCOPE_STATE_INVALID');
      }
      return {
        scopedBookId,
        scopeSalt: state.scopeSalt,
        book: {
          title: book.title,
          author: book.author ?? undefined,
          description: book.description ?? undefined,
          format: book.format,
          chapterCount: book.chapterCount,
        },
        chapters,
      };
    });
  }
}

interface ReadPersonalPublicationPageInput {
  token: string;
  bookId: string;
  offset: number;
  limit: number;
  includeContent: boolean;
  expectedSnapshotHash?: string;
}

interface PersonalPublicationReceipt {
  scopedBookId: string;
  snapshotHash: string;
  sourceRef: string;
  descriptor: ReturnType<
    typeof PersonalPublicationSnapshotDescriptorSchema.parse
  >;
  byteLengths: number[];
  expiresAt: number;
}

@Injectable()
export class PersonalPublicationExportService {
  private readonly receipts = new Map<string, PersonalPublicationReceipt>();

  constructor(
    private readonly repository: PersonalPublicationExportRepository,
    private readonly blobs: LocalFileBlobStorage,
  ) {}

  private describe(snapshot: PersonalPublicationDbSnapshot) {
    const sourceRef = createHmac(
      'sha256',
      Buffer.from(snapshot.scopeSalt, 'hex'),
    )
      .update(snapshot.scopedBookId)
      .digest('hex');
    const descriptor = PersonalPublicationSnapshotDescriptorSchema.safeParse({
      schemaVersion: 1,
      sourceRef,
      book: {
        title: snapshot.book.title,
        author: snapshot.book.author,
        description: snapshot.book.description,
        format: snapshot.book.format,
        chapterCount: snapshot.book.chapterCount,
      },
      chapters: snapshot.chapters,
    });
    if (
      !descriptor.success ||
      snapshot.book.format !== 'txt' ||
      snapshot.chapters.length !== snapshot.book.chapterCount ||
      snapshot.chapters.some((chapter, position) => chapter.index !== position)
    ) {
      throw new UnprocessableEntityException(
        '私人云端书籍不是可发布的完整 TXT 正文',
      );
    }
    const value = descriptor.data;
    return {
      descriptor: value,
      snapshotHash: sha256(
        serializePersonalPublicationSnapshotDescriptor(value),
      ),
      sourceRef,
    };
  }

  private receiptKey(scopedBookId: string, snapshotHash: string) {
    return sha256(`${scopedBookId}\0${snapshotHash}`);
  }

  private readCachedReceipt(scopedBookId: string, snapshotHash: string) {
    const key = this.receiptKey(scopedBookId, snapshotHash);
    const receipt = this.receipts.get(key);
    if (!receipt) return undefined;
    if (receipt.expiresAt <= Date.now()) {
      this.receipts.delete(key);
      return undefined;
    }
    receipt.expiresAt = Date.now() + RECEIPT_TTL_MS;
    this.receipts.delete(key);
    this.receipts.set(key, receipt);
    return receipt;
  }

  private cacheReceipt(receipt: PersonalPublicationReceipt) {
    const key = this.receiptKey(receipt.scopedBookId, receipt.snapshotHash);
    this.receipts.delete(key);
    this.receipts.set(key, receipt);
    while (this.receipts.size > MAX_RECEIPTS) {
      const oldest = this.receipts.keys().next().value as string | undefined;
      if (!oldest) break;
      this.receipts.delete(oldest);
    }
  }

  private async buildReceipt(
    snapshot: PersonalPublicationDbSnapshot,
    described: ReturnType<PersonalPublicationExportService['describe']>,
  ): Promise<PersonalPublicationReceipt> {
    let totalBytes = 0;
    const byteLengths: number[] = [];
    for (const chapter of described.descriptor.chapters) {
      let size: number;
      try {
        size = await this.blobs.getObjectSize(chapter.contentHash);
      } catch {
        throw new UnprocessableEntityException('私人云端章节 Blob 缺失');
      }
      if (!Number.isSafeInteger(size) || size <= 0) {
        throw new UnprocessableEntityException('私人云端章节 Blob 校验失败');
      }
      totalBytes += size;
      if (totalBytes > MAX_PUBLICATION_BYTES) {
        throw new PayloadTooLargeException('私人云端整书正文超过 20 MiB');
      }
      byteLengths.push(size);
    }

    for (const [index, chapter] of described.descriptor.chapters.entries()) {
      let bytes: Buffer;
      try {
        bytes = await this.blobs.getObject(chapter.contentHash);
      } catch {
        throw new UnprocessableEntityException('私人云端章节 Blob 缺失');
      }
      if (
        bytes.length !== byteLengths[index] ||
        sha256(bytes) !== chapter.contentHash
      ) {
        throw new UnprocessableEntityException('私人云端章节 Blob 校验失败');
      }
      try {
        if (!new TextDecoder('utf-8', { fatal: true }).decode(bytes)) {
          throw new Error('EMPTY_CHAPTER');
        }
      } catch {
        throw new UnprocessableEntityException(
          '私人云端章节不是有效的非空 UTF-8 正文',
        );
      }
    }

    const receipt: PersonalPublicationReceipt = {
      scopedBookId: snapshot.scopedBookId,
      snapshotHash: described.snapshotHash,
      sourceRef: described.sourceRef,
      descriptor: described.descriptor,
      byteLengths,
      expiresAt: Date.now() + RECEIPT_TTL_MS,
    };
    this.cacheReceipt(receipt);
    return receipt;
  }

  private async resolveReceipt(input: {
    bookId: string;
    token: string;
    expectedSnapshotHash?: string;
  }) {
    const scopedBookId = toScopedId(input.bookId, input.token);
    if (input.expectedSnapshotHash) {
      const cached = this.readCachedReceipt(
        scopedBookId,
        input.expectedSnapshotHash,
      );
      if (cached) return cached;
    }

    const snapshot = await this.repository.readSnapshot(
      input.bookId,
      input.token,
    );
    if (!snapshot) {
      throw new NotFoundException('私人云端不存在这本书');
    }
    const described = this.describe(snapshot);
    if (
      input.expectedSnapshotHash &&
      input.expectedSnapshotHash !== described.snapshotHash
    ) {
      throw new ConflictException({
        code: 'PERSONAL_EXPORT_SNAPSHOT_STALE',
        message: '私人云端正文已变化，请重新核验',
      });
    }
    return this.buildReceipt(snapshot, described);
  }

  async readPage(input: ReadPersonalPublicationPageInput) {
    const token = input.token.trim();
    if (!token || token.toLocaleLowerCase('en-US') === DEFAULT_SHARE_TOKEN) {
      throw new BadRequestException('发布必须绑定非默认私有云密钥');
    }
    if (
      !input.bookId.trim() ||
      !Number.isInteger(input.offset) ||
      input.offset < 0 ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 200 ||
      (input.expectedSnapshotHash !== undefined &&
        !SHA256_PATTERN.test(input.expectedSnapshotHash))
    ) {
      throw new BadRequestException('私人云端发布分页参数无效');
    }

    const receipt = await this.resolveReceipt({
      bookId: input.bookId,
      token,
      expectedSnapshotHash: input.expectedSnapshotHash,
    });
    if (input.offset >= receipt.descriptor.chapters.length) {
      throw new BadRequestException('私人云端发布分页偏移超出正文范围');
    }

    const selected = receipt.descriptor.chapters.slice(
      input.offset,
      input.offset + input.limit,
    );
    const items = await Promise.all(
      selected.map(async (chapter) => {
        const byteLength = receipt.byteLengths[chapter.index];
        if (!input.includeContent) {
          return { ...chapter, byteLength };
        }
        let bytes: Buffer;
        try {
          bytes = await this.blobs.getObject(chapter.contentHash);
        } catch {
          throw new UnprocessableEntityException('私人云端章节 Blob 缺失');
        }
        if (
          bytes.length !== byteLength ||
          sha256(bytes) !== chapter.contentHash
        ) {
          throw new UnprocessableEntityException('私人云端章节 Blob 校验失败');
        }
        let content: string;
        try {
          content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          throw new UnprocessableEntityException('私人云端章节不是严格 UTF-8');
        }
        if (!content) {
          throw new UnprocessableEntityException('私人云端章节正文为空');
        }
        return {
          ...chapter,
          byteLength: bytes.length,
          content,
        };
      }),
    );

    return {
      schemaVersion: 1 as const,
      snapshotHash: receipt.snapshotHash,
      sourceRef: receipt.sourceRef,
      book: receipt.descriptor.book,
      total: receipt.descriptor.chapters.length,
      offset: input.offset,
      limit: input.limit,
      items,
    };
  }
}
