import type { LocalDataSnapshotData } from "@reader/shared-types";
import {
  buildLocalDataMergePlan,
  localDataValueFingerprint,
  type LocalDataMergeResolution,
} from "./local-merge-restore.js";

export interface LocalDataMergeRestoreTarget {
  readCurrent(): Promise<LocalDataSnapshotData>;
  replaceCurrent(data: LocalDataSnapshotData): Promise<void>;
}

export interface ExecuteLocalDataMergeRestoreOptions {
  incoming: LocalDataSnapshotData;
  target: LocalDataMergeRestoreTarget;
  resolutions?: Record<string, LocalDataMergeResolution>;
}

function fingerprint(data: LocalDataSnapshotData): string {
  return localDataValueFingerprint(data);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function executeLocalDataMergeRestore({
  incoming,
  target,
  resolutions,
}: ExecuteLocalDataMergeRestoreOptions) {
  const previous = await target.readCurrent();
  const plan = buildLocalDataMergePlan({
    current: previous,
    incoming,
    ...(resolutions ? { resolutions } : {}),
  });
  if (!plan.executable || !plan.result) {
    throw new Error(
      `LOCAL_DATA_MERGE_UNRESOLVED_CONFLICTS:${plan.unresolvedConflictKeys.join(",")}`,
    );
  }

  try {
    await target.replaceCurrent(plan.result);
    const restored = await target.readCurrent();
    if (fingerprint(restored) !== fingerprint(plan.result)) {
      throw new Error("LOCAL_DATA_MERGE_READBACK_MISMATCH");
    }
  } catch (restoreError) {
    try {
      await target.replaceCurrent(previous);
      const rolledBack = await target.readCurrent();
      if (fingerprint(rolledBack) !== fingerprint(previous)) {
        throw new Error("LOCAL_DATA_MERGE_ROLLBACK_READBACK_MISMATCH");
      }
    } catch (rollbackError) {
      throw new Error(
        `LOCAL_DATA_MERGE_FAILED_ROLLBACK_FAILED:${message(restoreError)}:${message(rollbackError)}`,
      );
    }
    throw new Error(
      `LOCAL_DATA_MERGE_FAILED_ROLLED_BACK:${message(restoreError)}`,
    );
  }

  return { status: "merged" as const, summary: plan.summary };
}
