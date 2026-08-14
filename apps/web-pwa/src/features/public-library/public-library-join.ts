import { createId, type Book, type LocalChapter } from "@reader/shared-types";
import type { PublicLibraryPackage } from "./public-library-client";

export interface PublicLibraryJoinApi {
  getPackage(id: string): Promise<PublicLibraryPackage>;
}

export interface PublicLibraryJoinLocalPort {
  apply(input: { book: Book; chapters: LocalChapter[] }): Promise<void>;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export class PublicLibraryJoinService {
  constructor(
    private readonly api: PublicLibraryJoinApi,
    private readonly local: PublicLibraryJoinLocalPort,
    private readonly newId: () => string = createId,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async join(publicBookId: string) {
    const bundle = await this.api.getPackage(publicBookId);
    if (
      bundle.book.id !== publicBookId ||
      bundle.book.chapterCount !== bundle.chapters.length ||
      bundle.chapters.length === 0
    ) {
      throw new Error("PUBLIC_LIBRARY_PACKAGE_INVALID");
    }
    for (const [index, chapter] of bundle.chapters.entries()) {
      if (
        chapter.index !== index ||
        !chapter.content ||
        (await sha256(chapter.content)) !== chapter.contentHash
      ) {
        throw new Error("PUBLIC_LIBRARY_PACKAGE_INVALID");
      }
    }
    const localBookId = this.newId();
    const timestamp = this.now();
    const book: Book = {
      id: localBookId,
      title: bundle.book.title,
      author: bundle.book.author,
      description: bundle.book.description,
      sourceType: "cloud_cache",
      format: "txt",
      status: "to_read",
      tags: [bundle.book.category],
      chapterCount: bundle.chapters.length,
      wordCount: bundle.book.wordCount,
      cacheStatus: "chapters_full",
      sourceAvailability: "full_cached",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const chapters: LocalChapter[] = bundle.chapters.map((chapter) => ({
      id: `${localBookId}-chapter-${chapter.index}`,
      bookId: localBookId,
      index: chapter.index,
      title: chapter.title,
      content: chapter.content,
    }));
    await this.local.apply({ book, chapters });
    return { localBookId, chapterCount: chapters.length };
  }
}
