import { z } from 'zod';

export const PUBLIC_LIBRARY_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const PUBLIC_LIBRARY_LEGACY_JSON_MAX_BYTES = 8 * 1024 * 1024;

function decodeMultipartFilename(value: string) {
  const characters = [...value];
  if (
    characters.some((character) => (character.codePointAt(0) ?? 0) > 255) ||
    !characters.some((character) => (character.codePointAt(0) ?? 0) >= 128)
  ) {
    return value;
  }
  const sourceBytes = Buffer.from(value, 'latin1');
  const decoded = sourceBytes.toString('utf8');
  return decoded.includes('\uFFFD') ? value : decoded;
}

export function normalizePublicLibraryDirectFilename(value: string) {
  const filename = decodeMultipartFilename(value).normalize('NFC');
  const stem = filename.slice(0, -4).trim();
  const hasControlCharacter = [...filename].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });
  if (
    filename !== filename.trim() ||
    filename.length <= 4 ||
    filename.length > 255 ||
    !filename.toLowerCase().endsWith('.txt') ||
    !stem ||
    /^\.+$/.test(stem) ||
    hasControlCharacter ||
    /[/\\]/u.test(filename)
  ) {
    return undefined;
  }
  return filename;
}

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
  content: z
    .string()
    .min(1)
    .max(PUBLIC_LIBRARY_LEGACY_JSON_MAX_BYTES)
    .refine(
      (value) =>
        Buffer.byteLength(value, 'utf8') <=
        PUBLIC_LIBRARY_LEGACY_JSON_MAX_BYTES,
      '旧 JSON 兼容入口最多接收 8 MiB UTF-8 TXT',
    ),
  rightsConfirmed: z.literal(true),
});

export const PublicLibraryFileFieldsSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  author: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(PUBLIC_LIBRARY_CATEGORIES),
  rightsConfirmed: z
    .union([z.literal('true'), z.literal(true)])
    .transform(() => true as const),
});

export const PublicLibraryListQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  category: z.enum(PUBLIC_LIBRARY_CATEGORIES).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(48).optional().default(24),
  snapshotRevision: z.coerce.number().int().nonnegative().optional(),
});

export type PublicLibraryUpload = z.infer<typeof PublicLibraryUploadSchema>;
export type PublicLibraryFileFields = z.infer<
  typeof PublicLibraryFileFieldsSchema
>;
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
