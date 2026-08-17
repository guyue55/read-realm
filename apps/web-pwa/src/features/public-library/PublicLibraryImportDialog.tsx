"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  FolderOpen,
  RotateCcw,
  Server,
  Upload,
  X,
} from "lucide-react";
import { ReaderDialogSurface } from "@/components/reader/ReaderDialogSurface";
import { normalizeShareToken } from "@/lib/api";
import {
  PublicLibraryMaintenanceClient,
  type PublicLibraryCategory,
  type PublicLibraryScanJob,
  type PublicLibraryScanRoot,
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
  const [folderSupported, setFolderSupported] = useState(false);
  const [scanRoots, setScanRoots] = useState<PublicLibraryScanRoot[]>([]);
  const [selectedRootId, setSelectedRootId] = useState("");
  const [scanJob, setScanJob] = useState<PublicLibraryScanJob>();
  const [scanMessage, setScanMessage] = useState("");
  const [scanRunning, setScanRunning] = useState(false);
  const scanGenerationRef = useRef(0);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCategory("经典");
    setRightsConfirmed(false);
    setTasks([]);
    setMessage("");
    setRunning(false);
    setScanRoots([]);
    setSelectedRootId("");
    setScanJob(undefined);
    setScanMessage("");
    setScanRunning(false);
    setFolderSupported("webkitdirectory" in document.createElement("input"));
    const generation = ++scanGenerationRef.current;
    const maintenanceKey = normalizeShareToken(
      window.localStorage.getItem("reader-share-token"),
    );
    if (maintenanceKey) {
      const client = new PublicLibraryMaintenanceClient(maintenanceKey);
      void client
        .listScanRoots()
        .then((roots) => {
          if (scanGenerationRef.current !== generation) return;
          setScanRoots(roots);
          setSelectedRootId(roots[0]?.rootId ?? "");
        })
        .catch(() => {
          if (scanGenerationRef.current === generation) {
            setScanMessage("服务端维护目录暂不可用，仍可选择本地 TXT 入阁。");
          }
        });
    }
    return () => {
      scanGenerationRef.current += 1;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !folderSupported) return;
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, [folderSupported, open]);

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
    // 允许空密钥：无限制模式（服务端 ALLOW_ANY=1）下匿名访客也可入阁，
    // 权限交给服务端判定；无权限时服务端返回 403，前端会提示填入同步口令。
    const maintenanceKey = normalizeShareToken(
      window.localStorage.getItem("reader-share-token"),
    );
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
        (file, relativePath) =>
          client.publishFile(file, {
            category,
            relativePath,
            rightsConfirmed: true,
          }),
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
  const busy = running || scanRunning;

  const runServerScan = async () => {
    if (busy || !rightsConfirmed || !selectedRootId) return;
    const maintenanceKey = normalizeShareToken(
      window.localStorage.getItem("reader-share-token"),
    );
    if (!maintenanceKey) {
      setScanMessage("请先在书架设置私有云密钥，再尝试扫描维护目录。");
      return;
    }
    const generation = ++scanGenerationRef.current;
    const client = new PublicLibraryMaintenanceClient(maintenanceKey);
    setScanRunning(true);
    setScanMessage("");
    try {
      let job = await client.startScan(selectedRootId);
      if (scanGenerationRef.current !== generation) return;
      setScanJob(job);
      while (job.status === "running") {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        if (scanGenerationRef.current !== generation) return;
        job = await client.getScan(job.scanId);
        setScanJob(job);
      }
      if (job.createdCount > 0) onCompleted();
      setScanMessage(
        job.status === "completed"
          ? "维护目录扫描完成。"
          : job.status === "completed_with_errors"
            ? "扫描已完成，但有条目未入阁，请查看结果。"
            : "扫描未完成，既有馆藏与上次完整代际保持不变。",
      );
    } catch (error) {
      if (scanGenerationRef.current !== generation) return;
      setScanMessage(
        error instanceof Error && error.message === "scan_already_running"
          ? "该维护目录正在扫描，请稍后重试。"
          : "服务端目录扫描失败，既有馆藏未受影响。",
      );
    } finally {
      if (scanGenerationRef.current === generation) setScanRunning(false);
    }
  };

  return createPortal(
    <ReaderDialogSurface
      className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden overscroll-none bg-[#2c2621]/40 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      fallbackFocus={() => fallbackFocus.current}
      label="入阁"
      onClose={() => {
        if (!running) onClose();
      }}
      open={open}
    >
      <section
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl sm:rounded-[28px]"
        style={{
          height: "calc(100dvh - 1rem)",
          maxHeight: "92dvh",
          minHeight: 0,
        }}
      >
        <header className="relative z-10 flex shrink-0 items-start justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-[var(--color-primary)]">
              公共明文副本
            </p>
            <h2 className="mt-1 [font-family:var(--font-display)] text-xl font-semibold">
              选择 TXT 文件入阁
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
              最多 200 本，单本 20 MiB，本批 200 MiB，目录深度最多 12 层。
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

        <div
          className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6"
          style={{ minHeight: 0 }}
        >
          <label
            className="block text-sm font-semibold"
            htmlFor="public-library-category"
          >
            固定分类
          </label>
          <select
            className="ui-focus-ring mt-2 min-h-11 w-full rounded-2xl border border-[var(--color-border)] bg-white/80 px-4 text-sm"
            disabled={busy}
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
              disabled={busy}
              onChange={(event) => setRightsConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>
              将创建公共明文副本，本实例访客可读取；私人原书、进度与笔记不会公开或改动。
            </span>
          </label>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-dashed border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-5 text-sm font-semibold text-[var(--color-primary)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-primary)]">
              <Upload aria-hidden="true" className="h-4 w-4" />
              选择 TXT 文件
              <input
                accept=".txt,text/plain"
                className="sr-only"
                disabled={busy}
                multiple
                onChange={(event) => {
                  chooseFiles(event.target.files);
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
            {folderSupported ? (
              <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-dashed border-[var(--color-primary)] bg-white/70 px-5 text-sm font-semibold text-[var(--color-primary)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-primary)]">
                <FolderOpen aria-hidden="true" className="h-4 w-4" />
                选择 TXT 文件夹
                <input
                  accept=".txt,text/plain"
                  className="sr-only"
                  disabled={busy}
                  multiple
                  onChange={(event) => {
                    chooseFiles(event.target.files);
                    event.target.value = "";
                  }}
                  ref={folderInputRef}
                  type="file"
                />
              </label>
            ) : (
              <p className="flex min-h-11 items-center rounded-2xl border border-[var(--color-border)] bg-white/60 px-4 text-xs leading-5 text-[var(--color-muted)]">
                当前设备请多选 TXT 文件。
              </p>
            )}
          </div>

          <section className="mt-6 rounded-[22px] border border-[var(--color-border)] bg-white/55 p-4">
            <div className="flex items-start gap-3">
              <Server
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]"
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">服务端目录</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
                  只扫描运维预先配置的目录；不会显示主机路径，也不会移动、重命名或修改原文件。
                </p>
              </div>
            </div>
            {scanRoots.length > 0 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="sr-only" htmlFor="public-library-scan-root">
                  维护目录
                </label>
                <select
                  className="ui-focus-ring min-h-11 min-w-0 rounded-2xl border border-[var(--color-border)] bg-white/80 px-4 text-sm"
                  disabled={busy}
                  id="public-library-scan-root"
                  onChange={(event) => setSelectedRootId(event.target.value)}
                  value={selectedRootId}
                >
                  {scanRoots.map((root) => (
                    <option key={root.rootId} value={root.rootId}>
                      {root.label}
                    </option>
                  ))}
                </select>
                <button
                  className="ui-focus-ring min-h-11 rounded-full border border-[var(--color-primary)] px-5 text-sm font-semibold text-[var(--color-primary)] disabled:opacity-40"
                  disabled={busy || !rightsConfirmed || !selectedRootId}
                  onClick={() => void runServerScan()}
                  type="button"
                >
                  {scanRunning ? "正在扫描…" : "扫描并入阁"}
                </button>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-[var(--color-muted)]">
                当前实例未提供可用维护目录；本地文件与文件夹入阁仍可使用。
              </p>
            )}
            {scanJob && (
              <div className="mt-3" role="status">
                <p className="text-xs text-[var(--color-muted)]">
                  已处理 {scanJob.processedCount}/{scanJob.discoveredCount} ·
                  新入阁 {scanJob.createdCount} · 已存在{" "}
                  {scanJob.unchangedCount}· 未入阁{" "}
                  {scanJob.failedCount + scanJob.duplicateCount} · 跳过{" "}
                  {scanJob.skippedCount}
                </p>
                {scanJob.items.length > 0 && (
                  <ul className="mt-2 space-y-1" data-public-library-scan-items>
                    {scanJob.items.slice(0, 50).map((item) => (
                      <li
                        className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-white/70 px-3 text-xs"
                        key={item.relativePath}
                      >
                        <span className="min-w-0 truncate">
                          {item.relativePath}
                        </span>
                        <span className="shrink-0 font-semibold text-[var(--color-primary)]">
                          {item.outcome === "skipped"
                            ? "已跳过"
                            : statusLabel[item.outcome]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {scanMessage && (
              <p className="mt-3 text-xs leading-5" role="alert">
                {scanMessage}
              </p>
            )}
          </section>

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
                        {task.relativePath}
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

        <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-[var(--color-border)] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-4">
          {retryableCount > 0 && !busy && (
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
            className={`ui-focus-ring min-h-11 rounded-full bg-[var(--color-primary)] px-6 text-sm font-semibold text-white ${
              busy
                ? "disabled:opacity-40"
                : !rightsConfirmed ||
                    !tasks.some((task) => task.status === "queued")
                  ? "opacity-45"
                  : ""
            }`}
            disabled={busy}
            onClick={() => {
              if (busy) return;
              if (!rightsConfirmed) {
                setMessage("请先勾选「将创建公共明文副本，本实例访客可读取」后再开始入阁。");
                return;
              }
              if (!tasks.some((task) => task.status === "queued")) {
                setMessage("请先选择至少一个 TXT 文件再开始入阁。");
                return;
              }
              void runQueue(false);
            }}
            type="button"
          >
            {running ? "正在入阁…" : "开始入阁"}
          </button>
        </footer>
      </section>
    </ReaderDialogSurface>,
    document.body,
  );
}
