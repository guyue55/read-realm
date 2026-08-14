"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_READER_SETTINGS,
  loadReaderSettings,
  queueReaderSettingsSave,
  type ReaderSettingsState,
} from "@/lib/reader-settings";
import { THEMES, type ThemeName } from "@/styles/themes";
import { strings } from "@/lib/i18n";
import { AppShell } from "@/components/AppShell";
import { useVirtualRouter } from "@/lib/route-store";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AIConfigPanel } from "@/components/settings/AIConfigPanel";
import {
  createBrowserPortableDataBackup,
  describeLocalDataBackupError,
  inspectBrowserPortableDataBackup,
  mergeBrowserPortableDataBackup,
  planBrowserPortableMerge,
  restoreBrowserPortableDataBackup,
} from "@/lib/local-data-backup";
import type {
  LocalDataMergePlan,
  LocalDataMergeResolution,
  PortableBackupPreview,
} from "@reader/storage-core";

export default function SettingsPage() {
  const router = useVirtualRouter();

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.replace(`/#${window.location.pathname}${window.location.search}`);
    }
  }, []);

  const [settings, setSettings] = useState<ReaderSettingsState>(
    DEFAULT_READER_SETTINGS,
  );
  const [saved, setSaved] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [backupStatus, setBackupStatus] = useState<{
    state: "idle" | "working" | "success" | "failed";
    message: string;
  }>({ state: "idle", message: "" });
  const [restorePreview, setRestorePreview] = useState<{
    serialized: string;
    fileName: string;
    preview: PortableBackupPreview;
  } | null>(null);
  const [restoreMode, setRestoreMode] = useState<"copy" | "merge">("copy");
  const [mergePlan, setMergePlan] = useState<LocalDataMergePlan | null>(null);
  const [mergeResolutions, setMergeResolutions] = useState<
    Record<string, LocalDataMergeResolution>
  >({});
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDanger: boolean;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    isDanger: false,
    onConfirm: () => {},
  });

  useEffect(() => {
    setSettings(loadReaderSettings());
  }, []);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const settingsGenerationRef = useRef(0);
  const restoreMutexRef = useRef(false);

  const markSaved = () => {
    setSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSaved(false), 1200);
  };

  const saveNextSettings = async (nextSettings: ReaderSettingsState) => {
    const generation = ++settingsGenerationRef.current;
    setSettings(nextSettings);
    setSettingsError("");
    try {
      await queueReaderSettingsSave(nextSettings);
      if (generation === settingsGenerationRef.current) markSaved();
    } catch (error) {
      console.error("设置保存失败", error);
      if (generation === settingsGenerationRef.current) {
        setSettings(loadReaderSettings());
        setSaved(false);
        setSettingsError("设置保存失败，已恢复为上次成功保存的值。");
      }
    }
  };

  // 拖动期间仅更新 React State，变动 CSS 变量触发预览重绘，无任何 IO 与定时器开销，保障 60fps 流畅度
  const handleSettingChange = (nextSettings: ReaderSettingsState) => {
    setSettings(nextSettings);
  };

  // 拖动结束/松开时执行写盘，并单次优雅触发保存气泡
  const handleSettingCommit = async (nextSettings: ReaderSettingsState) => {
    const generation = ++settingsGenerationRef.current;
    setSettingsError("");
    try {
      await queueReaderSettingsSave(nextSettings);
      if (generation === settingsGenerationRef.current) markSaved();
    } catch (error) {
      console.error("设置保存失败", error);
      if (generation === settingsGenerationRef.current) {
        setSettings(loadReaderSettings());
        setSaved(false);
        setSettingsError("设置保存失败，已恢复为上次成功保存的值。");
      }
    }
  };

  const updateTheme = (theme: ThemeName) => {
    void saveNextSettings({ ...settings, theme });
  };

  const updateUiMode = (uiMode: "default" | "simple") => {
    void saveNextSettings({ ...settings, uiMode });
  };

  const handleReset = () => {
    setConfirmState({
      isOpen: true,
      title: "重置排版配置",
      message: "确定要恢复默认排版设置吗？此操作将立即恢复纸墨底色、字号行间至初始状态。",
      isDanger: false,
      onConfirm: () => {
        return saveNextSettings(DEFAULT_READER_SETTINGS);
      }
    });
  };

  const handleCreateBackup = async () => {
    setBackupStatus({ state: "working", message: "正在核对完整本地数据…" });
    try {
      const serialized = await createBrowserPortableDataBackup();
      const preview = await inspectBrowserPortableDataBackup(serialized);
      const blob = new Blob([serialized], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `read-realm-portable-backup-${preview.contentId.slice(0, 16)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setBackupStatus({
        state: "success",
        message: "完整备份包已下载；manifest 已记录版本、条目大小与 SHA-256 校验。",
      });
    } catch (error) {
      setBackupStatus({
        state: "failed",
        message: describeLocalDataBackupError(error),
      });
    }
  };

  const handleRestoreBackup = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (restoreMutexRef.current) {
      event.target.value = "";
      return;
    }
    restoreMutexRef.current = true;
    setRestorePreview(null);
    setMergePlan(null);
    setMergeResolutions({});
    setRestoreMode("copy");
    setBackupStatus({ state: "working", message: "正在逐项校验备份并生成恢复预览…" });
    try {
      const serialized = await file.text();
      const [preview, nextMergePlan] = await Promise.all([
        inspectBrowserPortableDataBackup(serialized),
        planBrowserPortableMerge(serialized),
      ]);
      setRestorePreview({ serialized, fileName: file.name, preview });
      setMergePlan(nextMergePlan);
      setBackupStatus({
        state: "success",
        message: "校验通过；请核对下方影响后再确认恢复，当前尚未写入书架。",
      });
    } catch (error) {
      setBackupStatus({
        state: "failed",
        message: describeLocalDataBackupError(error),
      });
    } finally {
      restoreMutexRef.current = false;
      event.target.value = "";
    }
  };

  const handleConfirmPortableRestore = async () => {
    if (!restorePreview) return;
    if (restoreMutexRef.current) return;
    restoreMutexRef.current = true;
    setBackupStatus({
      state: "working",
      message:
        restoreMode === "merge"
          ? "正在按冲突选择合并，并准备失败回滚…"
          : "正在恢复到空书架并逐项回读校验…",
    });
    try {
      if (restoreMode === "merge") {
        const nextPlan = await planBrowserPortableMerge(
          restorePreview.serialized,
          mergeResolutions,
        );
        setMergePlan(nextPlan);
        if (!nextPlan.executable) {
          throw new Error(
            `LOCAL_DATA_MERGE_UNRESOLVED_CONFLICTS:${nextPlan.unresolvedConflictKeys.join(",")}`,
          );
        }
        const result = await mergeBrowserPortableDataBackup(
          restorePreview.serialized,
          mergeResolutions,
        );
        setSettings(loadReaderSettings());
        setRestorePreview(null);
        setMergePlan(null);
        setBackupStatus({
          state: "success",
          message: `合并完成：新增 ${result.summary.addedBooks} 本书、${result.summary.addedChapters} 章，推进 ${result.summary.advancedProgress} 条进度。`,
        });
        return;
      }
      const result = await restoreBrowserPortableDataBackup(restorePreview.serialized);
      setSettings(loadReaderSettings());
      setRestorePreview(null);
      setBackupStatus({
        state: "success",
        message: `恢复完成：${result.bookCount} 本书、${result.chapterCount} 章、${result.progressCount} 条进度。`,
      });
    } catch (error) {
      setBackupStatus({ state: "failed", message: describeLocalDataBackupError(error) });
    } finally {
      restoreMutexRef.current = false;
    }
  };

  const currentTheme = THEMES[settings.theme];
  const isDark = settings.theme === "dark";

  return (
    <AppShell
      title="设置"
      subtitle="案前雅度，因人而适。在这里微调行间章合，雕刻最契合您双眸的心流世界。"
      rightNodes={
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="ui-focus-ring rounded-full border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--ui-text)] transition-all hover:bg-white hover:text-[var(--ui-accent)] flex items-center gap-1.5 shadow-sm active:scale-95 duration-200"
          >
            <span>⚙</span> 重置默认
          </button>
          <button
            onClick={() => router.push("/library")}
            className="ui-focus-ring rounded-full border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--ui-text)] transition-colors hover:bg-white shadow-sm"
          >
            返回书架
          </button>
        </div>
      }
    >
      <div className="max-w-3xl mx-auto space-y-6 pb-12">
        {settingsError && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {settingsError}
          </p>
        )}
        <section className="ui-card rounded-[18px] p-5 md:p-6 shadow-[0_12px_32px_rgba(80,65,45,0.04)] hover:shadow-[0_18px_42px_rgba(80,65,45,0.06)] transition-all duration-300 physics-spring">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">界面密度</h2>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                调整书架的信息密度，阅读功能保持一致。
              </p>
            </div>
            {saved && (
              <span className="rounded-full bg-[var(--ui-accent-soft)] px-3 py-1 text-sm font-semibold text-[var(--ui-accent)]">
                {strings.settings.saved}
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => updateUiMode("default")}
              className={`ui-focus-ring rounded-[16px] border p-5 text-left transition-all ${
                settings.uiMode === "default"
                  ? "border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] ring-2 ring-[rgba(95,125,82,0.16)]"
                  : "border-[var(--ui-border)] bg-white/64 hover:border-[var(--ui-warm)]"
              }`}
            >
              <span className="block text-base font-bold text-[var(--ui-text)]">
                舒展
              </span>
              <span className="mt-1 block text-sm text-[var(--ui-muted)]">
                留白更充足，适合大屏浏览。
              </span>
            </button>
            <button
              onClick={() => updateUiMode("simple")}
              className={`ui-focus-ring rounded-[16px] border p-5 text-left transition-all ${
                settings.uiMode === "simple"
                  ? "border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] ring-2 ring-[rgba(95,125,82,0.16)]"
                  : "border-[var(--ui-border)] bg-white/64 hover:border-[var(--ui-warm)]"
              }`}
            >
              <span className="block text-base font-bold text-[var(--ui-text)]">
                紧凑
              </span>
              <span className="mt-1 block text-sm text-[var(--ui-muted)]">
                缩短书卡间距，适合小屏和大量藏书。
              </span>
            </button>
          </div>
        </section>

        <section className="ui-card rounded-[18px] p-5 md:p-6 shadow-[0_12px_32px_rgba(80,65,45,0.04)]">
          <div className="mb-4">
            <h2 className="text-lg font-bold">本地备份与空库恢复</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--ui-muted)]">
              导出已完整缓存的书籍、正文、进度、书签与阅读设置。恢复只允许空书架，不会覆盖现有数据。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleCreateBackup()}
              disabled={backupStatus.state === "working"}
              className="ui-focus-ring min-h-11 rounded-xl bg-[var(--ui-accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              下载完整备份包
            </button>
            <label className={`ui-focus-ring flex min-h-11 items-center rounded-xl border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-bold ${backupStatus.state === "working" ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
              选择备份恢复
              <input
                type="file"
                accept="application/json,.json"
                aria-label="选择阅读备份文件"
                disabled={backupStatus.state === "working"}
                onChange={(event) => void handleRestoreBackup(event)}
                className="sr-only"
              />
            </label>
          </div>
          {backupStatus.message && (
            <p
              role={backupStatus.state === "failed" ? "alert" : "status"}
              className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                backupStatus.state === "failed"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-[var(--ui-border)] bg-white/64 text-[var(--ui-text)]"
              }`}
            >
              {backupStatus.message}
            </p>
          )}
          {restorePreview && (
            <div
              aria-label="备份恢复预览"
              className="mt-4 rounded-xl border border-[var(--ui-border)] bg-white/72 p-4"
            >
              <h3 className="font-bold">恢复影响预览</h3>
              <p className="mt-1 break-all text-sm text-[var(--ui-muted)]">
                {restorePreview.fileName} · 包格式 v{restorePreview.preview.packageVersion}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                <div><dt className="text-[var(--ui-muted)]">书籍</dt><dd className="font-bold">{restorePreview.preview.counts.books}</dd></div>
                <div><dt className="text-[var(--ui-muted)]">章节</dt><dd className="font-bold">{restorePreview.preview.counts.chapters}</dd></div>
                <div><dt className="text-[var(--ui-muted)]">进度</dt><dd className="font-bold">{restorePreview.preview.counts.progress}</dd></div>
                <div><dt className="text-[var(--ui-muted)]">书签</dt><dd className="font-bold">{restorePreview.preview.counts.bookmarks}</dd></div>
                <div><dt className="text-[var(--ui-muted)]">文件引用</dt><dd className="font-bold">{restorePreview.preview.counts.fileRefs}</dd></div>
              </dl>
              <p className="mt-3 text-sm text-[var(--ui-muted)]">
                选择恢复方式后再确认。空库副本不会覆盖现有书架；合并模式会列出同 ID 内容冲突，不会静默覆盖。
              </p>
              {restorePreview.preview.warnings.map((warning) => (
                <p key={warning} className="mt-2 text-sm text-amber-700">{warning}</p>
              ))}
              <div className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="恢复模式">
                <button
                  type="button"
                  aria-pressed={restoreMode === "copy"}
                  onClick={() => setRestoreMode("copy")}
                  className={`ui-focus-ring min-h-11 rounded-xl border px-4 py-3 text-left text-sm ${restoreMode === "copy" ? "border-[var(--ui-accent)] bg-[var(--ui-accent-soft)]" : "border-[var(--ui-border)] bg-white/70"}`}
                >
                  <span className="block font-bold">空库副本恢复</span>
                  <span className="mt-1 block text-[var(--ui-muted)]">只允许空书架，确认后逐项回读。</span>
                </button>
                <button
                  type="button"
                  aria-pressed={restoreMode === "merge"}
                  onClick={() => setRestoreMode("merge")}
                  className={`ui-focus-ring min-h-11 rounded-xl border px-4 py-3 text-left text-sm ${restoreMode === "merge" ? "border-[var(--ui-accent)] bg-[var(--ui-accent-soft)]" : "border-[var(--ui-border)] bg-white/70"}`}
                >
                  <span className="block font-bold">合并当前书架</span>
                  <span className="mt-1 block text-[var(--ui-muted)]">新增项直接加入，内容分歧逐项决定。</span>
                </button>
              </div>
              {restoreMode === "merge" && mergePlan && (
                <div className="mt-4 space-y-3" aria-label="合并冲突清单">
                  <p className="text-sm text-[var(--ui-muted)]">
                    将新增 {mergePlan.summary.addedBooks} 本书、{mergePlan.summary.addedChapters} 章；发现 {mergePlan.conflicts.length} 项内容分歧。
                  </p>
                  {mergePlan.conflicts.map((conflict) => (
                    <fieldset key={conflict.key} className="rounded-xl border border-[var(--ui-border)] p-3">
                      <legend className="px-1 text-sm font-bold">
                        {conflict.kind === "settings" ? "阅读设置" : `${conflict.kind} · ${conflict.id}`}
                      </legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(["keep-existing", "use-incoming"] as const).map((choice) => (
                          <button
                            key={choice}
                            type="button"
                            aria-pressed={mergeResolutions[conflict.key] === choice}
                            onClick={() => setMergeResolutions((current) => ({ ...current, [conflict.key]: choice }))}
                            className={`ui-focus-ring min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold ${mergeResolutions[conflict.key] === choice ? "border-[var(--ui-accent)] bg-[var(--ui-accent-soft)]" : "border-[var(--ui-border)] bg-white/70"}`}
                          >
                            {choice === "keep-existing" ? "保留现有" : "使用备份"}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleConfirmPortableRestore()}
                  disabled={backupStatus.state === "working"}
                  className="ui-focus-ring min-h-11 rounded-xl bg-[var(--ui-accent)] px-4 py-2 text-sm font-bold text-white"
                >
                  {restoreMode === "merge" ? "确认合并并校验" : "确认恢复到空书架"}
                </button>
                <button
                  type="button"
                  disabled={backupStatus.state === "working"}
                  onClick={() => {
                    setRestorePreview(null);
                    setMergePlan(null);
                    setMergeResolutions({});
                    setBackupStatus({ state: "idle", message: "已取消恢复，书架未发生变化。" });
                  }}
                  className="ui-focus-ring min-h-11 rounded-xl border border-[var(--ui-border)] bg-white/70 px-4 py-2 text-sm font-bold"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="ui-card rounded-[18px] p-5 md:p-6 shadow-[0_12px_32px_rgba(80,65,45,0.04)] hover:shadow-[0_18px_42px_rgba(80,65,45,0.06)] transition-all duration-300 physics-spring">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">{strings.settings.theme}</h2>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                {strings.settings.themeHint}
              </p>
            </div>
            {saved && (
              <span className="rounded-full bg-[var(--ui-accent-soft)] px-3 py-1 text-sm font-semibold text-[var(--ui-accent)]">
                {strings.settings.saved}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Object.entries(THEMES).map(([name, colors]) => {
              const themeName = name as ThemeName;
              const isActive = settings.theme === themeName;

              return (
                <button
                  key={name}
                  onClick={() => updateTheme(themeName)}
                  className={`ui-focus-ring flex min-h-24 flex-col justify-between rounded-[14px] border p-3 text-left shadow-sm transition-all hover:scale-[1.03] active:scale-95 ${
                    isActive
                      ? "border-[var(--ui-accent)] ring-2 ring-[rgba(95,125,82,0.18)]"
                      : "border-[rgba(80,65,45,0.12)] hover:border-[var(--ui-warm)]"
                  }`}
                  style={{ backgroundColor: colors.bg, color: colors.text }}
                >
                  <span className="text-sm font-bold">
                    {strings.reader.themeNames[themeName]}
                  </span>
                  <span
                    className="h-6 w-6 rounded-full border"
                    style={{
                      backgroundColor: colors.bg,
                      borderColor: colors.text,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </section>

        <section className="ui-card rounded-[18px] p-5 md:p-6 shadow-[0_12px_32px_rgba(80,65,45,0.04)] hover:shadow-[0_18px_42px_rgba(80,65,45,0.06)] transition-all duration-300 physics-spring">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">字体风雅</h2>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                选择适合当前书卷意境的印刷字体。系统默认使用优雅护眼的国风楷体。
              </p>
            </div>
            {saved && (
              <span className="rounded-full bg-[var(--ui-accent-soft)] px-3 py-1 text-sm font-semibold text-[var(--ui-accent)]">
                {strings.settings.saved}
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                key: "kaiti",
                name: "楷体 (Kaiti)",
                desc: "笔锋流丽，宣纸生香。最契合古典宁静的心流之选。",
              },
              {
                key: "songti",
                name: "宋体 (Songti)",
                desc: "版刻雕木，庄重隽永。提供长篇巨著的纸质印刷级体验。",
              },
              {
                key: "heiti",
                name: "黑体 (Heiti)",
                desc: "规整锐利，数智清朗。清晰流畅的现代化屏显标准。",
              },
            ].map((f) => {
              const isActive = settings.fontFamily === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() =>
                    void saveNextSettings({
                      ...settings,
                      fontFamily: f.key as "kaiti" | "songti" | "heiti",
                    })
                  }
                  className={`ui-focus-ring flex flex-col justify-between rounded-[16px] border p-4 text-left transition-all hover:scale-[1.02] active:scale-95 duration-200 ${
                    isActive
                      ? "border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] ring-2 ring-[rgba(95,125,82,0.16)]"
                      : "border-[var(--ui-border)] bg-white/64 hover:border-[var(--ui-warm)]"
                  }`}
                >
                  <span
                    className="block text-base font-bold text-[var(--ui-text)]"
                    style={{ fontFamily: `var(--font-${f.key})` }}
                  >
                    {f.name}
                  </span>
                  <span className="mt-2 block text-xs text-[var(--ui-muted)] leading-relaxed">
                    {f.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="ui-card rounded-[18px] p-5 md:p-6 space-y-6 shadow-[0_12px_32px_rgba(80,65,45,0.04)] hover:shadow-[0_18px_42px_rgba(80,65,45,0.06)] transition-all duration-300 physics-spring">
          <div>
            <h2 className="text-lg font-bold">排版微调</h2>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              自由解耦四大印刷维度的微秒级形变，调节最适合您的中文宁静排版黄金比例。
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* 字号滑轨 */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-[var(--ui-text)]">字号 (Size)</span>
                <span className="text-[var(--ui-accent)]">{settings.fontSize} px</span>
              </div>
              <input
                type="range"
                aria-label="字号"
                min="14"
                max="36"
                step="1"
                value={settings.fontSize}
                onChange={(e) => handleSettingChange({ ...settings, fontSize: parseInt(e.target.value) })}
                onMouseUp={() => void handleSettingCommit(settings)}
                onTouchEnd={() => void handleSettingCommit(settings)}
                onBlur={() => void handleSettingCommit(settings)}
                className="w-full h-1.5 bg-[rgba(80,65,45,0.08)] rounded-lg appearance-none cursor-pointer accent-[var(--ui-accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--ui-quiet)]">
                <span>小号 (14px)</span>
                <span>大号 (36px)</span>
              </div>
            </div>

            {/* 行高滑轨 */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-[var(--ui-text)]">行高 (Line Height)</span>
                <span className="text-[var(--ui-accent)]">{settings.lineHeight} 倍</span>
              </div>
              <input
                type="range"
                aria-label="行高"
                min="1.3"
                max="2.4"
                step="0.1"
                value={settings.lineHeight}
                onChange={(e) => handleSettingChange({ ...settings, lineHeight: parseFloat(e.target.value) })}
                onMouseUp={() => void handleSettingCommit(settings)}
                onTouchEnd={() => void handleSettingCommit(settings)}
                onBlur={() => void handleSettingCommit(settings)}
                className="w-full h-1.5 bg-[rgba(80,65,45,0.08)] rounded-lg appearance-none cursor-pointer accent-[var(--ui-accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--ui-quiet)]">
                <span>紧凑 (1.3)</span>
                <span>宽松 (2.4)</span>
              </div>
            </div>

            {/* 段距滑轨 */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-[var(--ui-text)]">段落间距 (Paragraph)</span>
                <span className="text-[var(--ui-accent)]">{settings.paragraphSpacing} px</span>
              </div>
              <input
                type="range"
                aria-label="段落间距"
                min="0"
                max="40"
                step="2"
                value={settings.paragraphSpacing}
                onChange={(e) => handleSettingChange({ ...settings, paragraphSpacing: parseInt(e.target.value) })}
                onMouseUp={() => void handleSettingCommit(settings)}
                onTouchEnd={() => void handleSettingCommit(settings)}
                onBlur={() => void handleSettingCommit(settings)}
                className="w-full h-1.5 bg-[rgba(80,65,45,0.08)] rounded-lg appearance-none cursor-pointer accent-[var(--ui-accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--ui-quiet)]">
                <span>紧密 (0px)</span>
                <span>开阔 (40px)</span>
              </div>
            </div>

            {/* 字距滑轨 */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-[var(--ui-text)]">字符间距 (Letter)</span>
                <span className="text-[var(--ui-accent)]">{settings.letterSpacing} em</span>
              </div>
              <input
                type="range"
                aria-label="字符间距"
                min="-0.05"
                max="0.25"
                step="0.01"
                value={settings.letterSpacing}
                onChange={(e) => handleSettingChange({ ...settings, letterSpacing: parseFloat(e.target.value) })}
                onMouseUp={() => void handleSettingCommit(settings)}
                onTouchEnd={() => void handleSettingCommit(settings)}
                onBlur={() => void handleSettingCommit(settings)}
                className="w-full h-1.5 bg-[rgba(80,65,45,0.08)] rounded-lg appearance-none cursor-pointer accent-[var(--ui-accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--ui-quiet)]">
                <span>紧密 (-0.05em)</span>
                <span>开阔 (0.25em)</span>
              </div>
            </div>
          </div>
        </section>

        <section className="ui-card rounded-[18px] p-5 md:p-6 shadow-[0_12px_32px_rgba(80,65,45,0.04)] hover:shadow-[0_18px_42px_rgba(80,65,45,0.06)] transition-all duration-300 physics-spring">
          <h2 className="mb-4 text-lg font-bold">
            {strings.settings.previewTitle}
          </h2>
          <div
            className="rounded-[16px] border border-[rgba(80,65,45,0.12)] p-6 shadow-sm transition-all duration-300"
            style={{
              backgroundColor: currentTheme.bg,
              color: currentTheme.text,
            }}
          >
            <h3 className="font-reading-title mb-4 text-2xl font-semibold" style={{ letterSpacing: `${settings.letterSpacing}em` }}>
              黄金排版案头预览
            </h3>
            <div
              className="reader-content"
              style={{
                "--reader-font-family": `var(--font-${settings.fontFamily || "kaiti"})`,
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                "--paragraph-spacing": `${settings.paragraphSpacing}px`,
                "--letter-spacing": `${settings.letterSpacing}em`,
              } as React.CSSProperties}
            >
              <p>
                一页安静的文字，应该像灯下摊开的纸，字与字有了呼吸的空隙，段与段有了落脚的宁静。
              </p>
              <p>
                这是「墨问」为您呈现的全新中式排版微调。行距起承、段距转合、字距呼吸皆在指尖流淌，在最细微的间隙里，雕刻出您最舒适的宁静世界。
              </p>
            </div>
          </div>
        </section>
      </div>

        {/* AI 配置面板 */}
        <section className="ui-card rounded-[18px] p-5 md:p-6 shadow-[0_12px_32px_rgba(80,65,45,0.04)] hover:shadow-[0_18px_42px_rgba(80,65,45,0.06)] transition-all duration-300 physics-spring">
          <AIConfigPanel isDark={isDark} />
        </section>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        isDanger={confirmState.isDanger}
        onConfirm={confirmState.onConfirm}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />
    </AppShell>
  );
}
