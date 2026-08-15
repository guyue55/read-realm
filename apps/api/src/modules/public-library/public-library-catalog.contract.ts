import { z } from 'zod';
import {
  PUBLIC_LIBRARY_CATEGORIES,
  PUBLIC_LIBRARY_TAGS,
  PUBLIC_LIBRARY_TAXONOMY_VERSION,
  PublicLibraryCategoryIdSchema,
  PublicLibraryTagIdsSchema,
} from '@reader/shared-types';

export const PUBLIC_LIBRARY_PAGE_SIZE = 24;

export function normalizePublicLibraryCollectionPath(value: string) {
  const normalized = value.normalize('NFC');
  if (!normalized) return '';
  const hasControl = [...normalized].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });
  const segments = normalized.split('/');
  if (
    normalized !== normalized.trim() ||
    normalized.length > 1024 ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/u.test(normalized) ||
    normalized.includes('\\') ||
    hasControl ||
    segments.length > 12 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment !== segment.trim() ||
        segment.length > 255,
    )
  ) {
    return undefined;
  }
  return segments.join('/');
}

export const PublicLibraryCatalogPatchSchema = z.object({
  metadataVersion: z.number().int().positive(),
  categoryId: PublicLibraryCategoryIdSchema,
  tagIds: PublicLibraryTagIdsSchema,
  collectionPath: z
    .string()
    .max(1024)
    .refine(
      (value) => normalizePublicLibraryCollectionPath(value) === value,
      '藏书路径无效',
    ),
});

export const PublicLibraryFacetQuerySchema = z.object({
  view: z.enum(['maintainers', 'categories', 'tags']),
  q: z
    .string()
    .trim()
    .max(120)
    .transform((value) => value.normalize('NFKC'))
    .optional()
    .default(''),
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

export type PublicLibraryCatalogPatch = z.infer<
  typeof PublicLibraryCatalogPatchSchema
>;
export type PublicLibraryFacetQuery = z.infer<
  typeof PublicLibraryFacetQuerySchema
>;

export const PUBLIC_LIBRARY_TAXONOMY_DTO = Object.freeze({
  taxonomyVersion: PUBLIC_LIBRARY_TAXONOMY_VERSION,
  categories: PUBLIC_LIBRARY_CATEGORIES,
  tags: PUBLIC_LIBRARY_TAGS,
});
