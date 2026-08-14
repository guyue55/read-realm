import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type {
  PublicLibraryListQuery,
  PublicLibraryUpload,
} from './public-library.contract';
import { PublicLibraryRepository } from './public-library.repository';

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
    return this.repository.publishTxt(input);
  }

  list(query: PublicLibraryListQuery) {
    return this.repository.list(query);
  }

  getPackage(id: string) {
    return this.repository.getPackage(id);
  }
}
