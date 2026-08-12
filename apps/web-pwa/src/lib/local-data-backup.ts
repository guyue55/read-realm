import {
  createLocalDataBackup,
  db,
  restoreLocalDataBackupToEmptyTarget,
  type LocalDataSnapshotRestoreTarget,
} from "@reader/storage-core";
import type { LocalDataSnapshotData } from "@reader/shared-types";
import {
  loadReaderSettings,
  saveReaderSettings,
  type ReaderSettingsState,
} from "./reader-settings";

const APP_VERSION = "0.1.0";

function byId<T extends { id: string }>(left: T, right: T) {
  return left.id.localeCompare(right.id);
}

function byBookAndIndex<
  T extends { bookId: string; index?: number; chapterIndex?: number },
>(left: T, right: T) {
  return (
    left.bookId.localeCompare(right.bookId) ||
    (left.index ?? left.chapterIndex ?? 0) -
      (right.index ?? right.chapterIndex ?? 0)
  );
}

export async function readBrowserLocalData(): Promise<LocalDataSnapshotData> {
  const [books, chapters, progress, bookmarks] = await Promise.all([
    db.books.toArray(),
    db.chapters.toArray(),
    db.progress.toArray(),
    db.bookmarks.toArray(),
  ]);

  return {
    books: books.sort(byId),
    chapters: chapters.sort(byBookAndIndex),
    progress: progress.sort(byBookAndIndex),
    bookmarks: bookmarks.sort(byId),
    settings: loadReaderSettings(),
    fileRefs: [],
  };
}

function assertCompleteCachedBooks(data: LocalDataSnapshotData) {
  const chapterCounts = new Map<string, number>();
  for (const chapter of data.chapters) {
    chapterCounts.set(
      chapter.bookId,
      (chapterCounts.get(chapter.bookId) ?? 0) + 1,
    );
  }

  for (const book of data.books) {
    if (book.contentLocator || book.multiFileBook) {
      throw new Error(`LOCAL_DATA_BACKUP_EXTERNAL_SOURCE_UNSUPPORTED:${book.title}`);
    }
    if ((chapterCounts.get(book.id) ?? 0) !== book.chapterCount) {
      throw new Error(`LOCAL_DATA_BACKUP_INCOMPLETE_CHAPTERS:${book.title}`);
    }
  }
}

export async function createBrowserLocalDataBackup(): Promise<string> {
  return createLocalDataBackup({
    reader: {
      readSnapshotData: async () => {
        const data = await readBrowserLocalData();
        if (data.books.length === 0) {
          throw new Error("LOCAL_DATA_BACKUP_EMPTY_LIBRARY");
        }
        assertCompleteCachedBooks(data);
        return data;
      },
    },
    appVersion: APP_VERSION,
    databaseVersion: Math.round(db.verno),
  });
}

function createBrowserRestoreTarget(): LocalDataSnapshotRestoreTarget {
  const previousSettings: ReaderSettingsState = loadReaderSettings();

  return {
    async isEmpty() {
      const counts = await Promise.all([
        db.books.count(),
        db.chapters.count(),
        db.progress.count(),
        db.bookmarks.count(),
      ]);
      return counts.every((count) => count === 0);
    },

    async replaceEmptyTarget(data) {
      if (data.fileRefs.length > 0) {
        throw new Error("LOCAL_DATA_RESTORE_FILE_REFS_UNSUPPORTED");
      }
      await db.transaction(
        "rw",
        [db.books, db.chapters, db.progress, db.bookmarks],
        async () => {
          await db.books.bulkPut(data.books);
          await db.chapters.bulkPut(data.chapters);
          await db.progress.bulkPut(data.progress);
          await db.bookmarks.bulkPut(data.bookmarks);
        },
      );
      saveReaderSettings(data.settings);
    },

    readRestoredData: readBrowserLocalData,

    async clearFailedRestore() {
      await db.transaction(
        "rw",
        [db.books, db.chapters, db.progress, db.bookmarks],
        async () => {
          await Promise.all([
            db.books.clear(),
            db.chapters.clear(),
            db.progress.clear(),
            db.bookmarks.clear(),
          ]);
        },
      );
      saveReaderSettings(previousSettings);
    },
  };
}

export async function restoreBrowserLocalDataBackup(serialized: string) {
  return restoreLocalDataBackupToEmptyTarget({
    serialized,
    target: createBrowserRestoreTarget(),
  });
}

export function describeLocalDataBackupError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  if (value === "LOCAL_DATA_BACKUP_EMPTY_LIBRARY") {
    return "书架还是空的，暂无可备份数据。";
  }
  if (value.startsWith("LOCAL_DATA_BACKUP_INCOMPLETE_CHAPTERS:")) {
    return `《${value.split(":").slice(1).join(":")}》的正文尚未完整缓存，请先下载整本再备份。`;
  }
  if (value.startsWith("LOCAL_DATA_BACKUP_EXTERNAL_SOURCE_UNSUPPORTED:")) {
    return `《${value.split(":").slice(1).join(":")}》仍依赖外部文件，请先完整缓存再备份。`;
  }
  if (value === "LOCAL_DATA_RESTORE_TARGET_NOT_EMPTY") {
    return "当前书架不为空，为防止覆盖已有数据，本次恢复已停止。";
  }
  if (value === "LOCAL_DATA_RESTORE_FILE_REFS_UNSUPPORTED") {
    return "该备份包含本机外部文件引用，当前版本不会冒险恢复。";
  }
  if (value.startsWith("UNSUPPORTED_LOCAL_DATA_SCHEMA_VERSION:")) {
    return "该备份来自更新版本，请升级应用后再恢复。";
  }
  if (value.startsWith("LOCAL_DATA_RESTORE_FAILED_CLEANED:")) {
    return "恢复校验失败，已清理本次写入，原空书架未被污染。";
  }
  if (value.startsWith("LOCAL_DATA_RESTORE_FAILED_CLEANUP_FAILED:")) {
    return "恢复与自动清理都失败，请保留备份并重新打开应用，不要继续导入。";
  }
  return "备份文件无法校验或处理，请确认文件完整且未被修改。";
}
