import { BadRequestException } from '@nestjs/common';
import {
  isScopedToShare,
  normalizeShareToken,
  stripScopedId,
  AIAnalyzeBodySchema,
} from './request-boundary';

describe('request-boundary', () => {
  it('should normalize empty share token to default and keep Chinese tokens', () => {
    expect(normalizeShareToken(undefined)).toBe('default');
    expect(normalizeShareToken('  松风阅心-1234  ')).toBe('松风阅心-1234');
  });

  it('should reject unsafe share token characters', () => {
    expect(() => normalizeShareToken('%')).toThrow(BadRequestException);
    expect(() => normalizeShareToken('friend#other')).toThrow(
      BadRequestException,
    );
    expect(() => normalizeShareToken('friend/other')).toThrow(
      BadRequestException,
    );
  });

  it('should match scoped ids without wildcard broadening', () => {
    expect(isScopedToShare('book-1#friend', 'friend')).toBe(true);
    expect(isScopedToShare('book-1#friendship', 'friend')).toBe(false);
    expect(stripScopedId('book-1#friend')).toBe('book-1');
  });

  it('should reject unknown AI reading intents', () => {
    expect(() =>
      AIAnalyzeBodySchema.parse({ bookId: 'book-1', chapterIndex: 0, intent: 'rewrite' }),
    ).toThrow();
  });
});
