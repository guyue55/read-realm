import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('public library source boundary', () => {
  const readProductionSource = (directory: string): string =>
    readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return readProductionSource(path);
        return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
          ? readFileSync(path, 'utf8')
          : [];
      })
      .join('\n');
  const productionSource = readProductionSource(__dirname);

  it('does not import personal database, schema, repositories, or share-token decorator', () => {
    expect(productionSource).not.toContain('DRIZZLE');
    expect(productionSource).not.toContain('../database/schema');
    expect(productionSource).not.toContain('BookRepository');
    expect(productionSource).not.toContain('ChapterRepository');
    expect(productionSource).not.toContain('FolderRepository');
    expect(productionSource).not.toContain('ShareToken');
    expect(productionSource).not.toContain('x-share-token');
    expect(productionSource).toContain('x-public-library-maintenance-key');
  });
});
