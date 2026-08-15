"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { FileText, RotateCcw, Upload, X } from "lucide-react";
import { ReaderDialogSurface } from "@/components/reader/ReaderDialogSurface";
import { normalizeShareToken } from "@/lib/api";
import {
  PublicLibraryMaintenanceClient,
  type PublicLibraryCategory,
} from "./public-library-maintenance-client";
import {
  PublicLibraryBatchLimitError,
  preparePublicLibraryImportTasks,
  runPublicLibraryImportQueue,
  type PublicLibraryImportTask,
} from "./public-library-import-queue";

const categories: PublicLibraryCategory[] = [
  "文学",
  "经典",
  "思想",
  "技术",
  "其他",
];

const statusLabel = {
  queued: "待入阁",
  uploading: "正在入阁",
  created: "已入阁",
  unchanged: "已在阁中",
  duplicate: "书目冲突",
  failed: "未入阁",
} as const;

interface PublicLibraryImportDialogProps {
  fallbackFocus: RefObject<HTMLElement>;
  onClose: () => void;
  onCompleted: () => void;
  open: boolean;
}

export function PublicLibraryImportDialog({
  fallbackFocus,
  onClose,
  onCompleted,
  open,
}: PublicLibraryImportDialogProps) {
  const [category, setCategory] = useState<PublicLibraryCategory>("经典");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [tasks, setTasks] = useState<PublicLibraryImportTask[]>([]);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory("经典");
    setRightsConfirmed(false);
    setTasks([]);
    setMessage("");
    setRunning(false);
  }, [open]);

  const counts = useMemo(
    () =>
      tasks.reduce(
        (result, task) => {
          result[task.status] += 1;
          return result;
        },
        {
          queued: 0,
          uploading: 0,
          created: 0,
          unchanged: 0,
          duplicate: 0,
          failed: 0,
        },
      ),
    [tasks],
  );

  if (!open) return null;

  const replaceTask = (nextTask: PublicLibraryImportTask) => {
    setTasks((current) =>
      current.map((task) => (task.id === nextTask.id ? nextTask : task)),
    );
  };

  const chooseFiles = (files: FileList | null) => {
    setMessage("");
    try {
      setTasks(preparePublicLibraryImportTasks(Array.from(files ?? [])));
    } catch (error) {
      setTasks([]);
      if (error instanceof PublicLibraryBatchLimitError) {
        setMessage(
          error.code === "too_many_files"
            ? "一次最多选择 200 个 TXT 文件。"
            : "本批文件总量超过 200 MiB，请分批入阁。",
        );
      } else {
        setMessage("无法读取这次文件选择。");
      }
    }
  };

  const runQueue = async (retryOnly = false) => {
    if (running || !rightsConfirmed) return;
    const maintenanceKey = normalizeShareToken(
      window.localStorage.getItem("reader-share-token"),
    );
    if (!maintenanceKey) {
      setMessage("请先在书架设置私有云密钥，再尝试入阁。");
      return;
    }
    const sourceTasks = tasks.map((task) =>
      retryOnly && task.status === "failed" && task.retryable
        ? { ...task, status: "queued" as const, reason: undefined }
        : task,
    );
    if (!sourceTasks.some((task) => task.status === "queued")) return;

    setTasks(sourceTasks);
    setRunning(true);
    setMessage("");
    try {
      const client = new PublicLibraryMaintenanceClient(maintenanceKey);
      const result = await runPublicLibraryImportQueue(
        sourceTasks,
        (file) => client.publishFile(file, { category, rightsConfirmed: true }),
        replaceTask,
      );
      setTasks(result);
      const changed = result.some((task) => task.status === "created");
      if (changed) onCompleted();
      setMessage(
        result.some((task) => task.status === "failed")
          ? "本批已处理完成，请查看每本书的结果。"
          : "本批已处理完成。",
      );
    } finally {
      setRunning(false);
    }
  };

  const retryableCount = tasks.filter(
    (task) => task.status === "failed" && task.retryable,
  ).length;
  const visibleTasks = tasks.slice(0, 50);

  return (
    <ReaderDialogSurface
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#2c2621]/40 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      fallbackFocus={() => fallbackFocus.current}
      label="入阁"
      onClose={() => {
        if (!running) onClose();
      }}
      open={open}
    >
      <section className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl sm:rounded-[28px]">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-[var(--color-primary)]">
              公共明文副本
            </p>
            <h2 className="mt-1 [font-family:var(--font-display)] text-xl font-semibold">
              选择 TXT 文件入阁
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
              最多 200 本，单本 20 MiB，本批总量 200 MiB。
            </p>
          </div>
          <button
            aria-label="关闭入阁面板"
            className="ui-focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] disabled:opacity-40"
            disabled={running}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-5 sm:px-6">
          <label
            className="block text-sm font-semibold"
            htmlFor="public-library-category"
          >
            固定分类
          </label>
          <select
            className="ui-focus-ring mt-2 min-h-11 w-full rounded-2xl border border-[var(--color-border)] bg-white/80 px-4 text-sm"
            disabled={running}
            id="public-library-category"
            onChange={(event) =>
              setCategory(event.target.value as PublicLibraryCategory)
            }
            value={category}
          >
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <label className="ui-focus-ring mt-4 flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-white/65 px-4 py-3 text-sm leading-6">
            <input
              checked={rightsConfirmed}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
              disabled={running}
              onChange={(event) => setRightsConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>
              将创建公共明文副本，本实例访客可读取；私人原书、进度与笔记不会公开或改动。
            </span>
          </label>

          <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-dashed border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-5 text-sm font-semibold text-[var(--color-primary)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-primary)]">
            <Upload aria-hidden="true" className="h-4 w-4" />
            选择 TXT 文件
            <input
              accept=".txt,text/plain"
              className="sr-only"
              disabled={running}
              multiple
              onChange={(event) => {
                chooseFiles(event.target.files);
                event.target.value = "";
              }}
              type="file"
            />
          </label>

          {tasks.length > 0 && (
            <div className="mt-5">
              <div
                className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]"
                role="status"
              >
                <span>待处理 {counts.queued + counts.uploading}</span>
                <span>已入阁 {counts.created}</span>
                <span>已存在 {counts.unchanged}</span>
                <span>未入阁 {counts.failed + counts.duplicate}</span>
              </div>
              <ul className="mt-3 space-y-2" data-public-library-task-list>
                {visibleTasks.map((task) => (
                  <li
                    className="flex min-h-11 items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white/65 px-3 py-2"
                    key={task.id}
                  >
                    <FileText
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-[var(--color-muted)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {task.file.name}
                      </p>
                      {task.reason && (
                        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                          {task.reason}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-[var(--color-primary)]">
                      {statusLabel[task.status]}
                    </span>
                  </li>
                ))}
              </ul>
              {tasks.length > visibleTasks.length && (
                <p className="mt-2 text-xs text-[var(--color-muted)]">
                  仅展示前 50 项，其余 {tasks.length - visibleTasks.length}{" "}
                  项已纳入上方汇总。
                </p>
              )}
            </div>
          )}

          {message && (
            <p
              className="mt-4 rounded-2xl border border-[var(--color-border)] bg-white/75 p-3 text-sm"
              role="alert"
            >
              {message}
            </p>
          )}
        </div>

        <footer className="flex flex-wrap justify-end gap-3 border-t border-[var(--color-border)] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-4">
          {retryableCount > 0 && !running && (
            <button
              className="ui-focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--color-border)] px-5 text-sm font-semibold"
              onClick={() => void runQueue(true)}
              type="button"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              仅重试失败项
            </button>
          )}
          <button
            className="ui-focus-ring min-h-11 rounded-full bg-[var(--color-primary)] px-6 text-sm font-semibold text-white disabled:opacity-40"
            disabled={
              running ||
              !rightsConfirmed ||
              !tasks.some((task) => task.status === "queued")
            }
            onClick={() => void runQueue(false)}
            type="button"
          >
            {running ? "正在入阁…" : "开始入阁"}
          </button>
        </footer>
      </section>
    </ReaderDialogSurface>
  );
}
