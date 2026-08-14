import type { LocalChapter, ReadingProgress } from "@reader/shared-types";
import { readLegacyRemoteProgress, type LegacyRemoteBook } from "./legacy-personal-sync-api";
import {
  personalSyncLocalStore,
  type DownloadedPersonalBookBundle,
} from "./dexie-personal-sync-local";

export interface PersonalSyncDownloadApi {
  downloadChapters(
    bookId: string,
    expectedChapterCount: number,
    options: { onPage?: (loaded: number, total: number) => void },
  ): Promise<LocalChapter[]>;
}

export interface PersonalSyncUploadApi {
  uploadAndVerifyBook(input: {
    book: LegacyRemoteBook;
    chapters: readonly LocalChapter[];
    progress?: ReadingProgress;
    onUploaded?: (uploaded: number, total: number) => void;
  }): Promise<LegacyRemoteBook>;
  verifyRemoteCopy(
    book: Pick<LegacyRemoteBook, "id" | "chapterCount">,
    localChapters: readonly LocalChapter[],
  ): Promise<void>;
}

export interface PersonalSyncDownloadLocalStore {
  applyDownloadedBook(bundle: DownloadedPersonalBookBundle): Promise<void>;
}

export interface PersonalSyncUploadLocalStore {
  readUploadBundle(bookId: string): Promise<DownloadedPersonalBookBundle>;
  offloadIfSnapshotMatches(bundle: DownloadedPersonalBookBundle): Promise<void>;
}

export type PersonalSyncDownloadOutcome =
  | {
      status: "succeeded";
      bookId: string;
      chapterCount: number;
    }
  | {
      status: "failed";
      bookId: string;
      code: string;
    };

function errorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "unknown_sync_failure";
}

export class PersonalSyncService {
  constructor(
    private readonly api: PersonalSyncDownloadApi & PersonalSyncUploadApi,
    private readonly local: PersonalSyncDownloadLocalStore & PersonalSyncUploadLocalStore,
  ) {}

  async uploadBook(
    bookId: string,
    options: { onUploaded?: (uploaded: number, total: number) => void } = {},
  ): Promise<PersonalSyncDownloadOutcome> {
    try {
      const bundle = await this.local.readUploadBundle(bookId);
      await this.api.uploadAndVerifyBook({
        ...bundle,
        onUploaded: options.onUploaded,
      });
      return {
        status: "succeeded",
        bookId,
        chapterCount: bundle.chapters.length,
      };
    } catch (error) {
      return { status: "failed", bookId, code: errorCode(error) };
    }
  }

  async verifyRemoteCopy(bookId: string): Promise<PersonalSyncDownloadOutcome> {
    try {
      const bundle = await this.local.readUploadBundle(bookId);
      await this.api.verifyRemoteCopy(bundle.book, bundle.chapters);
      return {
        status: "succeeded",
        bookId,
        chapterCount: bundle.chapters.length,
      };
    } catch (error) {
      return { status: "failed", bookId, code: errorCode(error) };
    }
  }

  async offloadVerifiedBook(bookId: string): Promise<PersonalSyncDownloadOutcome> {
    try {
      const bundle = await this.local.readUploadBundle(bookId);
      await this.api.verifyRemoteCopy(bundle.book, bundle.chapters);
      await this.local.offloadIfSnapshotMatches(bundle);
      return {
        status: "succeeded",
        bookId,
        chapterCount: bundle.chapters.length,
      };
    } catch (error) {
      return { status: "failed", bookId, code: errorCode(error) };
    }
  }

  async downloadBook(
    book: LegacyRemoteBook,
    options: { onPage?: (loaded: number, total: number) => void } = {},
  ): Promise<PersonalSyncDownloadOutcome> {
    try {
      const chapters = await this.api.downloadChapters(
        book.id,
        book.chapterCount,
        { onPage: options.onPage },
      );
      const progress: ReadingProgress | undefined = readLegacyRemoteProgress(book);
      await this.local.applyDownloadedBook({ book, chapters, progress });
      return {
        status: "succeeded",
        bookId: book.id,
        chapterCount: chapters.length,
      };
    } catch (error) {
      return { status: "failed", bookId: book.id, code: errorCode(error) };
    }
  }
}

export function createPersonalSyncService(
  api: PersonalSyncDownloadApi & PersonalSyncUploadApi,
): PersonalSyncService {
  return new PersonalSyncService(api, personalSyncLocalStore);
}
