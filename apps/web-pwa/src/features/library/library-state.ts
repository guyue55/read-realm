import {
  ReadingProgressSchema,
  type Book,
  type ReadingProgress,
} from "@reader/shared-types";

function timestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function selectContinueBook(
  books: readonly Book[],
  progressByBookId: ReadonlyMap<string, ReadingProgress>,
): Book | null {
  let selected: Book | null = null;
  let selectedAt = -1;

  for (const book of books) {
    const candidate = progressByBookId.get(book.id);
    const parsed = ReadingProgressSchema.safeParse(candidate);
    if (!parsed.success || parsed.data.bookId !== book.id) continue;

    const readAt = Math.max(
      timestamp(book.lastReadAt),
      timestamp(parsed.data.updatedAt),
    );
    if (readAt > selectedAt) {
      selected = book;
      selectedAt = readAt;
    }
  }

  return selected;
}

export function getLibraryEmptyState(
  books: readonly Book[],
): "empty" | "ready" {
  return books.length === 0 ? "empty" : "ready";
}
