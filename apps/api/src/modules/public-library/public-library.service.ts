import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type {
  PublicLibraryListQuery,
  PublicLibraryUpload,
} from './public-library.contract';
import {
  PublicLibraryDuplicateMetadataError,
  PublicLibraryRepository,
} from './public-library.repository';

@Injectable()
export class PublicLibraryService {
  constructor(
    private readonly repository: PublicLibraryRepository,
    private readonly maintenanceKey = process.env
      .READER_PUBLIC_LIBRARY_MAINTENANCE_KEY ?? '',
  ) {}

  async publish(key: string | undefined, input: PublicLibraryUpload) {
    const expected = this.maintenanceKey.trim();
    if (!expected || expected.toLowerCase() === 'default') {
      throw new ServiceUnavailableException('公共馆藏维护写入尚未配置');
    }
    const actual = key?.trim() ?? '';
    const matches =
      actual.length === expected.length &&
      timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
    if (!actual || actual.toLowerCase() === 'default' || !matches) {
      throw new ForbiddenException('公共馆藏维护凭据无效');
    }
    try {
      return await this.repository.publishTxt(input);
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
