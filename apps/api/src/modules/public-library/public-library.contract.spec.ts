import {
  normalizePublicLibraryDirectFilename,
  normalizePublicLibraryRelativePath,
  publicLibraryCollectionPath,
  PUBLIC_LIBRARY_LEGACY_JSON_MAX_BYTES,
  PublicLibraryFileFieldsSchema,
  PublicLibraryUploadSchema,
} from './public-library.contract';
import {
  PublicLibraryCatalogPatchSchema,
  PublicLibraryFacetQuerySchema,
} from './public-library-catalog.contract';

describe('public library transport contracts', () => {
  it('bounds all F catalog pages to 24 and accepts only stable filter IDs', () => {
    expect(
      PublicLibraryFacetQuerySchema.parse({
        view: 'tags',
        page: '1',
        pageSize: '24',
        tagId: undefined,
      }),
    ).toMatchObject({ view: 'tags', page: 1, pageSize: 24 });
    expect(
      PublicLibraryFacetQuerySchema.safeParse({
        view: 'tags',
        page: 1,
        pageSize: 25,
      }).success,
    ).toBe(false);
  });

  it('requires a complete versioned overlay and rejects invalid tag sets', () => {
    const base = {
      metadataVersion: 1,
      categoryId: 'classics',
      collectionPath: '古籍/经部',
    };
    expect(
      PublicLibraryCatalogPatchSchema.parse({ ...base, tagIds: ['jing'] }),
    ).toEqual({ ...base, tagIds: ['jing'] });
    expect(
      PublicLibraryCatalogPatchSchema.safeParse({
        ...base,
        tagIds: ['jing', 'jing'],
      }).success,
    ).toBe(false);
    expect(
      PublicLibraryCatalogPatchSchema.safeParse({
        ...base,
        categoryId: 'unknown',
        tagIds: [],
      }).success,
    ).toBe(false);
  });

  it('coerces the explicit multipart rights confirmation only', () => {
    expect(
      PublicLibraryFileFieldsSchema.parse({
        category: '经典',
        rightsConfirmed: 'true',
      }),
    ).toEqual({ category: '经典', tagIds: [], rightsConfirmed: true });
    expect(
      PublicLibraryFileFieldsSchema.safeParse({
        category: '经典',
        rightsConfirmed: 'false',
      }).success,
    ).toBe(false);
  });

  it('normalizes a bounded relative TXT path and derives its collection', () => {
    expect(normalizePublicLibraryRelativePath('古籍/e\u0301/book.txt')).toBe(
      '古籍/é/book.txt',
    );
    expect(publicLibraryCollectionPath('古籍/经部/book.txt')).toBe('古籍');
    for (const invalid of [
      '../escape.txt',
      '/absolute.txt',
      'C:\\escape.txt',
      'folder\\mixed/file.txt',
      'folder//empty.txt',
      'folder/./dot.txt',
      'folder/../escape.txt',
      `folder/${'deep/'.repeat(12)}book.txt`,
      'folder/book.epub',
    ]) {
      expect(normalizePublicLibraryRelativePath(invalid)).toBeUndefined();
    }
  });

  it('keeps browser depth at 12 while allowing scanner paths through depth 32', () => {
    const pathAt = (depth: number) =>
      `${Array.from({ length: depth }, (_, index) => `d${index}`).join('/')}/book.txt`;
    expect(normalizePublicLibraryRelativePath(pathAt(13))).toBeUndefined();
    expect(normalizePublicLibraryRelativePath(pathAt(32), 32)).toBe(pathAt(32));
    expect(normalizePublicLibraryRelativePath(pathAt(33), 32)).toBeUndefined();
  });

  it('bounds the legacy JSON body by UTF-8 bytes, not only characters', () => {
    const multibyteContent = '藏'.repeat(
      Math.floor(PUBLIC_LIBRARY_LEGACY_JSON_MAX_BYTES / 3) + 1,
    );
    expect(
      PublicLibraryUploadSchema.safeParse({
        title: '超界',
        category: '经典',
        content: multibyteContent,
        rightsConfirmed: true,
      }).success,
    ).toBe(false);
  });

  it('normalizes safe direct filenames and rejects path/control forms', () => {
    expect(normalizePublicLibraryDirectFilename('藏书.TXT')).toBe('藏书.TXT');
    expect(normalizePublicLibraryDirectFilename('è\u0097\u008fä¹¦.txt')).toBe(
      '藏书.txt',
    );
    expect(normalizePublicLibraryDirectFilename('../藏书.txt')).toBeUndefined();
    expect(normalizePublicLibraryDirectFilename('   .txt')).toBeUndefined();
    expect(
      normalizePublicLibraryDirectFilename('line\nbreak.txt'),
    ).toBeUndefined();
  });
});
