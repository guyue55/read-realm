import {
  normalizePublicLibraryDirectFilename,
  normalizePublicLibraryRelativePath,
  publicLibraryCollectionPath,
  PUBLIC_LIBRARY_LEGACY_JSON_MAX_BYTES,
  PublicLibraryFileFieldsSchema,
  PublicLibraryUploadSchema,
} from './public-library.contract';

describe('public library transport contracts', () => {
  it('coerces the explicit multipart rights confirmation only', () => {
    expect(
      PublicLibraryFileFieldsSchema.parse({
        category: '经典',
        rightsConfirmed: 'true',
      }),
    ).toEqual({ category: '经典', rightsConfirmed: true });
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
