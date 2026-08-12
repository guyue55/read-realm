import {
  LocalDataSnapshotEnvelopeSchema,
  type LocalDataSnapshotData,
} from "@reader/shared-types";
import {
  type LocalDataSnapshotReader,
  parseLocalDataSnapshot,
  serializeLocalDataSnapshot,
} from "./local-snapshot.js";

export interface LocalDataSnapshotRestoreTarget {
  isEmpty(): Promise<boolean>;
  replaceEmptyTarget(data: LocalDataSnapshotData): Promise<void>;
  readRestoredData(): Promise<LocalDataSnapshotData>;
  clearFailedRestore(): Promise<void>;
}

export interface CreateLocalDataBackupOptions {
  reader: LocalDataSnapshotReader;
  appVersion: string;
  databaseVersion: number;
  now?: () => string;
}

export interface RestoreLocalDataBackupOptions {
  serialized: string;
  target: LocalDataSnapshotRestoreTarget;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dataFingerprint(data: LocalDataSnapshotData): string {
  return JSON.stringify(data);
}

export async function createLocalDataBackup({
  reader,
  appVersion,
  databaseVersion,
  now = () => new Date().toISOString(),
}: CreateLocalDataBackupOptions): Promise<string> {
  return serializeLocalDataSnapshot(
    LocalDataSnapshotEnvelopeSchema.parse({
      kind: "read-realm-local-snapshot",
      schemaVersion: 1,
      createdAt: now(),
      source: { appVersion, databaseVersion },
      data: await reader.readSnapshotData(),
    }),
  );
}

export async function restoreLocalDataBackupToEmptyTarget({
  serialized,
  target,
}: RestoreLocalDataBackupOptions): Promise<{
  status: "restored";
  bookCount: number;
  chapterCount: number;
  progressCount: number;
  bookmarkCount: number;
}> {
  const snapshot = parseLocalDataSnapshot(serialized);
  if (!(await target.isEmpty())) {
    throw new Error("LOCAL_DATA_RESTORE_TARGET_NOT_EMPTY");
  }

  try {
    await target.replaceEmptyTarget(snapshot.data);
    const restored = await target.readRestoredData();
    if (dataFingerprint(restored) !== dataFingerprint(snapshot.data)) {
      throw new Error("LOCAL_DATA_RESTORE_READBACK_MISMATCH");
    }
  } catch (restoreError) {
    try {
      await target.clearFailedRestore();
    } catch (cleanupError) {
      throw new Error(
        `LOCAL_DATA_RESTORE_FAILED_CLEANUP_FAILED:${message(restoreError)}:${message(cleanupError)}`,
      );
    }
    throw new Error(`LOCAL_DATA_RESTORE_FAILED_CLEANED:${message(restoreError)}`);
  }

  return {
    status: "restored",
    bookCount: snapshot.data.books.length,
    chapterCount: snapshot.data.chapters.length,
    progressCount: snapshot.data.progress.length,
    bookmarkCount: snapshot.data.bookmarks.length,
  };
}
