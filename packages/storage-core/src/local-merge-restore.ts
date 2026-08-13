import {
  BookmarkSchema,
  BookSchema,
  LocalChapterSchema,
  LocalFileRefSchema,
  ReaderSettingsSchema,
  ReadingProgressSchema,
  type LocalDataSnapshotData,
} from "@reader/shared-types";

export type LocalDataMergeResolution = "keep-existing" | "use-incoming";

export interface LocalDataMergeConflict {
  key: string;
  kind: "book" | "chapter" | "bookmark" | "file-ref" | "settings";
  id: string;
  existing: unknown;
  incoming: unknown;
}

export interface LocalDataMergePlan {
  executable: boolean;
  conflicts: LocalDataMergeConflict[];
  unresolvedConflictKeys: string[];
  summary: {
    addedBooks: number;
    addedChapters: number;
    addedBookmarks: number;
    addedFileRefs: number;
    advancedProgress: number;
    skippedIdentical: number;
    resolvedConflicts: number;
  };
  result?: LocalDataSnapshotData;
}

export interface BuildLocalDataMergePlanOptions {
  current: LocalDataSnapshotData;
  incoming: LocalDataSnapshotData;
  resolutions?: Record<string, LocalDataMergeResolution>;
}

function normalizeData(data: LocalDataSnapshotData): LocalDataSnapshotData {
  return {
    books: data.books.map((value) => BookSchema.parse(value)),
    chapters: data.chapters.map((value) => LocalChapterSchema.parse(value)),
    progress: data.progress.map((value) => ReadingProgressSchema.parse(value)),
    bookmarks: data.bookmarks.map((value) => BookmarkSchema.parse(value)),
    settings: ReaderSettingsSchema.parse(data.settings),
    fileRefs: data.fileRefs.map((value) => LocalFileRefSchema.parse(value)),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    );
  }
  return value;
}

export function localDataValueFingerprint(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function same(left: unknown, right: unknown): boolean {
  return localDataValueFingerprint(left) === localDataValueFingerprint(right);
}

function mergeRecords<T extends { id: string }>(options: {
  current: T[];
  incoming: T[];
  kind: LocalDataMergeConflict["kind"];
  keyPrefix: string;
  conflicts: LocalDataMergeConflict[];
  resolutions: Record<string, LocalDataMergeResolution>;
  knownResolutionKeys: Set<string>;
  summaryAdded: () => void;
  summarySkipped: () => void;
  summaryResolved: () => void;
}): T[] {
  const result = options.current.map((value) => structuredClone(value));
  const indexes = new Map(result.map((value, index) => [value.id, index]));
  for (const incomingValue of options.incoming) {
    const index = indexes.get(incomingValue.id);
    if (index === undefined) {
      indexes.set(incomingValue.id, result.length);
      result.push(structuredClone(incomingValue));
      options.summaryAdded();
      continue;
    }
    const existingValue = result[index]!;
    if (same(existingValue, incomingValue)) {
      options.summarySkipped();
      continue;
    }
    const key = `${options.keyPrefix}:${incomingValue.id}`;
    options.knownResolutionKeys.add(key);
    options.conflicts.push({
      key,
      kind: options.kind,
      id: incomingValue.id,
      existing: structuredClone(existingValue),
      incoming: structuredClone(incomingValue),
    });
    const resolution = options.resolutions[key];
    if (resolution === "use-incoming") {
      result[index] = structuredClone(incomingValue);
      options.summaryResolved();
    } else if (resolution === "keep-existing") {
      options.summaryResolved();
    }
  }
  return result;
}

export function buildLocalDataMergePlan({
  current,
  incoming,
  resolutions = {},
}: BuildLocalDataMergePlanOptions): LocalDataMergePlan {
  current = normalizeData(current);
  incoming = normalizeData(incoming);
  const conflicts: LocalDataMergeConflict[] = [];
  const knownResolutionKeys = new Set<string>();
  const summary = {
    addedBooks: 0,
    addedChapters: 0,
    addedBookmarks: 0,
    addedFileRefs: 0,
    advancedProgress: 0,
    skippedIdentical: 0,
    resolvedConflicts: 0,
  };

  const books = mergeRecords({
    current: current.books,
    incoming: incoming.books,
    kind: "book",
    keyPrefix: "book",
    conflicts,
    resolutions,
    knownResolutionKeys,
    summaryAdded: () => { summary.addedBooks += 1; },
    summarySkipped: () => { summary.skippedIdentical += 1; },
    summaryResolved: () => { summary.resolvedConflicts += 1; },
  });
  const chapters = mergeRecords({
    current: current.chapters,
    incoming: incoming.chapters,
    kind: "chapter",
    keyPrefix: "chapter",
    conflicts,
    resolutions,
    knownResolutionKeys,
    summaryAdded: () => { summary.addedChapters += 1; },
    summarySkipped: () => { summary.skippedIdentical += 1; },
    summaryResolved: () => { summary.resolvedConflicts += 1; },
  });
  const bookmarks = mergeRecords({
    current: current.bookmarks,
    incoming: incoming.bookmarks,
    kind: "bookmark",
    keyPrefix: "bookmark",
    conflicts,
    resolutions,
    knownResolutionKeys,
    summaryAdded: () => { summary.addedBookmarks += 1; },
    summarySkipped: () => { summary.skippedIdentical += 1; },
    summaryResolved: () => { summary.resolvedConflicts += 1; },
  });
  const fileRefs = mergeRecords({
    current: current.fileRefs,
    incoming: incoming.fileRefs,
    kind: "file-ref",
    keyPrefix: "file-ref",
    conflicts,
    resolutions,
    knownResolutionKeys,
    summaryAdded: () => { summary.addedFileRefs += 1; },
    summarySkipped: () => { summary.skippedIdentical += 1; },
    summaryResolved: () => { summary.resolvedConflicts += 1; },
  });

  const progress = current.progress.map((value) => structuredClone(value));
  const progressIndexes = new Map(
    progress.map((value, index) => [value.bookId, index]),
  );
  for (const incomingProgress of incoming.progress) {
    const index = progressIndexes.get(incomingProgress.bookId);
    if (index === undefined) {
      progressIndexes.set(incomingProgress.bookId, progress.length);
      progress.push(structuredClone(incomingProgress));
      summary.advancedProgress += 1;
      continue;
    }
    const existingProgress = progress[index]!;
    if (same(existingProgress, incomingProgress)) {
      summary.skippedIdentical += 1;
    } else if (
      Date.parse(incomingProgress.updatedAt) > Date.parse(existingProgress.updatedAt)
    ) {
      progress[index] = structuredClone(incomingProgress);
      summary.advancedProgress += 1;
    }
  }

  let settings = structuredClone(current.settings);
  if (same(current.settings, incoming.settings)) {
    summary.skippedIdentical += 1;
  } else {
    const key = "settings:reader";
    knownResolutionKeys.add(key);
    conflicts.push({
      key,
      kind: "settings",
      id: "reader",
      existing: structuredClone(current.settings),
      incoming: structuredClone(incoming.settings),
    });
    if (resolutions[key] === "use-incoming") {
      settings = structuredClone(incoming.settings);
      summary.resolvedConflicts += 1;
    } else if (resolutions[key] === "keep-existing") {
      summary.resolvedConflicts += 1;
    }
  }

  for (const key of Object.keys(resolutions)) {
    if (!knownResolutionKeys.has(key)) {
      throw new Error(`LOCAL_DATA_MERGE_UNKNOWN_RESOLUTION:${key}`);
    }
  }
  const unresolvedConflictKeys = conflicts
    .map((conflict) => conflict.key)
    .filter((key) => resolutions[key] === undefined);
  const executable = unresolvedConflictKeys.length === 0;

  return {
    executable,
    conflicts,
    unresolvedConflictKeys,
    summary,
    ...(executable
      ? {
          result: {
            books,
            chapters,
            progress,
            bookmarks,
            settings,
            fileRefs,
          },
        }
      : {}),
  };
}
