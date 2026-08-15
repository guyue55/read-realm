import {
  PublicLibraryMaintenanceError,
  type PublicLibraryFilePublication,
} from "./public-library-maintenance-client";

export const PUBLIC_LIBRARY_BROWSER_FILE_LIMIT = 200;
export const PUBLIC_LIBRARY_BROWSER_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const PUBLIC_LIBRARY_BROWSER_BATCH_MAX_BYTES = 200 * 1024 * 1024;
export const PUBLIC_LIBRARY_BROWSER_CONCURRENCY = 2;

export type PublicLibraryImportStatus =
  | "queued"
  | "uploading"
  | "created"
  | "unchanged"
  | "duplicate"
  | "failed";

export interface PublicLibraryImportTask {
  id: string;
  file: File;
  status: PublicLibraryImportStatus;
  reason?: string;
  retryable: boolean;
}

export class PublicLibraryBatchLimitError extends Error {
  constructor(readonly code: "too_many_files" | "batch_too_large") {
    super(code);
    this.name = "PublicLibraryBatchLimitError";
  }
}

function invalidReason(file: File) {
  if (!file.name.toLocaleLowerCase("en-US").endsWith(".txt")) {
    return "仅支持 TXT 文件";
  }
  if (file.size <= 0) return "文件为空";
  if (file.size > PUBLIC_LIBRARY_BROWSER_FILE_MAX_BYTES) {
    return "单个文件超过 20 MiB";
  }
  return undefined;
}

export function preparePublicLibraryImportTasks(
  files: readonly File[],
): PublicLibraryImportTask[] {
  if (files.length > PUBLIC_LIBRARY_BROWSER_FILE_LIMIT) {
    throw new PublicLibraryBatchLimitError("too_many_files");
  }
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > PUBLIC_LIBRARY_BROWSER_BATCH_MAX_BYTES) {
    throw new PublicLibraryBatchLimitError("batch_too_large");
  }
  return files.map((file, index) => {
    const reason = invalidReason(file);
    return {
      id: `${index}-${file.name}-${file.size}`,
      file,
      status: reason ? "failed" : "queued",
      reason,
      retryable: false,
    };
  });
}

function failureTask(
  task: PublicLibraryImportTask,
  error: unknown,
): PublicLibraryImportTask {
  if (error instanceof PublicLibraryMaintenanceError) {
    if (error.code === "duplicate_metadata_conflict") {
      return {
        ...task,
        status: "duplicate",
        reason: "相同正文已在阁中，书目信息不同",
        retryable: false,
      };
    }
    if (error.code === "file_rejected") {
      return {
        ...task,
        status: "failed",
        reason: "文件未通过服务端校验",
        retryable: false,
      };
    }
    if (error.code === "credential_rejected") {
      return {
        ...task,
        status: "failed",
        reason: "当前密钥没有此实例的入阁权限",
        retryable: false,
      };
    }
  }
  return {
    ...task,
    status: "failed",
    reason: "藏经阁暂时无法连接",
    retryable: true,
  };
}

export async function runPublicLibraryImportQueue(
  sourceTasks: readonly PublicLibraryImportTask[],
  upload: (file: File) => Promise<PublicLibraryFilePublication>,
  onTaskChange?: (task: PublicLibraryImportTask) => void,
): Promise<PublicLibraryImportTask[]> {
  const tasks = sourceTasks.map((task) => ({ ...task }));
  const runnable = tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.status === "queued");
  let cursor = 0;

  const update = (index: number, task: PublicLibraryImportTask) => {
    tasks[index] = task;
    onTaskChange?.(task);
  };
  const worker = async () => {
    while (cursor < runnable.length) {
      const current = runnable[cursor];
      cursor += 1;
      if (!current) return;
      const uploading = {
        ...current.task,
        status: "uploading" as const,
        reason: undefined,
      };
      update(current.index, uploading);
      try {
        const result = await upload(uploading.file);
        update(current.index, {
          ...uploading,
          status: result.outcome,
          retryable: false,
        });
      } catch (error) {
        update(current.index, failureTask(uploading, error));
      }
    }
  };

  await Promise.all(
    Array.from(
      {
        length: Math.min(PUBLIC_LIBRARY_BROWSER_CONCURRENCY, runnable.length),
      },
      () => worker(),
    ),
  );
  return tasks;
}
