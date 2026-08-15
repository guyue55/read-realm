import { apiUrl } from "@/lib/api";

export interface PublicLibraryBook {
  id: string;
  title: string;
  author?: string;
  description?: string;
  format: "txt";
  category: "文学" | "经典" | "思想" | "技术" | "其他";
  collectionPath?: string;
  chapterCount: number;
  wordCount: number;
  contentHash: string;
  publishedAt: string;
}

export interface PublicLibraryPackage {
  schemaVersion: 1;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePublicLibraryBook(value: unknown): PublicLibraryBook {
  if (!isRecord(value)) throw new Error("PUBLIC_LIBRARY_RESPONSE_INVALID");
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    (value.collectionPath !== undefined &&
      typeof value.collectionPath !== "string") ||
    value.format !== "txt" ||
    !["文学", "经典", "思想", "技术", "其他"].includes(
      String(value.category),
    ) ||
    !Number.isSafeInteger(value.chapterCount) ||
    Number(value.chapterCount) <= 0 ||
    !Number.isSafeInteger(value.wordCount) ||
    typeof value.contentHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.contentHash) ||
    typeof value.publishedAt !== "string"
  ) {
    throw new Error("PUBLIC_LIBRARY_RESPONSE_INVALID");
  }
  return value as unknown as PublicLibraryBook;
}

export class PublicLibraryApiClient {
  async list(input: {
    q?: string;
    category?: string;
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
      payload.items.length > 48
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
    return { schemaVersion: 1, book, chapters };
  }
}

export const publicLibraryApiClient = new PublicLibraryApiClient();
