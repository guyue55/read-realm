import {
  PUBLIC_LIBRARY_CATEGORIES,
  PUBLIC_LIBRARY_TAGS,
  PUBLIC_LIBRARY_TAXONOMY_VERSION,
  PublicLibraryCategoryIdSchema,
  PublicLibraryTagIdsSchema,
  publicLibraryCategoryById,
  publicLibraryCategoryByLabel,
  publicLibraryTagById,
  type PublicLibraryCategoryId,
  type PublicLibraryTagId,
} from '@reader/shared-types';

export {
  PUBLIC_LIBRARY_CATEGORIES,
  PUBLIC_LIBRARY_TAGS,
  PUBLIC_LIBRARY_TAXONOMY_VERSION,
  PublicLibraryCategoryIdSchema,
  PublicLibraryTagIdsSchema,
  publicLibraryCategoryById,
  publicLibraryCategoryByLabel,
  publicLibraryTagById,
};
export type { PublicLibraryCategoryId, PublicLibraryTagId };

export function requireCategoryIdFromLabel(label: string) {
  const category = publicLibraryCategoryByLabel(label);
  if (!category) throw new Error('PUBLIC_LIBRARY_CATEGORY_INVALID');
  return category.id;
}

export function requireCategory(id: unknown) {
  const parsed = PublicLibraryCategoryIdSchema.safeParse(id);
  if (!parsed.success) throw new Error('PUBLIC_LIBRARY_CATEGORY_INVALID');
  return publicLibraryCategoryById(parsed.data);
}

export function requireTagIds(ids: unknown) {
  const parsed = PublicLibraryTagIdsSchema.safeParse(ids);
  if (!parsed.success) throw new Error('PUBLIC_LIBRARY_TAGS_INVALID');
  return parsed.data;
}

export function tagDtos(ids: readonly PublicLibraryTagId[]) {
  const order = new Map(
    PUBLIC_LIBRARY_TAGS.map((tag, index) => [tag.id, index]),
  );
  return [...ids]
    .sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0))
    .map((id) => ({ id, label: publicLibraryTagById(id).label }));
}
