import { z } from 'zod';

export const AppErrorCodeSchema = z.enum([
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FORMAT',
  'ENCODING_DETECT_FAILED',
  'CHAPTER_PARSE_FAILED',
  'EPUB_PARSE_FAILED',
  'URL_CORS_BLOCKED',
  'URL_DYNAMIC_RENDER_REQUIRED',
  'SOURCE_RATE_LIMITED',
  'AI_QUOTA_EXCEEDED',
  'SYNC_CONFLICT',
  'STORAGE_QUOTA_EXCEEDED',
  'NETWORK_OFFLINE',
  'TASK_TIMEOUT',
  'TASK_CANCELLED'
]);

export type AppErrorCode = z.infer<typeof AppErrorCodeSchema>;

export const BookSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string().optional(),
  cover: z.string().optional(),
  description: z.string().optional(),
  sourceType: z.enum(['upload', 'url', 'search', 'bookSource', 'manual']),
  sourceUrl: z.string().optional(),
  format: z.enum(['txt', 'epub', 'html', 'md', 'pdf', 'docx', 'mobi', 'azw3']),
  status: z.enum(['reading', 'finished', 'dropped', 'to_read']),
  tags: z.array(z.string()),
  chapterCount: z.number(),
  wordCount: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastReadAt: z.string().optional()
});

export type Book = z.infer<typeof BookSchema>;
