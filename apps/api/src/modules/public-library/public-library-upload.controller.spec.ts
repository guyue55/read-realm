import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PublicLibraryController } from './public-library.controller';
import {
  PublicLibraryMaintenanceGuard,
  PublicLibraryMaintenanceAllowAnyGuard,
} from './public-library-maintenance.guard';
import { PublicLibraryService } from './public-library.service';

function multipartWithRawFilename(filename: string) {
  const boundary = 'reading-world-public-library-boundary';
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="category"',
    '',
    '经典',
    `--${boundary}`,
    'Content-Disposition: form-data; name="rightsConfirmed"',
    '',
    'true',
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    'Content-Type: text/plain',
    '',
    '正文',
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return { boundary, body };
}

describe('PublicLibraryController multipart boundary', () => {
  let app: INestApplication<App>;
  const service = {
    assertMaintenanceKey: jest.fn((key: string | undefined) => {
      if (key !== 'configured-key') {
        throw new ForbiddenException('公共馆藏维护凭据无效');
      }
    }),
    publish: jest.fn(),
    publishFile: jest.fn(() =>
      Promise.resolve({ outcome: 'created', book: { id: 'public-file' } }),
    ),
    publishPersonalSnapshot: jest.fn(() =>
      Promise.resolve({ outcome: 'created', book: { id: 'public-personal' } }),
    ),
    list: jest.fn(),
    taxonomy: jest.fn(() => ({
      taxonomyVersion: 'public-library-taxonomy-v1',
      categories: [],
      tags: [],
    })),
    listFacets: jest.fn(() =>
      Promise.resolve({ items: [], page: 1, pageSize: 24 }),
    ),
    updateCatalog: jest.fn(() =>
      Promise.resolve({ id: 'public-file', metadataVersion: 2 }),
    ),
    getPackage: jest.fn(),
    isAllowAnyMaintenance: jest.fn(() => false),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicLibraryController],
      providers: [
        { provide: PublicLibraryService, useValue: service },
        PublicLibraryMaintenanceGuard,
        PublicLibraryMaintenanceAllowAnyGuard,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts exactly one bounded TXT file and parsed catalog fields', async () => {
    await request(app.getHttpServer())
      .post('/public-library/maintenance/files')
      .set('x-public-library-maintenance-key', 'configured-key')
      .field('category', '经典')
      .field('rightsConfirmed', 'true')
      .field('title', '浏览器直传')
      .attach('file', Buffer.from('第一章\n完整正文'), {
        filename: '藏书.txt',
        contentType: 'text/plain',
      })
      .expect(201)
      .expect({ outcome: 'created', book: { id: 'public-file' } });

    expect(service.publishFile).toHaveBeenCalledTimes(1);
    expect(service.publishFile).toHaveBeenCalledWith(
      'configured-key',
      {
        category: '经典',
        tagIds: [],
        rightsConfirmed: true,
        title: '浏览器直传',
      },
      expect.objectContaining({
        originalname: '藏书.txt',
        size: Buffer.byteLength('第一章\n完整正文'),
      }),
    );
  });

  it('serves anonymous taxonomy and bounded facets without either credential header', async () => {
    await request(app.getHttpServer())
      .get('/public-library/taxonomy')
      .expect(200)
      .expect('Content-Type', /json/u);
    await request(app.getHttpServer())
      .get('/public-library/facets?view=tags&page=1&pageSize=24')
      .expect(200);
    expect(service.listFacets).toHaveBeenCalledWith({
      view: 'tags',
      q: '',
      page: 1,
      pageSize: 24,
    });
  });

  it('guards and validates catalog overlay writes before the service call', async () => {
    const body = {
      metadataVersion: 1,
      categoryId: 'technology',
      tagIds: ['programming'],
      collectionPath: '工程',
    };
    await request(app.getHttpServer())
      .patch('/public-library/books/public-file/catalog')
      .send(body)
      .expect(403);
    expect(service.updateCatalog).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .patch('/public-library/books/public-file/catalog')
      .set('x-public-library-maintenance-key', 'configured-key')
      .send(body)
      .expect(200);
    expect(service.updateCatalog).toHaveBeenCalledWith(
      'configured-key',
      'public-file',
      body,
    );
  });

  it.each(['../escape.txt', 'C:\\escape.txt', 'folder/file.txt'])(
    'rejects the original multipart path %p instead of accepting its basename',
    async (filename) => {
      const multipart = multipartWithRawFilename(filename);
      await request(app.getHttpServer())
        .post('/public-library/maintenance/files')
        .set('x-public-library-maintenance-key', 'configured-key')
        .set(
          'Content-Type',
          `multipart/form-data; boundary=${multipart.boundary}`,
        )
        .send(Buffer.from(multipart.body))
        .expect(400);
      expect(service.publishFile).not.toHaveBeenCalled();
    },
  );

  it('runs maintenance authentication before multipart file filtering', async () => {
    await request(app.getHttpServer())
      .post('/public-library/maintenance/files')
      .set('x-public-library-maintenance-key', 'wrong')
      .field('category', '经典')
      .field('rightsConfirmed', 'true')
      .attach('file', Buffer.from('未授权流量'), 'not-a-txt.epub')
      .expect(403);
    expect(service.publishFile).not.toHaveBeenCalled();
  });

  it('accepts a safe folder relative path as catalog provenance', async () => {
    await request(app.getHttpServer())
      .post('/public-library/maintenance/files')
      .set('x-public-library-maintenance-key', 'configured-key')
      .field('category', '经典')
      .field('rightsConfirmed', 'true')
      .field('relativePath', '古籍/经部/folder-book.txt')
      .attach('file', Buffer.from('第一章\n文件夹正文'), 'folder-book.txt')
      .expect(201);
    expect(service.publishFile).toHaveBeenCalledWith(
      'configured-key',
      expect.objectContaining({
        relativePath: '古籍/经部/folder-book.txt',
      }),
      expect.objectContaining({ originalname: 'folder-book.txt' }),
    );
  });

  it.each(['../escape.txt', 'folder\\mixed/book.txt', 'folder//book.txt'])(
    'rejects unsafe relativePath field %p before the service writes',
    async (relativePath) => {
      await request(app.getHttpServer())
        .post('/public-library/maintenance/files')
        .set('x-public-library-maintenance-key', 'configured-key')
        .field('category', '经典')
        .field('rightsConfirmed', 'true')
        .field('relativePath', relativePath)
        .attach('file', Buffer.from('第一章\n正文'), 'book.txt')
        .expect(400);
      expect(service.publishFile).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['missing file', undefined, 'direct.txt'],
    ['non TXT file', Buffer.from('正文'), 'direct.epub'],
  ])('rejects %s before the service writes', async (_label, body, filename) => {
    const operation = request(app.getHttpServer())
      .post('/public-library/maintenance/files')
      .set('x-public-library-maintenance-key', 'configured-key')
      .field('category', '经典')
      .field('rightsConfirmed', 'true');
    if (body) operation.attach('file', body, filename);
    await operation.expect(400);
    expect(service.publishFile).not.toHaveBeenCalled();
  });

  it('rejects a file above 20 MiB before the service writes', async () => {
    await request(app.getHttpServer())
      .post('/public-library/maintenance/files')
      .set('x-public-library-maintenance-key', 'configured-key')
      .field('category', '经典')
      .field('rightsConfirmed', 'true')
      .attach('file', Buffer.alloc(20 * 1024 * 1024 + 1, 1), 'oversize.txt')
      .expect(413);
    expect(service.publishFile).not.toHaveBeenCalled();
  });

  it('rejects a second file instead of silently truncating the upload', async () => {
    await request(app.getHttpServer())
      .post('/public-library/maintenance/files')
      .set('x-public-library-maintenance-key', 'configured-key')
      .field('category', '经典')
      .field('rightsConfirmed', 'true')
      .attach('file', Buffer.from('第一本'), 'first.txt')
      .attach('file', Buffer.from('第二本'), 'second.txt')
      .expect(400);
    expect(service.publishFile).not.toHaveBeenCalled();
  });

  it('accepts a bounded personal snapshot only after maintenance authentication', async () => {
    const bytes = Buffer.from('{}');
    await request(app.getHttpServer())
      .post('/public-library/maintenance/personal-snapshots')
      .set('x-public-library-maintenance-key', 'configured-key')
      .field('category', '其他')
      .field('rightsConfirmed', 'true')
      .attach('snapshot', bytes, {
        filename: 'verified-personal-snapshot.json',
        contentType: 'application/json',
      })
      .expect(201);
    expect(service.publishPersonalSnapshot).toHaveBeenCalledWith(
      'configured-key',
      { category: '其他', tagIds: [], rightsConfirmed: true },
      expect.objectContaining({
        originalname: 'verified-personal-snapshot.json',
        size: bytes.length,
      }),
    );
  });

  it('rejects x-share-token-only personal publication before buffering the snapshot', async () => {
    await request(app.getHttpServer())
      .post('/public-library/maintenance/personal-snapshots')
      .set('x-share-token', 'configured-key')
      .field('category', '其他')
      .field('rightsConfirmed', 'true')
      .attach('snapshot', Buffer.from('unauthorized'), {
        filename: 'wrong.txt',
        contentType: 'text/plain',
      })
      .expect(403);
    expect(service.publishPersonalSnapshot).not.toHaveBeenCalled();
  });
});
