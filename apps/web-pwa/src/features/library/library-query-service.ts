import {
  ReadingProgressSchema,
  type Book,
  type LibraryFolder,
  type ReadingProgress,
} from "@reader/shared-types";

export type LibrarySort = "title" | "recent";

export interface RawLibrarySnapshot {
  books: readonly Book[];
  folders: readonly LibraryFolder[];
  progress: readonly ReadingProgress[];
  cachedBookIds: readonly string[];
  totalNotesCount: number;
}

export interface LibraryQueryPort {
  readSnapshot(): Promise<RawLibrarySnapshot>;
  readSyncInventory(): Promise<{
    books: readonly Book[];
    folders: readonly LibraryFolder[];
  }>;
}

export interface LibraryShelfSnapshot {
  books: Book[];
  folders: LibraryFolder[];
  progressByBookId: Record<string, ReadingProgress>;
  cachedBookIds: Set<string>;
  totalNotesCount: number;
}

function timestamp(book: Book): number {
  const parsed = Date.parse(book.lastReadAt ?? book.updatedAt ?? book.createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function sortLibraryBooks(
  books: readonly Book[],
  sortBy: LibrarySort,
): Book[] {
  return [...books].sort((left, right) => {
    if (sortBy === "title") {
      return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
    }
    return timestamp(right) - timestamp(left) || left.id.localeCompare(right.id);
  });
}

export function mergeLibraryBooks(
  localBooks: readonly Book[],
  cloudBooks: readonly Book[],
  sortBy: LibrarySort,
): Book[] {
  const mergedById = new Map(localBooks.map((book) => [book.id, book]));
  for (const book of cloudBooks) {
    if (!mergedById.has(book.id)) mergedById.set(book.id, book);
  }
  return sortLibraryBooks([...mergedById.values()], sortBy);
}

export interface LibraryRenderPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
}

export function paginateLibraryItems<T>(
  sourceItems: readonly T[],
  requestedPage: number,
  requestedPageSize = 60,
): LibraryRenderPage<T> {
  const pageSize = Math.max(1, Math.floor(requestedPageSize));
  const totalItems = sourceItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(
    totalPages,
    Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1),
  );
  const startIndex = (page - 1) * pageSize;
  const items = sourceItems.slice(startIndex, startIndex + pageSize);
  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages,
    rangeStart: totalItems === 0 ? 0 : startIndex + 1,
    rangeEnd: startIndex + items.length,
  };
}

export function paginateLibraryBooks(
  books: readonly Book[],
  requestedPage: number,
  requestedPageSize = 60,
): LibraryRenderPage<Book> {
  return paginateLibraryItems(books, requestedPage, requestedPageSize);
}

export function countLibraryBooksByFolder(
  books: readonly Book[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const book of books) {
    if (!book.sourceFolderId) continue;
    counts.set(book.sourceFolderId, (counts.get(book.sourceFolderId) ?? 0) + 1);
  }
  return counts;
}

export function filterMergedLibraryBooksByFolder({
  mergedBooks,
  folders,
  currentFolderId,
}: {
  mergedBooks: readonly Book[];
  folders: readonly LibraryFolder[];
  currentFolderId: string | undefined;
}): Book[] {
  const knownFolders = new Set(folders.map((folder) => folder.id));
  return mergedBooks.filter((book) => {
    if (currentFolderId !== undefined) {
      return book.sourceFolderId === currentFolderId;
    }
    return !book.sourceFolderId || !knownFolders.has(book.sourceFolderId);
  });
}

export class LibraryQueryService {
  constructor(private readonly port: LibraryQueryPort) {}

  async readSnapshot(sortBy: LibrarySort): Promise<LibraryShelfSnapshot> {
    const {
      books,
      folders,
      progress: progressItems,
      cachedBookIds,
      totalNotesCount,
    } = await this.port.readSnapshot();
    const progressByBookId: Record<string, ReadingProgress> = {};
    for (const candidate of progressItems) {
      const parsed = ReadingProgressSchema.safeParse(candidate);
      if (!parsed.success || parsed.data.bookId !== candidate.bookId) continue;
      progressByBookId[parsed.data.bookId] = parsed.data;
    }
    return {
      books: sortLibraryBooks(books, sortBy),
      folders: [...folders].sort(
        (left, right) =>
          (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
          left.name.localeCompare(right.name) ||
          left.id.localeCompare(right.id),
      ),
      progressByBookId,
      cachedBookIds: new Set(cachedBookIds),
      totalNotesCount,
    };
  }

  async readSyncInventory(): Promise<{
    books: Book[];
    folders: LibraryFolder[];
  }> {
    const { books, folders } = await this.port.readSyncInventory();
    return { books: [...books], folders: [...folders] };
  }
}

export function selectVisibleLibraryBooks({
  localBooks,
  cloudBooks,
  folders,
  currentFolderId,
  sortBy,
}: {
  localBooks: readonly Book[];
  cloudBooks: readonly Book[];
  folders: readonly LibraryFolder[];
  currentFolderId: string | undefined;
  sortBy: LibrarySort;
}): Book[] {
  return filterMergedLibraryBooksByFolder({
    mergedBooks: mergeLibraryBooks(localBooks, cloudBooks, sortBy),
    folders,
    currentFolderId,
  });
}
