import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { parseTxtBook } from '@reader/parser-core/txt-parser';
import { timingSafeEqual } from 'node:crypto';
import {
  normalizePublicLibraryDirectFilename,
  PUBLIC_LIBRARY_FILE_MAX_BYTES,
  type PublicLibraryBookDto,
  type PublicLibraryFileFields,
  type PublicLibraryListQuery,
  type PublicLibraryUpload,
} from './public-library.contract';
import {
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
  ) {}

  assertMaintenanceKey(key: string | undefined) {
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

  private async publishWithConflictBoundary(
    operation: () => Promise<PublicLibraryBookDto>,
  ) {
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
    this.assertMaintenanceKey(key);
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
    let parsed: ReturnType<typeof parseTxtBook>;
    try {
      parsed = parseTxtBook(filename, Uint8Array.from(file.buffer).buffer);
    } catch {
      throw new BadRequestException('TXT 文件无法解析');
    }
    if (
      parsed.chapters.length === 0 ||
      parsed.chapters.some((chapter) => !chapter.content)
    ) {
      throw new BadRequestException('TXT 文件包含空章节或没有可读正文');
    }
    const title = fields.title ?? parsed.title.trim();
    if (!title) throw new BadRequestException('书名不能为空');
    return this.publishWithConflictBoundary(() =>
      this.repository.publishCandidate({
        title,
        author: fields.author,
        description: fields.description,
        category: fields.category,
        source: {
          kind: 'browser_file',
          scope: 'direct-upload',
          relativePath: filename,
          bytes: Buffer.from(file.buffer),
        },
        chapters: parsed.chapters,
        wordCount: parsed.chapters.reduce(
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

  getPackage(id: string) {
    return this.repository.getPackage(id);
  }
}
