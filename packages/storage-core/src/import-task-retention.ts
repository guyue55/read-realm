import type { ImportTaskState } from "./import-task-lifecycle.js";

export interface ImportTaskRetentionCandidate {
  createdAt: string;
  chapterCount: number;
  hasLifecycle: boolean;
  lifecycleState?: ImportTaskState | undefined;
}

export function shouldSweepLegacyImportTask(
  candidate: ImportTaskRetentionCandidate,
  now: number,
  minimumAgeMs: number,
) {
  if (candidate.hasLifecycle || candidate.chapterCount !== 0) return false;
  const createdAt = Date.parse(candidate.createdAt);
  return Number.isFinite(createdAt) && now - createdAt > minimumAgeMs;
}
