import { describe, it, expect } from 'vitest';
import { AppErrorCodeSchema, BookSchema } from './index';

describe('Shared Types', () => {
  it('should validate AppErrorCode', () => {
    expect(AppErrorCodeSchema.parse('FILE_TOO_LARGE')).toBe('FILE_TOO_LARGE');
    expect(() => AppErrorCodeSchema.parse('INVALID_ERROR')).toThrow();
  });

  it('should validate a valid Book', () => {
    const book = {
      id: 'book-1',
      title: 'Test Book',
      sourceType: 'upload',
      format: 'txt',
      status: 'reading',
      tags: [],
      chapterCount: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(BookSchema.parse(book).id).toBe('book-1');
  });
});
