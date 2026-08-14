export const ACTIVE_SYNC_TASKS_KEY = "reader-active-sync-tasks";

export type SyncTaskAction = "upload" | "download" | "delete";
export interface ActiveSyncTask {
  bookId: string;
  action: SyncTaskAction;
  shareToken: string;
}
export type ActiveSyncTasks = Record<string, ActiveSyncTask>;

const UNSAFE_BOOK_IDS = new Set(["__proto__", "constructor", "prototype"]);

function isValidBookId(bookId: string): boolean {
  return bookId.trim().length > 0 && !UNSAFE_BOOK_IDS.has(bookId);
}

function isValidShareToken(token: string): boolean {
  return /^[A-Za-z0-9_\-\u4E00-\u9FFF]{1,64}$/.test(token);
}

function taskKey(bookId: string, shareToken: string): string {
  return `${encodeURIComponent(shareToken)}::${encodeURIComponent(bookId)}`;
}

function clearInvalidTasks(storage: Storage): ActiveSyncTasks {
  storage.removeItem(ACTIVE_SYNC_TASKS_KEY);
  return {};
}

export function readSyncTasks(storage: Storage): ActiveSyncTasks {
  const raw = storage.getItem(ACTIVE_SYNC_TASKS_KEY);
  if (raw === null) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return clearInvalidTasks(storage);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return clearInvalidTasks(storage);
  }

  const tasks: ActiveSyncTasks = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return clearInvalidTasks(storage);
    }
    const { bookId, action, shareToken } = value as Record<string, unknown>;
    if (
      typeof bookId !== "string" ||
      typeof shareToken !== "string" ||
      !isValidBookId(bookId) ||
      !isValidShareToken(shareToken) ||
      (action !== "upload" && action !== "download" && action !== "delete") ||
      key !== taskKey(bookId, shareToken)
    ) {
      return clearInvalidTasks(storage);
    }
    tasks[key] = { bookId, action, shareToken };
  }

  return tasks;
}

export function writeSyncTasks(storage: Storage, tasks: ActiveSyncTasks): void {
  storage.setItem(ACTIVE_SYNC_TASKS_KEY, JSON.stringify(tasks));
}

export function markSyncTask(
  storage: Storage,
  bookId: string,
  action: SyncTaskAction,
  shareToken: string,
): void {
  if (!isValidBookId(bookId) || !isValidShareToken(shareToken)) return;
  const key = taskKey(bookId, shareToken);
  writeSyncTasks(storage, {
    ...readSyncTasks(storage),
    [key]: { bookId, action, shareToken },
  });
}

export function clearSyncTask(
  storage: Storage,
  bookId: string,
  shareToken: string,
): void {
  const tasks = readSyncTasks(storage);
  delete tasks[taskKey(bookId, shareToken)];
  writeSyncTasks(storage, tasks);
}
