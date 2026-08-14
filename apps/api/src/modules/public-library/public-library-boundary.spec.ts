import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('public library source boundary', () => {
  const moduleSource = readFileSync(
    join(__dirname, 'public-library.module.ts'),
    'utf8',
  );
  const controllerSource = readFileSync(
    join(__dirname, 'public-library.controller.ts'),
    'utf8',
  );

  it('does not import personal database, schema, repositories, or share-token decorator', () => {
    const source = `${moduleSource}\n${controllerSource}`;
    expect(source).not.toContain('DRIZZLE');
    expect(source).not.toContain('../database/schema');
    expect(source).not.toContain('BookRepository');
    expect(source).not.toContain('ChapterRepository');
    expect(source).not.toContain('FolderRepository');
    expect(source).not.toContain('ShareToken');
    expect(source).not.toContain('x-share-token');
    expect(source).toContain('x-public-library-maintenance-key');
  });
});
