import type { ReadingProgress } from "@reader/shared-types";

export type ProgressSaveStatus =
  | { state: "idle" }
  | { state: "pending"; progress: ReadingProgress }
  | { state: "saved"; progress: ReadingProgress }
  | { state: "failed"; progress: ReadingProgress; error: unknown };

export interface ProgressSaveCoordinator {
  schedule(progress: ReadingProgress): void;
  saveNow(progress: ReadingProgress): Promise<void>;
  flush(): Promise<void>;
  retry(): Promise<void>;
  getStatus(): ProgressSaveStatus;
  dispose(): void;
}

export interface ProgressSaveCoordinatorOptions {
  persist: (progress: ReadingProgress) => Promise<void>;
  delayMs?: number;
  onStatusChange?: (status: ProgressSaveStatus) => void;
}

const DEFAULT_SAVE_DELAY_MS = 250;

export function createProgressSaveCoordinator({
  persist,
  delayMs = DEFAULT_SAVE_DELAY_MS,
  onStatusChange,
}: ProgressSaveCoordinatorOptions): ProgressSaveCoordinator {
  let status: ProgressSaveStatus = { state: "idle" };
  let pending: ReadingProgress | null = null;
  let retryable: ReadingProgress | null = null;
  let savedFingerprint: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let drainPromise: Promise<void> | null = null;
  let disposed = false;

  const publish = (nextStatus: ProgressSaveStatus) => {
    status = nextStatus;
    onStatusChange?.(nextStatus);
  };

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const drain = (): Promise<void> => {
    clearTimer();
    if (drainPromise) return drainPromise;

    const run = async () => {
      while (pending) {
        const current = pending;
        pending = null;
        try {
          await persist(current);
          retryable = null;
          savedFingerprint = JSON.stringify(current);
          if (!pending) publish({ state: "saved", progress: current });
        } catch (error) {
          if (!pending) {
            retryable = current;
            publish({ state: "failed", progress: current, error });
          }
          throw error;
        }
      }
    };

    drainPromise = run().finally(() => {
      drainPromise = null;
      if (pending && !disposed) {
        void drain().catch(() => undefined);
      }
    });
    return drainPromise;
  };

  const queue = (progress: ReadingProgress) => {
    if (disposed) throw new Error("PROGRESS_SAVE_COORDINATOR_DISPOSED");
    if (
      !pending &&
      !drainPromise &&
      status.state === "saved" &&
      savedFingerprint === JSON.stringify(progress)
    ) {
      return false;
    }
    pending = progress;
    retryable = null;
    publish({ state: "pending", progress });
    return true;
  };

  return {
    schedule(progress) {
      if (!queue(progress)) return;
      if (!timer && !drainPromise) {
        timer = setTimeout(() => {
          timer = null;
          void drain().catch(() => undefined);
        }, Math.max(0, delayMs));
      }
    },

    saveNow(progress) {
      const activeWrite = drainPromise;
      if (!queue(progress)) return Promise.resolve();
      if (activeWrite) {
        return activeWrite.catch(() => undefined).then(() => drain());
      }
      return drain();
    },

    flush() {
      if (pending) return drain();
      if (drainPromise) {
        return drainPromise.catch(() => undefined).then(() => {
          if (drainPromise) return drainPromise;
          if (pending) return drain();
          if (retryable) {
            queue(retryable);
            return drain();
          }
        });
      }
      if (retryable) {
        queue(retryable);
        return drain();
      }
      return Promise.resolve();
    },

    retry() {
      if (!retryable) return Promise.resolve();
      queue(retryable);
      return drain();
    },

    getStatus() {
      return status;
    },

    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
