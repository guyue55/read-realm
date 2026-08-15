import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PublicLibraryMaintenanceGuard } from './public-library-maintenance.guard';
import { PublicLibraryScanController } from './public-library-scan.controller';
import { PublicLibraryScanner } from './public-library-scanner';
import { PublicLibraryService } from './public-library.service';

describe('PublicLibraryScanController', () => {
  let app: INestApplication<App>;
  const scanJob = {
    scanId: '3caac92c-5a53-4c0b-8da0-0cb37d2c8428',
    generation: 1,
    rootId: 'classics',
    rootLabel: '古籍目录',
    status: 'running',
    heartbeatAt: '2026-08-15T08:50:00.000Z',
    discoveredCount: 0,
    processedCount: 0,
    createdCount: 0,
    unchangedCount: 0,
    duplicateCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalBytes: 0,
    startedAt: '2026-08-15T08:50:00.000Z',
    items: [],
    itemPage: 1,
    itemPageSize: 50,
  };
  const scanner = {
    listRoots: jest.fn(() => [{ rootId: 'classics', label: '古籍目录' }]),
    getLimits: jest.fn(() => ({
      maxDepth: 32,
      maxFiles: 5000,
      maxFileBytes: 20 * 1024 * 1024,
      maxTotalBytes: 2 * 1024 * 1024 * 1024,
    })),
    start: jest.fn(() => Promise.resolve(scanJob)),
    getJob: jest.fn(() =>
      Promise.resolve({
        ...scanJob,
        status: 'completed',
        leaseOwner: 'must-not-leak',
        configFingerprint: 'must-not-leak',
        items: [
          {
            relativePath: '古籍/book.txt',
            sourceHash: 'must-not-leak',
            bookId: 'must-not-leak',
            outcome: 'created',
          },
        ],
      }),
    ),
  };
  const maintenance = {
    assertMaintenanceKey: jest.fn((key: string | undefined) => {
      if (key !== 'configured-key') {
        throw new ForbiddenException('公共馆藏维护凭据无效');
      }
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicLibraryScanController],
      providers: [
        { provide: PublicLibraryScanner, useValue: scanner },
        { provide: PublicLibraryService, useValue: maintenance },
        PublicLibraryMaintenanceGuard,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => app.close());

  it('returns only safe root summaries and bounded limits', async () => {
    const response = await request(app.getHttpServer())
      .get('/public-library/maintenance/scan-roots')
      .set('x-public-library-maintenance-key', 'configured-key')
      .expect(200);
    expect(response.body).toMatchObject({
      items: [{ rootId: 'classics', label: '古籍目录' }],
      limits: { maxDepth: 32, maxFiles: 5000 },
    });
    expect(JSON.stringify(response.body)).not.toContain('/Users/');
    expect(JSON.stringify(response.body)).not.toContain('leaseOwner');
  });

  it.each([
    ['missing', undefined, undefined],
    ['default', 'default', undefined],
    ['wrong', 'wrong', undefined],
    ['personal header only', undefined, 'configured-key'],
  ])(
    'rejects %s credentials before parsing the scan body',
    async (_label, key, share) => {
      const operation = request(app.getHttpServer())
        .post('/public-library/maintenance/scans')
        .send({ rootId: '../escape', rightsConfirmed: false });
      if (key) operation.set('x-public-library-maintenance-key', key);
      if (share) operation.set('x-share-token', share);
      await operation.expect(403);
      expect(scanner.start).not.toHaveBeenCalled();
    },
  );

  it('starts and reads a scan without accepting a host path', async () => {
    await request(app.getHttpServer())
      .post('/public-library/maintenance/scans')
      .set('x-public-library-maintenance-key', 'configured-key')
      .send({ rootId: 'classics', rightsConfirmed: true })
      .expect(202);
    expect(scanner.start).toHaveBeenCalledWith('classics');

    const response = await request(app.getHttpServer())
      .get(
        '/public-library/maintenance/scans/3caac92c-5a53-4c0b-8da0-0cb37d2c8428?page=1&pageSize=25',
      )
      .set('x-public-library-maintenance-key', 'configured-key')
      .expect(200);
    expect(scanner.getJob).toHaveBeenCalledWith(
      '3caac92c-5a53-4c0b-8da0-0cb37d2c8428',
      1,
      25,
    );
    const responseBody = response.body as {
      items: Array<{ relativePath: string; outcome: string }>;
    };
    expect(responseBody.items).toEqual([
      { relativePath: '古籍/book.txt', outcome: 'created' },
    ]);
    expect(JSON.stringify(response.body)).not.toContain('must-not-leak');
  });
});
