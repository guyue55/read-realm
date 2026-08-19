import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  type PublicLibraryCatalogPatch,
  type PublicLibraryFacetQuery,
  PUBLIC_LIBRARY_TAXONOMY_DTO,
} from './public-library-catalog.contract';
import {
  serializePersonalPublicationSnapshotDescriptor,
  VerifiedPersonalPublicationSnapshotSchema,
} from '@reader/shared-types';
import {
  normalizePublicLibraryDirectFilename,
  normalizePublicLibraryRelativePath,
  PUBLIC_LIBRARY_FILE_MAX_BYTES,
  PUBLIC_LIBRARY_PERSONAL_SNAPSHOT_MAX_BYTES,
  type PublicLibraryFileFields,
  type PublicLibraryListQuery,
  type PublicLibraryPersonalSnapshotFields,
  type PublicLibraryUpload,
} from './public-library.contract';
import {
  buildPublicLibraryFileCandidate,
  PublicLibraryFileCandidateError,
} from './public-library-file-candidate';
import {
  PublicLibraryBookNotFoundError,
  PublicLibraryCatalogMetadataStaleError,
  PublicLibraryDuplicateMetadataError,
  PublicLibraryRepository,
} from './public-library.repository';

export interface PublicLibraryUploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class PublicLibraryService {
  constructor(
    private readonly repository: PublicLibraryRepository,
    private readonly maintenanceKey = process.env
      .READER_PUBLIC_LIBRARY_MAINTENANCE_KEY ?? '',
    private readonly allowAnyMaintenance =
      process.env.READER_PUBLIC_LIBRARY_MAINTENANCE_ALLOW_ANY === '1',
  ) {}

  /** 无限制模式：仅入阁上传（publishFile）可跳过凭据校验，其余维护写操作（catalog 修改、个人快照等）始终要求口令。 */
  isAllowAnyMaintenance() {
    return this.allowAnyMaintenance;
  }

  assertMaintenanceKey(
    key: string | undefined,
    options?: { allowAny?: boolean },
  ) {
    if (options?.allowAny && this.allowAnyMaintenance) return;
    const expected = this.maintenanceKey.trim();
    if (!expected || expected.toLowerCase() === 'default') {
      throw new ServiceUnavailableException('公共馆藏维护写入尚未配置');
    }
    const actual = key?.trim() ?? '';
    const actualBytes = Buffer.from(actual);
    const expectedBytes = Buffer.from(expected);
    const matches =
      actualBytes.length === expectedBytes.length &&
      timingSafeEqual(actualBytes, expectedBytes);
    if (!actual || actual.toLowerCase() === 'default' || !matches) {
      throw new ForbiddenException('公共馆藏维护凭据无效');
    }
  }

  private async publishWithConflictBoundary<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PublicLibraryDuplicateMetadataError) {
        throw new ConflictException({
          code: error.code,
          existingBookId: error.existingBookId,
          message: '相同正文已在阁中，请通过目录维护调整元数据',
        });
      }
      throw error;
    }
  }

  async publish(key: string | undefined, input: PublicLibraryUpload) {
    this.assertMaintenanceKey(key);
    return this.publishWithConflictBoundary(() =>
      this.repository.publishTxt(input),
    );
  }

  async publishFile(
    key: string | undefined,
    fields: PublicLibraryFileFields,
    file: PublicLibraryUploadedFile,
  ) {
    this.assertMaintenanceKey(key, { allowAny: true });
    const filename = normalizePublicLibraryDirectFilename(file.originalname);
    if (
      !filename ||
      !Buffer.isBuffer(file.buffer) ||
      file.buffer.length === 0 ||
      file.buffer.length !== file.size ||
      file.size > PUBLIC_LIBRARY_FILE_MAX_BYTES
    ) {
      throw new BadRequestException('TXT 文件无效或超过 20 MiB');
    }
    try {
      const relativePath = fields.relativePath
        ? normalizePublicLibraryRelativePath(fields.relativePath)
        : filename;
      if (!relativePath || relativePath.split('/').at(-1) !== filename) {
        throw new PublicLibraryFileCandidateError(
          'PUBLIC_LIBRARY_RELATIVE_PATH_MISMATCH',
        );
      }
      const candidate = buildPublicLibraryFileCandidate({
        title: fields.title,
        author: fields.author,
        description: fields.description,
        category: fields.category,
        kind: 'browser_file',
        scope: relativePath.includes('/') ? 'browser-folder' : 'direct-upload',
        relativePath,
        bytes: file.buffer,
      });
      candidate.tagIds = fields.tagIds;
      return this.publishWithConflictBoundary(() =>
        this.repository.publishCandidateWithOutcome(candidate),
      );
    } catch (error) {
      if (error instanceof PublicLibraryFileCandidateError) {
        throw new BadRequestException(
          error.code === 'PUBLIC_LIBRARY_RELATIVE_PATH_MISMATCH'
            ? '文件夹相对路径与文件名不一致'
            : 'TXT 文件包含空章节、无法解析或没有可读正文',
        );
      }
      throw error;
    }
  }

  async publishPersonalSnapshot(
    key: string | undefined,
    fields: PublicLibraryPersonalSnapshotFields,
    file: PublicLibraryUploadedFile,
  ) {
    this.assertMaintenanceKey(key);
    if (
      file.originalname !== 'verified-personal-snapshot.json' ||
      file.mimetype !== 'application/json' ||
      !Buffer.isBuffer(file.buffer) ||
      file.buffer.length === 0 ||
      file.buffer.length !== file.size ||
      file.size > PUBLIC_LIBRARY_PERSONAL_SNAPSHOT_MAX_BYTES
    ) {
      throw new BadRequestException('个人云发布快照文件无效或过大');
    }
    let raw: unknown;
    try {
      const json = new TextDecoder('utf-8', { fatal: true }).decode(
        file.buffer,
      );
      raw = JSON.parse(json) as unknown;
    } catch {
      throw new BadRequestException('个人云发布快照不是严格 UTF-8 JSON');
    }
    const parsed = VerifiedPersonalPublicationSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException('个人云发布快照结构无效');
    }
    const snapshot = parsed.data;
    if (
      snapshot.chapters.length !== snapshot.book.chapterCount ||
      snapshot.chapters.some(
        (chapter, index) =>
          chapter.index !== index ||
          createHash('sha256').update(chapter.content).digest('hex') !==
            chapter.contentHash,
      )
    ) {
      throw new BadRequestException('个人云发布章节顺序或正文哈希无效');
    }
    const totalBytes = snapshot.chapters.reduce(
      (total, chapter) => total + Buffer.byteLength(chapter.content, 'utf8'),
      0,
    );
    if (totalBytes > PUBLIC_LIBRARY_FILE_MAX_BYTES) {
      throw new BadRequestException('个人云发布正文超过 20 MiB');
    }
    const descriptor = {
      schemaVersion: 1 as const,
      sourceRef: snapshot.sourceRef,
      book: snapshot.book,
      chapters: snapshot.chapters.map((chapter) => ({
        index: chapter.index,
        title: chapter.title,
        contentHash: chapter.contentHash,
      })),
    };
    const serialized =
      serializePersonalPublicationSnapshotDescriptor(descriptor);
    if (
      createHash('sha256').update(serialized).digest('hex') !==
      snapshot.snapshotHash
    ) {
      throw new BadRequestException('个人云发布快照代际哈希无效');
    }
    return this.publishWithConflictBoundary(() =>
      this.repository.publishCandidateWithOutcome({
        title: snapshot.book.title,
        author: snapshot.book.author,
        description: snapshot.book.description,
        category: fields.category,
        tagIds: fields.tagIds,
        source: {
          kind: 'personal_cloud',
          scope: 'personal-cloud',
          relativePath: `personal-${snapshot.sourceRef}.txt`,
          bytes: Buffer.from(serialized),
        },
        chapters: snapshot.chapters.map((chapter) => ({
          index: chapter.index,
          title: chapter.title,
          content: chapter.content,
        })),
        wordCount: snapshot.chapters.reduce(
          (total, chapter) => total + [...chapter.content].length,
          0,
        ),
      }),
    );
  }

  async list(query: PublicLibraryListQuery) {
    try {
      return await this.repository.list(query);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'PUBLIC_LIBRARY_CATALOG_SNAPSHOT_STALE'
      ) {
        throw new ConflictException({
          code: 'CATALOG_SNAPSHOT_STALE',
          message: '馆藏目录已更新，请从第一页重新载入',
        });
      }
      throw error;
    }
  }

  taxonomy() {
    return PUBLIC_LIBRARY_TAXONOMY_DTO;
  }

  async listFacets(query: PublicLibraryFacetQuery) {
    try {
      return await this.repository.listFacets(query);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'PUBLIC_LIBRARY_CATALOG_SNAPSHOT_STALE'
      ) {
        throw new ConflictException({
          code: 'CATALOG_SNAPSHOT_STALE',
          message: '馆藏目录已更新，请从第一页重新载入',
        });
      }
      throw error;
    }
  }

  async updateCatalog(
    key: string | undefined,
    id: string,
    patch: PublicLibraryCatalogPatch,
  ) {
    this.assertMaintenanceKey(key);
    try {
      return await this.repository.updateCatalog(id, patch);
    } catch (error) {
      if (error instanceof PublicLibraryBookNotFoundError) {
        throw new NotFoundException('公共藏书不存在');
      }
      if (error instanceof PublicLibraryCatalogMetadataStaleError) {
        throw new ConflictException({
          code: error.code,
          currentMetadataVersion: error.currentMetadataVersion,
          message: '馆藏元数据已更新，请重新载入后再修改',
        });
      }
      throw error;
    }
  }

  getPackage(id: string) {
    return this.repository.getPackage(id);
  }
}
