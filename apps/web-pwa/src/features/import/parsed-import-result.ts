import type { ParsedBook } from "@reader/parser-core";
import type { DurableImportTask } from "@reader/storage-core";
import type { Book, LocalChapter } from "@reader/shared-types";

export interface BuildParsedImportResultOptions {
  draft: DurableImportTask;
  parsedBook: ParsedBook;
  createId: () => string;
  now?: () => string;
}

export function buildParsedImportResult({
  draft,
  parsedBook,
  createId,
  now = () => new Date().toISOString(),
}: BuildParsedImportResultOptions): {
  bookMetadata: Book;
  chapters: LocalChapter[];
} {
  if (parsedBook.chapters.length === 0) {
    throw new Error("PARSED_IMPORT_EMPTY_BOOK");
  }
  const updatedAt = now();
  const chapters = parsedBook.chapters.map((chapter, index) => ({
    id: createId(),
    bookId: draft.bookMetadata.id,
    index,
    title: chapter.title?.trim() || `第 ${index + 1} 章`,
    content: chapter.content,
    wordCount: chapter.content.length,
    createdAt: draft.createdAt,
    updatedAt,
  }));
  return {
    bookMetadata: {
      ...draft.bookMetadata,
      title: parsedBook.title.trim() || draft.bookMetadata.title,
      chapterCount: chapters.length,
      wordCount: chapters.reduce((total, chapter) => total + chapter.content.length, 0),
      updatedAt,
    },
    chapters,
  };
}
