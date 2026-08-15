import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { parseBody } from '../../common/request-boundary';
import { PublicLibraryMaintenanceGuard } from './public-library-maintenance.guard';
import {
  PublicLibraryScanIdSchema,
  PublicLibraryScanItemsQuerySchema,
  PublicLibraryStartScanSchema,
} from './public-library-scan.contract';
import { PublicLibraryScanAlreadyRunningError } from './public-library-scan.repository';
import type { PublicLibraryScanJob } from './public-library-scan.repository';
import {
  PublicLibraryScanner,
  PublicLibraryScanFailure,
} from './public-library-scanner';

function safeScanJob(job: PublicLibraryScanJob) {
  return {
    scanId: job.scanId,
    generation: job.generation,
    rootId: job.rootId,
    rootLabel: job.rootLabel,
    status: job.status,
    heartbeatAt: job.heartbeatAt,
    discoveredCount: job.discoveredCount,
    processedCount: job.processedCount,
    createdCount: job.createdCount,
    unchangedCount: job.unchangedCount,
    duplicateCount: job.duplicateCount,
    failedCount: job.failedCount,
    skippedCount: job.skippedCount,
    totalBytes: job.totalBytes,
    errorCode: job.errorCode,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    itemPage: job.itemPage,
    itemPageSize: job.itemPageSize,
    items: job.items.map(({ relativePath, outcome, errorCode }) => ({
      relativePath,
      outcome,
      errorCode,
    })),
  };
}

@Controller('public-library/maintenance')
@UseGuards(PublicLibraryMaintenanceGuard)
export class PublicLibraryScanController {
  constructor(private readonly scanner: PublicLibraryScanner) {}

  @Get('scan-roots')
  listRoots() {
    return {
      items: this.scanner.listRoots(),
      limits: this.scanner.getLimits(),
    };
  }

  @Post('scans')
  @HttpCode(202)
  async start(@Body() body: unknown) {
    const input = parseBody(PublicLibraryStartScanSchema, body);
    try {
      return safeScanJob(await this.scanner.start(input.rootId));
    } catch (error) {
      if (
        error instanceof PublicLibraryScanFailure &&
        error.code === 'SCAN_ROOT_NOT_FOUND'
      ) {
        throw new NotFoundException('维护目录不存在');
      }
      if (error instanceof PublicLibraryScanAlreadyRunningError) {
        throw new ConflictException({
          code: 'PUBLIC_LIBRARY_SCAN_ALREADY_RUNNING',
          message: '该维护目录正在扫描',
        });
      }
      if (error instanceof PublicLibraryScanFailure) {
        throw new ServiceUnavailableException({
          code: error.code,
          message: '维护目录当前不可扫描，请检查实例目录配置',
        });
      }
      throw error;
    }
  }

  @Get('scans/:scanId')
  async get(@Param('scanId') rawScanId: string, @Query() rawQuery: unknown) {
    const scanId = PublicLibraryScanIdSchema.safeParse(rawScanId);
    const query = PublicLibraryScanItemsQuerySchema.safeParse(rawQuery);
    if (!scanId.success || !query.success) {
      throw new BadRequestException('扫描任务参数无效');
    }
    const job = await this.scanner.getJob(
      scanId.data,
      query.data.page,
      query.data.pageSize,
    );
    if (!job) throw new NotFoundException('扫描任务不存在');
    return safeScanJob(job);
  }
}
