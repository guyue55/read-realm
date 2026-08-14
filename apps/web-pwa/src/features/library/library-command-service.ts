import type { LibraryFolder } from "@reader/shared-types";

export type LibraryCommandResult =
  | {
      status: "applied";
      affectedBookCount?: number;
      folderId?: string;
    }
  | {
      status:
        | "book_not_found"
        | "folder_not_found"
        | "folder_not_dissolvable"
        | "invalid_folder_name"
        | "book_not_source_bound"
        | "book_not_fully_cached"
        | "folder_not_source_bound"
        | "folder_contains_incomplete_books"
        | "folder_contains_ambiguous_sources"
        | "reconstruct_requires_reimport";
    };

export interface LibraryCommandPort {
  moveBookAtomic(input: {
    bookId: string;
    folderId?: string;
    updatedAt: string;
  }): Promise<LibraryCommandResult>;
  createFolderAndMoveAtomic(input: {
    bookId: string;
    folder: LibraryFolder;
    updatedAt: string;
  }): Promise<LibraryCommandResult>;
  dissolveFolderAtomic(input: {
    folderId: string;
    updatedAt: string;
  }): Promise<LibraryCommandResult>;
  removeBookAtomic(input: {
    bookId: string;
    updatedAt: string;
  }): Promise<LibraryCommandResult>;
  offloadBookAtomic(input: {
    bookId: string;
    updatedAt: string;
  }): Promise<LibraryCommandResult>;
  disconnectBookAtomic(input: {
    bookId: string;
    updatedAt: string;
  }): Promise<LibraryCommandResult>;
  disconnectFolderAtomic(input: {
    folderId: string;
    updatedAt: string;
  }): Promise<LibraryCommandResult>;
  requestReconstruct(input: {
    bookId: string;
  }): Promise<LibraryCommandResult>;
}

type LibraryCommandDependencies = {
  createId: () => string;
  now: () => string;
};

export class LibraryCommandService {
  constructor(
    private readonly port: LibraryCommandPort,
    private readonly dependencies: LibraryCommandDependencies,
  ) {}

  moveBook(bookId: string, folderId: string): Promise<LibraryCommandResult> {
    return this.port.moveBookAtomic({
      bookId,
      folderId: folderId === "root" || folderId.length === 0 ? undefined : folderId,
      updatedAt: this.dependencies.now(),
    });
  }

  createFolderAndMove(
    bookId: string,
    inputName: string,
  ): Promise<LibraryCommandResult> {
    const name = inputName.trim();
    if (name.length === 0 || name.length > 80) {
      return Promise.resolve({ status: "invalid_folder_name" });
    }
    const now = this.dependencies.now();
    const folder: LibraryFolder = {
      id: this.dependencies.createId(),
      name,
      sourceType: "virtual",
      depth: 0,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    return this.port.createFolderAndMoveAtomic({
      bookId,
      folder,
      updatedAt: now,
    });
  }

  dissolveFolder(folderId: string): Promise<LibraryCommandResult> {
    return this.port.dissolveFolderAtomic({
      folderId,
      updatedAt: this.dependencies.now(),
    });
  }

  removeBook(bookId: string): Promise<LibraryCommandResult> {
    return this.port.removeBookAtomic({
      bookId,
      updatedAt: this.dependencies.now(),
    });
  }

  offloadBook(bookId: string): Promise<LibraryCommandResult> {
    return this.port.offloadBookAtomic({
      bookId,
      updatedAt: this.dependencies.now(),
    });
  }

  disconnectBook(bookId: string): Promise<LibraryCommandResult> {
    return this.port.disconnectBookAtomic({
      bookId,
      updatedAt: this.dependencies.now(),
    });
  }

  disconnectFolder(folderId: string): Promise<LibraryCommandResult> {
    return this.port.disconnectFolderAtomic({
      folderId,
      updatedAt: this.dependencies.now(),
    });
  }

  requestReconstruct(bookId: string): Promise<LibraryCommandResult> {
    return this.port.requestReconstruct({ bookId });
  }
}
