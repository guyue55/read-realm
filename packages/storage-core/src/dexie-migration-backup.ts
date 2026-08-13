import {
  LocalDataSnapshotEnvelopeSchema,
  ReaderSettingsSchema,
  type Book,
  type Bookmark,
  type IndexedNovelFile,
  type LibrarySource,
  type LocalChapter,
  type LocalDataSnapshotEnvelope,
  type ReadingProgress,
} from "@reader/shared-types";

const DEFAULT_SETTINGS = {
  fontFamily: "system-ui",
  fontSize: 18,
  lineHeight: 1.8,
  theme: "paper" as const,
  pageMode: "scroll" as const,
  uiMode: "default" as const,
  paragraphSpacing: 16,
  letterSpacing: 0.03,
  autoFlipAtBottom: false,
};

export interface PreUpgradeSnapshotInput {
  databaseVersion: number;
  createdAt: string;
  books: Book[];
  chapters: LocalChapter[];
  progress: ReadingProgress[];
  bookmarks: Bookmark[];
  indexedFiles: IndexedNovelFile[];
  sources: LibrarySource[];
  settingsValue: string | null;
}

function parseSettings(value: string | null) {
  if (!value) return DEFAULT_SETTINGS;
  try {
    return ReaderSettingsSchema.parse({ ...DEFAULT_SETTINGS, ...JSON.parse(value) });
  } catch {
    throw new Error("LOCAL_DATA_MIGRATION_SETTINGS_INVALID");
  }
}

export function buildPreUpgradeSnapshot(
  input: PreUpgradeSnapshotInput,
): LocalDataSnapshotEnvelope {
  const sourceTypes = new Map(input.sources.map((source) => [source.id, source.type]));
  const books = new Map(input.books.map((book) => [book.id, book]));
  const fileRefs = input.indexedFiles.flatMap((file) => {
    if (!file.bookId || !file.format || file.kind !== "file") return [];
    const sourceType =
      sourceTypes.get(file.sourceId) ??
      books.get(file.bookId)?.contentLocator?.sourceType ??
      "manual_upload";
    return [{
      id: file.id,
      bookId: file.bookId,
      sourceType,
      relativePath: file.relativePath,
      format: file.format,
      size: file.size,
      lastModified: file.lastModified,
      quickFingerprint: file.quickFingerprint,
      contentHash: file.contentHash,
    }];
  });

  return LocalDataSnapshotEnvelopeSchema.parse({
    kind: "read-realm-local-snapshot",
    schemaVersion: 1,
    createdAt: input.createdAt,
    source: { appVersion: "0.1.0", databaseVersion: input.databaseVersion },
    data: {
      books: input.books,
      chapters: input.chapters,
      progress: input.progress,
      bookmarks: input.bookmarks,
      settings: parseSettings(input.settingsValue),
      fileRefs,
    },
  });
}

export function describeLocalDataMigrationError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  if (value.startsWith("LOCAL_DATA_MIGRATION_FAILED_BEFORE_WRITE:")) {
    return "升级未改动现有数据，请保持备份并稍后重试。";
  }
  if (value.startsWith("LOCAL_DATA_MIGRATION_FAILED_ROLLED_BACK:")) {
    return "升级失败但旧数据已恢复，可以继续阅读并稍后重试。";
  }
  if (value.startsWith("LOCAL_DATA_MIGRATION_FAILED_ROLLBACK_FAILED:")) {
    return "升级与自动恢复都失败，请停止操作、保留备份并重新打开应用。";
  }
  return "本地数据升级未完成，请保留备份并重新打开应用。";
}
