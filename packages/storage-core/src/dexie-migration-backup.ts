import {
  BookmarkSchema,
  BookSchema,
  LocalChapterSchema,
  LocalDataSnapshotEnvelopeSchema,
  LocalFileRefSchema,
  ReadingProgressSchema,
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
    // 🏮 [FIX] localStorage 中的阅读设置若被破坏（非法 JSON），不应阻断数据库升级，
    // 退回默认设置即可，书架照常打开。
    return DEFAULT_SETTINGS;
  }
}

export function buildPreUpgradeSnapshot(
  input: PreUpgradeSnapshotInput,
): LocalDataSnapshotEnvelope {
  // 🏮 [FIX] 升级快照采用「宽松清洗」策略：
  // 旧版本库中可能存在字段不全（缺 sourceType/status/chapterCount 等）或
  // 引用悬空（孤儿章节/进度引用了已删除的书）的脏记录。若逐条强校验失败，
  // 会导致整个 IndexedDB 升级事务失败，书架直接打不开（“本地数据升级未完成”）。
  // 这里改为 safeParse 逐条过滤：丢弃不合 schema 或引用悬空的记录，
  // 只保留合法记录进入备份快照；快照仅用于升级失败时的回滚，丢几条脏记录
  // 远好于整库无法打开。
  const sourceTypes = new Map(input.sources.map((source) => [source.id, source.type]));
  const books = input.books.filter(
    (book) => BookSchema.safeParse(book).success,
  );
  const validBookIds = new Set(books.map((book) => book.id));
  const chapters = input.chapters.filter(
    (chapter) =>
      LocalChapterSchema.safeParse(chapter).success &&
      validBookIds.has(chapter.bookId),
  );
  const chapterIds = new Set(chapters.map((chapter) => chapter.id));
  const progress = input.progress.filter(
    (entry) =>
      ReadingProgressSchema.safeParse(entry).success &&
      validBookIds.has(entry.bookId) &&
      chapterIds.has(entry.chapterId),
  );
  const bookmarks = input.bookmarks.filter(
    (bookmark) => BookmarkSchema.safeParse(bookmark).success,
  );
  const fileRefs = input.indexedFiles.flatMap((file) => {
    if (!file.bookId || !file.format || file.kind !== "file") return [];
    const sourceType =
      sourceTypes.get(file.sourceId) ??
      books.find((book) => book.id === file.bookId)?.contentLocator?.sourceType ??
      "manual_upload";
    const candidate = {
      id: file.id,
      bookId: file.bookId,
      sourceType,
      relativePath: file.relativePath,
      format: file.format,
      size: file.size,
      lastModified: file.lastModified,
      quickFingerprint: file.quickFingerprint,
      contentHash: file.contentHash,
    };
    return LocalFileRefSchema.safeParse(candidate).success ? [candidate] : [];
  });

  // 兜底：即便逐条清洗后仍有个别记录导致整体校验失败（极端脏数据），
  // 也退化为「结构合法、数据尽量保留」的快照，绝不阻断数据库升级。
  const parsed = LocalDataSnapshotEnvelopeSchema.safeParse({
    kind: "read-realm-local-snapshot",
    schemaVersion: 1,
    createdAt: input.createdAt,
    source: { appVersion: "0.1.0", databaseVersion: input.databaseVersion },
    data: {
      books,
      chapters,
      progress,
      bookmarks,
      settings: parseSettings(input.settingsValue),
      fileRefs,
    },
  });
  if (parsed.success) return parsed.data;

  const fallback = LocalDataSnapshotEnvelopeSchema.safeParse({
    kind: "read-realm-local-snapshot",
    schemaVersion: 1,
    createdAt: input.createdAt,
    source: { appVersion: "0.1.0", databaseVersion: input.databaseVersion },
    data: {
      books: [],
      chapters: [],
      progress: [],
      bookmarks: [],
      settings: parseSettings(input.settingsValue),
      fileRefs: [],
    },
  });
  if (fallback.success) return fallback.data;
  throw new Error("LOCAL_DATA_MIGRATION_SNAPSHOT_BUILD_FAILED");
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
