import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { parseBody } from '../../common/request-boundary';
import {
  normalizePublicLibraryDirectFilename,
  PUBLIC_LIBRARY_FILE_MAX_BYTES,
  PUBLIC_LIBRARY_PERSONAL_SNAPSHOT_MAX_BYTES,
  PublicLibraryFileFieldsSchema,
  PublicLibraryListQuerySchema,
  PublicLibraryPersonalSnapshotFieldsSchema,
  PublicLibraryUploadSchema,
} from './public-library.contract';
import {
  type PublicLibraryUploadedFile,
  PublicLibraryService,
} from './public-library.service';
import { PublicLibraryMaintenanceGuard } from './public-library-maintenance.guard';

@Controller('public-library')
export class PublicLibraryController {
  constructor(private readonly service: PublicLibraryService) {}

  @Post('books')
  publish(
    @Headers('x-public-library-maintenance-key')
    maintenanceKey: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.publish(
      maintenanceKey,
      parseBody(PublicLibraryUploadSchema, body),
    );
  }

  @Get('books')
  list(@Query() query: unknown) {
    const parsed = PublicLibraryListQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException(parsed.error.issues[0]?.message);
    return this.service.list(parsed.data);
  }

  @Get('books/:id/package')
  getPackage(@Param('id') id: string) {
    return this.service.getPackage(id);
  }

  @Post('maintenance/files')
  @UseGuards(PublicLibraryMaintenanceGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      preservePath: true,
      limits: {
        fileSize: PUBLIC_LIBRARY_FILE_MAX_BYTES,
        files: 1,
        fields: 8,
        fieldSize: 16 * 1024,
      },
      fileFilter: (_request, file, callback) => {
        const valid = Boolean(
          normalizePublicLibraryDirectFilename(file.originalname),
        );
        callback(
          valid ? null : new BadRequestException('仅支持安全命名的 TXT 文件'),
          valid,
        );
      },
    }),
  )
  publishFile(
    @Headers('x-public-library-maintenance-key')
    maintenanceKey: string | undefined,
    @Body() body: unknown,
    @UploadedFile() file: PublicLibraryUploadedFile | undefined,
  ) {
    if (!file) throw new BadRequestException('请选择一个 TXT 文件');
    const normalizedFilename = normalizePublicLibraryDirectFilename(
      file.originalname,
    );
    if (!normalizedFilename) {
      throw new BadRequestException('仅支持安全命名的 TXT 文件');
    }
    const fields = PublicLibraryFileFieldsSchema.safeParse(body);
    if (!fields.success) {
      throw new BadRequestException(
        fields.error.issues[0]?.message ?? '上传字段不完整或格式不正确',
      );
    }
    return this.service.publishFile(maintenanceKey, fields.data, {
      ...file,
      originalname: normalizedFilename,
    });
  }

  @Post('maintenance/personal-snapshots')
  @UseGuards(PublicLibraryMaintenanceGuard)
  @UseInterceptors(
    FileInterceptor('snapshot', {
      limits: {
        fileSize: PUBLIC_LIBRARY_PERSONAL_SNAPSHOT_MAX_BYTES,
        files: 1,
        fields: 4,
        fieldSize: 16 * 1024,
      },
      fileFilter: (_request, file, callback) => {
        const valid =
          file.originalname === 'verified-personal-snapshot.json' &&
          file.mimetype === 'application/json';
        callback(
          valid ? null : new BadRequestException('个人云发布快照文件无效'),
          valid,
        );
      },
    }),
  )
  publishPersonalSnapshot(
    @Headers('x-public-library-maintenance-key')
    maintenanceKey: string | undefined,
    @Body() body: unknown,
    @UploadedFile() file: PublicLibraryUploadedFile | undefined,
  ) {
    if (!file) throw new BadRequestException('请选择个人云发布快照');
    const fields = PublicLibraryPersonalSnapshotFieldsSchema.safeParse(body);
    if (!fields.success) {
      throw new BadRequestException('个人云发布确认字段无效');
    }
    return this.service.publishPersonalSnapshot(
      maintenanceKey,
      fields.data,
      file,
    );
  }
}
