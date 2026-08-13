import type { Book, LocalChapter } from "@reader/shared-types";

export type ImportTaskState =
  | "queued"
  | "reading"
  | "parsing"
  | "preview"
  | "saving"
  | "completed"
  | "failed"
  | "cancelled";

export type ImportSourceKind = "file" | "folder" | "url";
export type ImportFormat = "txt" | "epub" | "html";

export interface ImportTaskLifecycle {
  state: ImportTaskState;
  attempt: number;
  canRetry: boolean;
  source: {
    kind: ImportSourceKind;
    filename: string;
    format: ImportFormat;
    size?: number;
    url?: string;
  };
  progress: {
    receivedChapters: number;
    totalChapters: number | null;
  };
  errorCode?: string;
  errorMessage?: string;
}

export interface DurableImportTask {
  id: string;
  bookMetadata: Book;
  chapters: LocalChapter[];
  lifecycle: ImportTaskLifecycle;
  createdAt: string;
  updatedAt: string;
}

export interface CreateImportTaskDraftOptions {
  id: string;
  filename: string;
  format: ImportFormat;
  sourceKind: ImportSourceKind;
  size?: number;
  url?: string;
  now: string;
}

export type ImportTaskTransition =
  | { type: "reading"; at: string }
  | { type: "parsing"; at: string; totalChapters: number | null }
  | { type: "progress"; at: string; receivedChapters: number }
  | { type: "preview"; at: string }
  | { type: "saving"; at: string }
  | { type: "completed"; at: string }
  | { type: "failed"; at: string; errorCode: string; errorMessage: string }
  | { type: "cancelled"; at: string; reason: string }
  | { type: "retry"; at: string };

function titleFromFilename(filename: string) {
  return filename.replace(/\.[^/.]+$/, "").trim() || "未命名导入";
}

export function createImportTaskDraft({
  id,
  filename,
  format,
  sourceKind,
  size,
  url,
  now,
}: CreateImportTaskDraftOptions): DurableImportTask {
  return {
    id,
    bookMetadata: {
      id: `${id}:book`,
      title: titleFromFilename(filename),
      sourceType: sourceKind === "url" ? "url" : "upload",
      sourceUrl: url,
      format,
      status: "to_read",
      tags: [],
      chapterCount: 0,
      wordCount: 0,
      createdAt: now,
      updatedAt: now,
    },
    chapters: [],
    lifecycle: {
      state: "queued",
      attempt: 1,
      canRetry: false,
      source: {
        kind: sourceKind,
        filename,
        format,
        ...(size === undefined ? {} : { size }),
        ...(url === undefined ? {} : { url }),
      },
      progress: { receivedChapters: 0, totalChapters: null },
    },
    createdAt: now,
    updatedAt: now,
  };
}

function forbidden(state: ImportTaskState, action: ImportTaskTransition["type"]): never {
  throw new Error(`IMPORT_TASK_TRANSITION_FORBIDDEN:${state}:${action}`);
}

export function transitionImportTask(
  task: DurableImportTask,
  action: ImportTaskTransition,
): DurableImportTask {
  const state = task.lifecycle.state;
  const next = (lifecycle: ImportTaskLifecycle): DurableImportTask => ({
    ...task,
    lifecycle,
    updatedAt: action.at,
  });

  if (action.type === "reading") {
    if (state !== "queued") return forbidden(state, action.type);
    return next({ ...task.lifecycle, state: "reading", canRetry: false });
  }
  if (action.type === "parsing") {
    if (state !== "reading") return forbidden(state, action.type);
    if (action.totalChapters !== null && action.totalChapters <= 0) {
      throw new Error("IMPORT_TASK_TOTAL_CHAPTERS_INVALID");
    }
    return next({
      ...task.lifecycle,
      state: "parsing",
      progress: { ...task.lifecycle.progress, totalChapters: action.totalChapters },
    });
  }
  if (action.type === "progress") {
    if (state !== "parsing") return forbidden(state, action.type);
    const total = task.lifecycle.progress.totalChapters;
    if (
      !Number.isInteger(action.receivedChapters) ||
      action.receivedChapters < task.lifecycle.progress.receivedChapters ||
      (total !== null && action.receivedChapters > total)
    ) {
      throw new Error("IMPORT_TASK_PROGRESS_INVALID");
    }
    return next({
      ...task.lifecycle,
      progress: { ...task.lifecycle.progress, receivedChapters: action.receivedChapters },
    });
  }
  if (action.type === "preview") {
    if (state !== "parsing") return forbidden(state, action.type);
    return next({ ...task.lifecycle, state: "preview", canRetry: false });
  }
  if (action.type === "saving") {
    if (state !== "preview") return forbidden(state, action.type);
    return next({ ...task.lifecycle, state: "saving", canRetry: false });
  }
  if (action.type === "completed") {
    if (state !== "saving") return forbidden(state, action.type);
    return {
      ...next({ ...task.lifecycle, state: "completed", canRetry: false }),
      chapters: [],
    };
  }
  if (action.type === "failed") {
    if (!["queued", "reading", "parsing", "preview", "saving"].includes(state)) {
      return forbidden(state, action.type);
    }
    return next({
      ...task.lifecycle,
      state: "failed",
      canRetry: true,
      errorCode: action.errorCode,
      errorMessage: action.errorMessage,
    });
  }
  if (action.type === "cancelled") {
    if (!["queued", "reading", "parsing"].includes(state)) {
      return forbidden(state, action.type);
    }
    return next({
      ...task.lifecycle,
      state: "cancelled",
      canRetry: false,
      errorCode: "TASK_CANCELLED",
      errorMessage: action.reason,
    });
  }
  if (action.type === "retry") {
    if (state !== "failed") return forbidden(state, action.type);
    const {
      errorCode: _errorCode,
      errorMessage: _errorMessage,
      ...retryLifecycle
    } = task.lifecycle;
    const hasCompleteResult =
      task.chapters.length > 0 &&
      task.bookMetadata.chapterCount === task.chapters.length &&
      task.chapters.every(
        (chapter, index) =>
          chapter.bookId === task.bookMetadata.id && chapter.index === index,
      );
    if (hasCompleteResult) {
      return next({
        ...retryLifecycle,
        state: "preview",
        attempt: task.lifecycle.attempt + 1,
        canRetry: false,
        progress: {
          receivedChapters: task.chapters.length,
          totalChapters: task.chapters.length,
        },
      });
    }
    return {
      ...next({
        ...retryLifecycle,
        state: "queued",
        attempt: task.lifecycle.attempt + 1,
        canRetry: false,
        progress: { receivedChapters: 0, totalChapters: null },
      }),
      bookMetadata: {
        ...task.bookMetadata,
        chapterCount: 0,
        wordCount: 0,
        updatedAt: action.at,
      },
      chapters: [],
    };
  }
  return forbidden(state, action);
}
