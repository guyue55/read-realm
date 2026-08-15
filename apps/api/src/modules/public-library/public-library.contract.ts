import { z } from 'zod';
import {
  PublicLibraryCategoryIdSchema,
  PublicLibraryTagIdSchema,
  PublicLibraryTagIdsSchema,
  type PublicLibraryCategoryId,
  type PublicLibraryTagId,
} from '@reader/shared-types';
import { PUBLIC_LIBRARY_PAGE_SIZE } from './public-library-catalog.contract';

export const PUBLIC_LIBRARY_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const PUBLIC_LIBRARY_PERSONAL_SNAPSHOT_MAX_BYTES = 24 * 1024 * 1024;
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

export function normalizePublicLibraryRelativePath(
  value: string,
  maxDirectoryDepth = 12,
) {
  const normalized = value.normalize('NFC');
  const hasControlCharacter = [...normalized].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });
  if (
    normalized !== normalized.trim() ||
    normalized.length === 0 ||
    normalized.length > 1024 ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/u.test(normalized) ||
    normalized.includes('\\') ||
    hasControlCharacter
  ) {
    return undefined;
  }
  const segments = normalized.split('/');
  if (
    segments.length > maxDirectoryDepth + 1 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment !== segment.trim() ||
        segment.length > 255,
    ) ||
    !normalizePublicLibraryDirectFilename(segments.at(-1) ?? '')
  ) {
    return undefined;
  }
  return segments.join('/');
}

export function publicLibraryCollectionPath(relativePath: string) {
  const segments = relativePath.split('/');
  return segments.length > 1 ? (segments[0] ?? '') : '';
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
  tagIds: PublicLibraryTagIdsSchema.optional().default([]),
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
  tagIds: z
    .preprocess((value) => {
      if (value === undefined || value === '') return [];
      if (Array.isArray(value)) return value as unknown;
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    }, PublicLibraryTagIdsSchema)
    .optional()
    .default([]),
  relativePath: z
    .string()
    .max(1024)
    .refine(
      (value) => Boolean(normalizePublicLibraryRelativePath(value)),
      '文件夹相对路径无效',
    )
    .optional(),
  rightsConfirmed: z
    .union([z.literal('true'), z.literal(true)])
    .transform(() => true as const),
});

export const PublicLibraryListQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  category: z.enum(PUBLIC_LIBRARY_CATEGORIES).optional(),
  categoryId: PublicLibraryCategoryIdSchema.optional(),
  tagId: PublicLibraryTagIdSchema.optional(),
  maintainerId: z.string().trim().min(1).max(64).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(PUBLIC_LIBRARY_PAGE_SIZE)
    .optional()
    .default(PUBLIC_LIBRARY_PAGE_SIZE),
  snapshotRevision: z.coerce.number().int().nonnegative().optional(),
});

type WithOptionalTags<T extends { tagIds: PublicLibraryTagId[] }> = Omit<
  T,
  'tagIds'
> & { tagIds?: PublicLibraryTagId[] };

export type PublicLibraryUpload = WithOptionalTags<
  z.output<typeof PublicLibraryUploadSchema>
>;
export type PublicLibraryFileFields = WithOptionalTags<
  z.output<typeof PublicLibraryFileFieldsSchema>
>;

export const PublicLibraryPersonalSnapshotFieldsSchema = z.object({
  category: z.enum(PUBLIC_LIBRARY_CATEGORIES),
  tagIds: z
    .preprocess((value) => {
      if (value === undefined || value === '') return [];
      if (Array.isArray(value)) return value as unknown;
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    }, PublicLibraryTagIdsSchema)
    .optional()
    .default([]),
  rightsConfirmed: z
    .union([z.literal('true'), z.literal(true)])
    .transform(() => true as const),
});

export type PublicLibraryPersonalSnapshotFields = WithOptionalTags<
  z.output<typeof PublicLibraryPersonalSnapshotFieldsSchema>
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
  taxonomyVersion: 'public-library-taxonomy-v1';
  categoryId: PublicLibraryCategoryId;
  tags: Array<{ id: PublicLibraryTagId; label: string }>;
  maintainerId: string;
  maintainerLabel: string;
  metadataVersion: number;
  collectionPath?: string;
  chapterCount: number;
  wordCount: number;
  contentHash: string;
  publishedAt: string;
}

export interface PublicLibraryPackage {
  schemaVersion: 1;
  taxonomyVersion: 'public-library-taxonomy-v1';
  book: PublicLibraryBookDto;
  chapters: Array<{
    id: string;
    index: number;
    title: string;
    content: string;
    contentHash: string;
  }>;
}
