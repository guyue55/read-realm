import { describe, it, expect } from 'vitest';
import {
  AppErrorCodeSchema,
  BookSchema,
  ReadingProgressSchema,
  ReaderSettingsSchema,
} from './index';

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

describe('Shared Types Extensions', () => {
  it('should validate ReadingProgress', () => {
    const progress = {
      bookId: 'book-1',
      chapterId: 'chap-1',
      chapterIndex: 0,
      offset: 150,
      percentage: 0.25,
      updatedAt: new Date().toISOString()
    };
    expect(ReadingProgressSchema.parse(progress).chapterIndex).toBe(0);
  });

  it('should validate ReaderSettings', () => {
    const settings = {
      fontFamily: 'sans-serif',
      fontSize: 18,
      lineHeight: 1.6,
      theme: 'paper'
    };
    expect(ReaderSettingsSchema.parse(settings).theme).toBe('paper');
  });
});
