import { z } from 'zod';

export const PUBLIC_LIBRARY_CATEGORIES = [
  '文学',
  '经典',
  '思想',
  '技术',
  '其他',
] as const;

export const PublicLibraryUploadSchema = z.object({
  title: z.string().trim().min(1).max(240),
  author: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(PUBLIC_LIBRARY_CATEGORIES),
  content: z.string().min(1).max(20_000_000),
  rightsConfirmed: z.literal(true),
});

export const PublicLibraryListQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  category: z.enum(PUBLIC_LIBRARY_CATEGORIES).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(48).optional().default(24),
});

export type PublicLibraryUpload = z.infer<typeof PublicLibraryUploadSchema>;
export type PublicLibraryListQuery = z.infer<
  typeof PublicLibraryListQuerySchema
>;

export interface PublicLibraryBookDto {
  id: string;
  title: string;
  author?: string;
  description?: string;
  format: 'txt';
  category: (typeof PUBLIC_LIBRARY_CATEGORIES)[number];
  chapterCount: number;
  wordCount: number;
  contentHash: string;
  publishedAt: string;
}

export interface PublicLibraryPackage {
  schemaVersion: 1;
  book: PublicLibraryBookDto;
  chapters: Array<{
    id: string;
    index: number;
    title: string;
    content: string;
    contentHash: string;
  }>;
}
