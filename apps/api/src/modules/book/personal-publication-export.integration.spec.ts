import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import * as schema from '../database/schema';
import { prepareDatabase } from '../database/database-bootstrap';
import {
  PersonalPublicationExportRepository,
  PersonalPublicationExportService,
} from './personal-publication-export.service';

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('personal publication export integration', () => {
  let client: Client;
  let root: string;
  let blobs: LocalFileBlobStorage;
  let service: PersonalPublicationExportService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'personal-publication-export-'));
    client = createClient({ url: `file:${join(root, 'personal.sqlite')}` });
    await prepareDatabase(client);
    const repository = new PersonalPublicationExportRepository(
      drizzle(client, { schema }),
    );
    blobs = new LocalFileBlobStorage(join(root, 'objects'));
    service = new PersonalPublicationExportService(repository, blobs);
  });

  afterEach(async () => {
    client.close();
    await rm(root, { recursive: true, force: true });
  });

  async function seed(token: string, contents: readonly string[]) {
    const bookId = `book-1#${token}`;
    await client.execute({
      sql: `INSERT INTO books (
        id,title,source_type,format,status,chapter_count,created_at,updated_at
      ) VALUES (?, '云上书', 'upload', 'txt', 'reading', ?, ?, ?)`,
      args: [
        bookId,
        contents.length,
        '2026-08-15T09:00:00.000Z',
        '2026-08-15T09:00:00.000Z',
      ],
    });
    for (const [index, content] of contents.entries()) {
      const contentHash = hash(content);
      await blobs.putObject(contentHash, content);
      await client.execute({
        sql: `INSERT INTO chapters (id,book_id,"index",title,content_hash,created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          `chapter-${index}#${token}`,
          bookId,
          index,
          `第${index + 1}章`,
          contentHash,
          '2026-08-15T09:00:00.000Z',
        ],
      });
    }
  }

  it('keeps token A and B source identities separate for the same raw book id', async () => {
    await seed('token-a', ['A甲', 'A乙']);
    await seed('token-b', ['B甲', 'B乙']);

    const pageA = await service.readPage({
      token: 'token-a',
      bookId: 'book-1',
      offset: 0,
      limit: 2,
      includeContent: true,
    });
    const pageB = await service.readPage({
      token: 'token-b',
      bookId: 'book-1',
      offset: 0,
      limit: 2,
      includeContent: true,
    });

    expect(
      pageA.items.map((item) => ('content' in item ? item.content : undefined)),
    ).toEqual(['A甲', 'A乙']);
    expect(
      pageB.items.map((item) => ('content' in item ? item.content : undefined)),
    ).toEqual(['B甲', 'B乙']);
    expect(pageA.sourceRef).not.toBe(pageB.sourceRef);
    expect(pageA.snapshotHash).not.toBe(pageB.snapshotHash);
  });

  it('freezes a verified receipt and rejects it after a process restart', async () => {
    await seed('token-a', ['旧甲', '旧乙']);
    const first = await service.readPage({
      token: 'token-a',
      bookId: 'book-1',
      offset: 0,
      limit: 1,
      includeContent: true,
    });
    const saltBefore = await client.execute(
      'SELECT scope_salt FROM personal_export_state WHERE id = 1',
    );
    const replacement = ['新甲', '新乙'];
    for (const [index, content] of replacement.entries()) {
      const contentHash = hash(content);
      await blobs.putObject(contentHash, content);
      await client.execute({
        sql: `UPDATE chapters SET content_hash = ?
          WHERE book_id = 'book-1#token-a' AND "index" = ?`,
        args: [contentHash, index],
      });
    }

    const frozen = await service.readPage({
      token: 'token-a',
      bookId: 'book-1',
      offset: 1,
      limit: 1,
      includeContent: true,
      expectedSnapshotHash: first.snapshotHash,
    });
    expect(frozen.items).toEqual([
      expect.objectContaining({ index: 1, content: '旧乙' }),
    ]);

    const restarted = new PersonalPublicationExportService(
      new PersonalPublicationExportRepository(drizzle(client, { schema })),
      blobs,
    );
    await expect(
      restarted.readPage({
        token: 'token-a',
        bookId: 'book-1',
        offset: 1,
        limit: 1,
        includeContent: true,
        expectedSnapshotHash: first.snapshotHash,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await prepareDatabase(client);
    const saltAfter = await client.execute(
      'SELECT scope_salt FROM personal_export_state WHERE id = 1',
    );
    expect(saltAfter.rows).toEqual(saltBefore.rows);
  });
});
