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
  const knownFolders = new Set(folders.map((folder) => folder.id));
  const visible = mergeLibraryBooks(localBooks, cloudBooks, sortBy).filter((book) => {
    if (currentFolderId !== undefined) {
      return book.sourceFolderId === currentFolderId;
    }
    return !book.sourceFolderId || !knownFolders.has(book.sourceFolderId);
  });
  return visible;
}
