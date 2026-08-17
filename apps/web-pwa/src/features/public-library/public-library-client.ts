import { apiUrl } from "@/lib/api";
import {
  PUBLIC_LIBRARY_CATEGORIES,
  PUBLIC_LIBRARY_TAGS,
  PUBLIC_LIBRARY_TAXONOMY_VERSION,
  type PublicLibraryCategoryId,
  type PublicLibraryTagId,
} from "@reader/shared-types";

export const PUBLIC_LIBRARY_PAGE_SIZE = 24;

export interface PublicLibraryBook {
  id: string;
  title: string;
  author?: string;
  description?: string;
  format: "txt";
  taxonomyVersion?: typeof PUBLIC_LIBRARY_TAXONOMY_VERSION;
  categoryId?: PublicLibraryCategoryId;
  category: "文学" | "经典" | "思想" | "技术" | "其他";
  tags?: Array<{ id: PublicLibraryTagId; label: string }>;
  maintainerId?: string;
  maintainerLabel?: string;
  metadataVersion?: number;
  collectionPath?: string;
  chapterCount: number;
  wordCount: number;
  contentHash: string;
  publishedAt: string;
}

export interface PublicLibraryPackage {
  schemaVersion: 1;
  taxonomyVersion: typeof PUBLIC_LIBRARY_TAXONOMY_VERSION;
  book: PublicLibraryBook;
  chapters: Array<{
    id: string;
    index: number;
    title: string;
    content: string;
    contentHash: string;
  }>;
}

export class PublicLibraryCatalogStaleError extends Error {
  constructor() {
    super("PUBLIC_LIBRARY_CATALOG_SNAPSHOT_STALE");
    this.name = "PublicLibraryCatalogStaleError";
  }
}

export interface PublicLibraryFacet {
  id: string;
  label: string;
  bookCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePublicLibraryBook(value: unknown): PublicLibraryBook {
  if (!isRecord(value)) throw new Error("PUBLIC_LIBRARY_RESPONSE_INVALID");
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    (value.author !== undefined && typeof value.author !== "string") ||
    (value.description !== undefined &&
      typeof value.description !== "string") ||
    (value.collectionPath !== undefined &&
      typeof value.collectionPath !== "string") ||
    value.format !== "txt" ||
    value.taxonomyVersion !== PUBLIC_LIBRARY_TAXONOMY_VERSION ||
    typeof value.categoryId !== "string" ||
    !PUBLIC_LIBRARY_CATEGORIES.some(
      (category) =>
        category.id === value.categoryId && category.label === value.category,
    ) ||
    !Array.isArray(value.tags) ||
    value.tags.length > 5 ||
    new Set(value.tags.map((tag) => (isRecord(tag) ? tag.id : undefined)))
      .size !== value.tags.length ||
    value.tags.some(
      (tag) =>
        !isRecord(tag) ||
        typeof tag.id !== "string" ||
        !PUBLIC_LIBRARY_TAGS.some(
          (definition) =>
            definition.id === tag.id && definition.label === tag.label,
        ),
    ) ||
    typeof value.maintainerId !== "string" ||
    !value.maintainerId ||
    typeof value.maintainerLabel !== "string" ||
    !value.maintainerLabel ||
    !Number.isSafeInteger(value.metadataVersion) ||
    Number(value.metadataVersion) <= 0 ||
    !Number.isSafeInteger(value.chapterCount) ||
    Number(value.chapterCount) <= 0 ||
    !Number.isSafeInteger(value.wordCount) ||
    Number(value.wordCount) < 0 ||
    typeof value.contentHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.contentHash) ||
    typeof value.publishedAt !== "string"
  ) {
    throw new Error("PUBLIC_LIBRARY_RESPONSE_INVALID");
  }
  return value as unknown as PublicLibraryBook;
}

export class PublicLibraryApiClient {
  /** 拉取公开状态（无限制入阁开关），失败时按关闭处理（前端仍按口令判断）。 */
  async fetchStatus(): Promise<{ allowAny: boolean }> {
    try {
      const response = await fetch(apiUrl("/public-library/status"));
      if (!response.ok) return { allowAny: false };
      const payload: unknown = await response.json();
      if (
        isRecord(payload) &&
        isRecord((payload as { maintenance?: unknown }).maintenance) &&
        typeof (
          (payload as { maintenance: { allowAny?: unknown } }).maintenance
            .allowAny
        ) === "boolean"
      ) {
        return {
          allowAny: (
            payload as { maintenance: { allowAny: boolean } }
          ).maintenance.allowAny,
        };
      }
      return { allowAny: false };
    } catch {
      return { allowAny: false };
    }
  }

  async list(input: {
    q?: string;
    category?: string;
    categoryId?: PublicLibraryCategoryId;
    tagId?: PublicLibraryTagId;
    maintainerId?: string;
    page: number;
    pageSize: number;
    snapshotRevision?: number;
  }) {
    const params = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    });
    if (input.q) params.set("q", input.q);
    if (input.category) params.set("category", input.category);
    if (input.categoryId) params.set("categoryId", input.categoryId);
    if (input.tagId) params.set("tagId", input.tagId);
    if (input.maintainerId) params.set("maintainerId", input.maintainerId);
    if (input.snapshotRevision !== undefined) {
      params.set("snapshotRevision", String(input.snapshotRevision));
    }
    const response = await fetch(apiUrl(`/public-library/books?${params}`));
    if (response.status === 409) throw new PublicLibraryCatalogStaleError();
    if (!response.ok) throw new Error("PUBLIC_LIBRARY_UNAVAILABLE");
    const payload: unknown = await response.json();
    if (
      !isRecord(payload) ||
      !Array.isArray(payload.items) ||
      !Number.isSafeInteger(payload.page) ||
      !Number.isSafeInteger(payload.pageSize) ||
      !Number.isSafeInteger(payload.total) ||
      !Number.isSafeInteger(payload.totalPages) ||
      !Number.isSafeInteger(payload.snapshotRevision) ||
      Number(payload.snapshotRevision) < 0 ||
      Number(payload.total) < 0 ||
      Number(payload.totalPages) < 1 ||
      payload.page !== input.page ||
      payload.pageSize !== input.pageSize ||
      payload.pageSize > PUBLIC_LIBRARY_PAGE_SIZE ||
      payload.taxonomyVersion !== PUBLIC_LIBRARY_TAXONOMY_VERSION ||
      payload.items.length > PUBLIC_LIBRARY_PAGE_SIZE
    ) {
      throw new Error("PUBLIC_LIBRARY_RESPONSE_INVALID");
    }
    return {
      items: payload.items.map(parsePublicLibraryBook),
      page: Number(payload.page),
      pageSize: Number(payload.pageSize),
      total: Number(payload.total),
      totalPages: Number(payload.totalPages),
      snapshotRevision: Number(payload.snapshotRevision),
      taxonomyVersion: PUBLIC_LIBRARY_TAXONOMY_VERSION,
    };
  }

  async taxonomy() {
    const response = await fetch(apiUrl("/public-library/taxonomy"));
    if (!response.ok) throw new Error("PUBLIC_LIBRARY_UNAVAILABLE");
    const payload: unknown = await response.json();
    if (
      !isRecord(payload) ||
      payload.taxonomyVersion !== PUBLIC_LIBRARY_TAXONOMY_VERSION ||
      JSON.stringify(payload.categories) !==
        JSON.stringify(PUBLIC_LIBRARY_CATEGORIES) ||
      JSON.stringify(payload.tags) !== JSON.stringify(PUBLIC_LIBRARY_TAGS)
    ) {
      throw new Error("PUBLIC_LIBRARY_RESPONSE_INVALID");
    }
    return {
      taxonomyVersion: PUBLIC_LIBRARY_TAXONOMY_VERSION,
      categories: PUBLIC_LIBRARY_CATEGORIES,
      tags: PUBLIC_LIBRARY_TAGS,
    };
  }

  async listFacets(input: {
    view: "maintainers" | "categories" | "tags";
    q?: string;
    page: number;
    pageSize: number;
    snapshotRevision?: number;
  }) {
    const params = new URLSearchParams({
      view: input.view,
      page: String(input.page),
      pageSize: String(input.pageSize),
    });
    if (input.q) params.set("q", input.q);
    if (input.snapshotRevision !== undefined) {
      params.set("snapshotRevision", String(input.snapshotRevision));
    }
    const response = await fetch(apiUrl(`/public-library/facets?${params}`));
    if (response.status === 409) throw new PublicLibraryCatalogStaleError();
    if (!response.ok) throw new Error("PUBLIC_LIBRARY_UNAVAILABLE");
    const payload: unknown = await response.json();
    if (
      !isRecord(payload) ||
      payload.view !== input.view ||
      payload.page !== input.page ||
      payload.pageSize !== input.pageSize ||
      payload.pageSize > PUBLIC_LIBRARY_PAGE_SIZE ||
      payload.taxonomyVersion !== PUBLIC_LIBRARY_TAXONOMY_VERSION ||
      !Array.isArray(payload.items) ||
      payload.items.length > PUBLIC_LIBRARY_PAGE_SIZE ||
      !Number.isSafeInteger(payload.total) ||
      !Number.isSafeInteger(payload.totalPages) ||
      Number(payload.totalPages) < 1 ||
      !Number.isSafeInteger(payload.snapshotRevision) ||
      Number(payload.snapshotRevision) < 0 ||
      Number(payload.total) < 0
    ) {
      throw new Error("PUBLIC_LIBRARY_RESPONSE_INVALID");
    }
    const items = payload.items.map((item) => {
      if (
        !isRecord(item) ||
        typeof item.id !== "string" ||
        typeof item.label !== "string" ||
        !Number.isSafeInteger(item.bookCount) ||
        Number(item.bookCount) <= 0
      ) {
        throw new Error("PUBLIC_LIBRARY_RESPONSE_INVALID");
      }
      if (
        (input.view === "categories" &&
          !PUBLIC_LIBRARY_CATEGORIES.some(
            (category) =>
              category.id === item.id && category.label === item.label,
          )) ||
        (input.view === "tags" &&
          !PUBLIC_LIBRARY_TAGS.some(
            (tag) => tag.id === item.id && tag.label === item.label,
          ))
      ) {
        throw new Error("PUBLIC_LIBRARY_RESPONSE_INVALID");
      }
      return item as unknown as PublicLibraryFacet;
    });
    return {
      view: input.view,
      items,
      page: Number(payload.page),
      pageSize: Number(payload.pageSize),
      total: Number(payload.total),
      totalPages: Number(payload.totalPages),
      snapshotRevision: Number(payload.snapshotRevision),
      taxonomyVersion: PUBLIC_LIBRARY_TAXONOMY_VERSION,
    };
  }

  async getPackage(id: string): Promise<PublicLibraryPackage> {
    const response = await fetch(
      apiUrl(`/public-library/books/${encodeURIComponent(id)}/package`),
    );
    if (!response.ok) throw new Error("PUBLIC_LIBRARY_UNAVAILABLE");
    const payload: unknown = await response.json();
    if (
      !isRecord(payload) ||
      payload.schemaVersion !== 1 ||
      payload.taxonomyVersion !== PUBLIC_LIBRARY_TAXONOMY_VERSION ||
      !Array.isArray(payload.chapters)
    ) {
      throw new Error("PUBLIC_LIBRARY_PACKAGE_INVALID");
    }
    const book = parsePublicLibraryBook(payload.book);
    const chapters = payload.chapters.map((chapter) => {
      if (
        !isRecord(chapter) ||
        typeof chapter.id !== "string" ||
        !Number.isSafeInteger(chapter.index) ||
        typeof chapter.title !== "string" ||
        typeof chapter.content !== "string" ||
        typeof chapter.contentHash !== "string"
      ) {
        throw new Error("PUBLIC_LIBRARY_PACKAGE_INVALID");
      }
      return chapter as unknown as PublicLibraryPackage["chapters"][number];
    });
    return {
      schemaVersion: 1,
      taxonomyVersion: PUBLIC_LIBRARY_TAXONOMY_VERSION,
      book,
      chapters,
    };
  }
}

export const publicLibraryApiClient = new PublicLibraryApiClient();
