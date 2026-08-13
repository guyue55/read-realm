import {
  createImportTaskDraft,
  transitionImportTask,
  type CreateImportTaskDraftOptions,
  type DurableImportTask,
  type ImportTaskTransition,
} from "@reader/storage-core";
import type { Book, LocalChapter } from "@reader/shared-types";

export interface DurableImportTaskPort {
  put(task: DurableImportTask): Promise<void>;
  get(taskId: string): Promise<DurableImportTask | undefined>;
}

export interface DurableImportTaskControllerOptions {
  port: DurableImportTaskPort;
  now?: () => string;
}

type TransitionWithoutTimestamp =
  ImportTaskTransition extends infer Transition
    ? Transition extends { at: string }
      ? Omit<Transition, "at">
      : never
    : never;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertDurableTask(task: DurableImportTask | undefined, taskId: string) {
  if (!task) throw new Error(`DURABLE_IMPORT_TASK_READBACK_MISSING:${taskId}`);
  if (!task.lifecycle) {
    throw new Error(`DURABLE_IMPORT_TASK_LIFECYCLE_MISSING:${taskId}`);
  }
  return task;
}

export function createDurableImportTaskController({
  port,
  now = () => new Date().toISOString(),
}: DurableImportTaskControllerOptions) {
  const taskQueues = new Map<string, Promise<unknown>>();

  function serialize<T>(taskId: string, operation: () => Promise<T>): Promise<T> {
    const previous = taskQueues.get(taskId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    taskQueues.set(taskId, current);
    void current.finally(() => {
      if (taskQueues.get(taskId) === current) taskQueues.delete(taskId);
    }).catch(() => undefined);
    return current;
  }

  async function persist(task: DurableImportTask) {
    await port.put(task);
    const readback = assertDurableTask(await port.get(task.id), task.id);
    if (canonicalJson(readback) !== canonicalJson(task)) {
      throw new Error(`DURABLE_IMPORT_TASK_READBACK_MISMATCH:${task.id}`);
    }
    return readback;
  }

  return {
    create(
      options: Omit<CreateImportTaskDraftOptions, "now">,
    ): Promise<DurableImportTask> {
      return serialize(options.id, () =>
        persist(createImportTaskDraft({ ...options, now: now() })),
      );
    },

    async transition(
      taskId: string,
      action: TransitionWithoutTimestamp,
    ): Promise<DurableImportTask> {
      return serialize(taskId, async () => {
        const current = assertDurableTask(await port.get(taskId), taskId);
        return persist(
          transitionImportTask(current, {
            ...action,
            at: now(),
          } as ImportTaskTransition),
        );
      });
    },

    async recover(taskId: string): Promise<DurableImportTask> {
      return assertDurableTask(await port.get(taskId), taskId);
    },

    async markInterrupted(taskId: string): Promise<DurableImportTask> {
      return serialize(taskId, async () => {
        const current = assertDurableTask(await port.get(taskId), taskId);
        if (!["queued", "reading", "parsing"].includes(current.lifecycle.state)) {
          return current;
        }
        return persist(
          transitionImportTask(current, {
            type: "failed",
            at: now(),
            errorCode: "IMPORT_INTERRUPTED",
            errorMessage: "上次导入被刷新或关闭中断；原文件未被删除，请重新选择同一文件继续。",
          }),
        );
      });
    },

    async attachParsedResult(
      taskId: string,
      result: { bookMetadata: Book; chapters: LocalChapter[] },
    ): Promise<DurableImportTask> {
      return serialize(taskId, async () => {
        const current = assertDurableTask(await port.get(taskId), taskId);
        if (current.lifecycle.state !== "parsing") {
          throw new Error(
            `DURABLE_IMPORT_TASK_RESULT_FORBIDDEN:${current.lifecycle.state}`,
          );
        }
        if (
          result.chapters.length === 0 ||
          result.bookMetadata.chapterCount !== result.chapters.length ||
          result.chapters.some(
            (chapter, index) =>
              chapter.bookId !== result.bookMetadata.id || chapter.index !== index,
          )
        ) {
          throw new Error("DURABLE_IMPORT_TASK_RESULT_INVALID");
        }
        const withResult: DurableImportTask = {
          ...current,
          bookMetadata: result.bookMetadata,
          chapters: result.chapters,
        };
        return persist(
          transitionImportTask(withResult, { type: "preview", at: now() }),
        );
      });
    },
  };
}
