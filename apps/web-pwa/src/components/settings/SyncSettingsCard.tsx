"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Cloud,
  Copy,
  KeyRound,
  Link2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { isValidShareToken, normalizeShareToken } from "@/lib/api";
import { strings } from "@/lib/i18n";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  SYNC_CONFIG_EVENT,
  SYNC_STATUS_EVENT,
  SYNC_STATUS_REQUEST_EVENT,
  SYNC_TRIGGER_EVENT,
} from "@/lib/route-store";
import { createLegacyPersonalSyncApiClient } from "@/features/library/legacy-personal-sync-api";

/** 生成访问口令的候选词库（与书架原同步面板一致） */
const POETIC_KEYS = [
  "松风阅心",
  "煮字生涯",
  "寒夜客来",
  "静夜钟声",
  "西窗剪烛",
  "墨染秋池",
  "落木萧萧",
  "独钓寒江",
  "疏影横斜",
  "暗香浮动",
  "云破月来",
  "小楼听雨",
  "青山对弈",
  "半窗晴翠",
  "石栏斜阳",
  "竹露清响",
  "荷风晚照",
  "烟雨行舟",
  "梅雪争春",
  "枯木逢春",
  "泉流石上",
  "草木含情",
  "琴心剑胆",
  "书香门第",
  "笔墨春秋",
  "风回小院",
  "帘外芭蕉",
  "浮生若梦",
  "沧海一粟",
  "坐看云起",
  "行到水穷",
  "晚风吹雨",
];

function readStoredToken(): string {
  if (typeof window === "undefined") return "";
  return normalizeShareToken(window.localStorage.getItem("reader-share-token"));
}

function readStoredFlag(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const val = window.localStorage.getItem(key);
  return val !== "false";
}

/**
 * 设置页「私人云同步」卡片。
 *
 * 原书架顶部同步版块迁移至设置页：集中管理访问口令、自动同步开关与
 * 云端备份清理，让书架保持整洁。存储键与书架自动同步引擎共享
 * （reader-share-token / reader-sync-auto-startup / reader-sync-auto-progress），
 * 设置变更后书架刷新即按新配置运行。
 */
export function SyncSettingsCard() {
  const isOnline = useOnlineStatus();
  const [shareTokenInput, setShareTokenInput] = useState("");
  const [currentShareToken, setCurrentShareToken] = useState(readStoredToken);
  const [autoSyncOnStartup, setAutoSyncOnStartup] = useState(() =>
    readStoredFlag("reader-sync-auto-startup", true),
  );
  const [autoSyncProgressOnReading, setAutoSyncProgressOnReading] = useState(
    () => readStoredFlag("reader-sync-auto-progress", true),
  );
  const [clearingCloud, setClearingCloud] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    isSyncing: boolean;
    syncStepText: string;
    syncProgress: number;
  }>({ isSyncing: false, syncStepText: "", syncProgress: 0 });
  const [operationMessage, setOperationMessage] = useState<{
    kind: "success" | "danger";
    text: string;
  } | null>(null);

  // 口令变化时回填输入框（刷新/外部变更后同步显示）
  useEffect(() => {
    setShareTokenInput(currentShareToken);
  }, [currentShareToken]);

  // 订阅书架广播的同步进行状态；挂载时请求重播一次，避免读到过期默认值
  useEffect(() => {
    const handleSyncStatus = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { isSyncing?: boolean; syncStepText?: string; syncProgress?: number }
        | undefined;
      setSyncStatus({
        isSyncing: Boolean(detail?.isSyncing),
        syncStepText: detail?.syncStepText ?? "",
        syncProgress: detail?.syncProgress ?? 0,
      });
    };
    window.addEventListener(SYNC_STATUS_EVENT, handleSyncStatus);
    window.dispatchEvent(new Event(SYNC_STATUS_REQUEST_EVENT));
    return () => {
      window.removeEventListener(SYNC_STATUS_EVENT, handleSyncStatus);
    };
  }, []);

  const setAutoSyncOnStartupPref = (val: boolean) => {
    setAutoSyncOnStartup(val);
    window.localStorage.setItem("reader-sync-auto-startup", String(val));
  };

  const setAutoSyncProgressPref = (val: boolean) => {
    setAutoSyncProgressOnReading(val);
    window.localStorage.setItem("reader-sync-auto-progress", String(val));
  };

  const flash = (kind: "success" | "danger", text: string) => {
    setOperationMessage({ kind, text });
    window.setTimeout(() => setOperationMessage(null), 4000);
  };

  /** 通知常驻书架视图重新读取口令与云端书目 */
  const broadcastSyncConfigChange = () => {
    window.dispatchEvent(new Event(SYNC_CONFIG_EVENT));
  };

  const handleGeneratePoeticKey = () => {
    const random = crypto.getRandomValues(new Uint32Array(2));
    const idx = random[0] % POETIC_KEYS.length;
    const num = 1000 + (random[1] % 9000);
    setShareTokenInput(`${POETIC_KEYS[idx]}-${num}`);
  };

  const handleBindShareToken = () => {
    const trimmed = shareTokenInput.trim();
    if (!trimmed) return;
    if (!isValidShareToken(trimmed)) {
      flash(
        "danger",
        "访问口令仅支持中文、英文、数字、下划线和短横线，最长 64 位。",
      );
      return;
    }
    window.localStorage.setItem("reader-share-token", trimmed);
    setCurrentShareToken(trimmed);
    setShareTokenInput(trimmed);
    broadcastSyncConfigChange();
    flash("success", strings.sync.shareBindSuccess);
  };

  const handleClearShareToken = () => {
    window.localStorage.removeItem("reader-share-token");
    setCurrentShareToken("");
    setShareTokenInput("");
    broadcastSyncConfigChange();
    flash("success", strings.sync.shareClearSuccess);
  };

  const handleCopyPoeticKey = () => {
    if (!currentShareToken) return;
    navigator.clipboard
      .writeText(currentShareToken)
      .then(() => flash("success", strings.sync.shareCopySuccess))
      .catch((err) => {
        console.error("复制访问口令失败", err);
        flash("danger", "复制失败，请手动复制访问口令。");
      });
  };

  const handleClearCloudBooks = async () => {
    if (!currentShareToken || !isOnline) return;
    setClearingCloud(true);
    try {
      const api = createLegacyPersonalSyncApiClient(currentShareToken);
      await api.clearBooks();
      const remaining = await api.listBooks();
      if (remaining.length > 0) {
        throw new Error("REMOTE_CLEAR_READBACK_NOT_EMPTY");
      }
      broadcastSyncConfigChange();
      flash("success", "私人云端已清空，并完成空库核验。");
    } catch (err) {
      console.error("清空云端备份失败:", err);
      flash("danger", "清空后未能完成云端回读核验，请稍后重试。");
    } finally {
      setClearingCloud(false);
      setConfirmClearOpen(false);
    }
  };

  return (
    <>
      <SettingsCard>
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Cloud
                aria-hidden="true"
                className="h-5 w-5 text-[var(--color-primary)]"
                strokeWidth={1.75}
              />
              {strings.sync.title}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {currentShareToken
                ? strings.sync.diffDesc
                : strings.sync.notConfiguredDesc}
            </p>
          </div>
          {currentShareToken && (
            <span className="shrink-0 rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-sm font-semibold text-[var(--color-primary)]">
              {strings.sync.configuredBadge}
            </span>
          )}
        </div>

        {/* 手动同步：同步引擎依赖书架的本机书目与进度，故由常驻书架执行 */}
        <div className="mb-5 flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[var(--color-muted)]">
              {syncStatus.isSyncing
                ? syncStatus.syncStepText || strings.sync.syncing
                : isOnline
                  ? strings.sync.syncedDesc
                  : strings.sync.offlineDesc}
            </p>
            {syncStatus.isSyncing && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--color-border)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-300 ease-out"
                    style={{ width: `${syncStatus.syncProgress}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs font-semibold text-[var(--color-muted)]">
                  {syncStatus.syncProgress}%
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new Event(SYNC_TRIGGER_EVENT));
            }}
            disabled={!isOnline || !currentShareToken || syncStatus.isSyncing}
            className="ui-focus-ring flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--color-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-strong)] disabled:opacity-40"
          >
            <RefreshCw
              aria-hidden="true"
              className={`h-[18px] w-[18px] ${syncStatus.isSyncing ? "animate-spin" : ""}`}
              strokeWidth={1.75}
            />
            {syncStatus.isSyncing ? strings.sync.syncing : strings.sync.syncBtn}
          </button>
        </div>

        {operationMessage && (
          <p
            role="alert"
            className={`mb-4 rounded-[var(--radius-control)] px-4 py-3 text-sm ${
              operationMessage.kind === "success"
                ? "border border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                : "border border-[#E7B8AF] bg-[#FFF0EC] text-[var(--color-danger)]"
            }`}
          >
            {operationMessage.text}
          </p>
        )}

        {/* 自动同步开关 */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <label className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text)]">
                <Cloud
                  aria-hidden="true"
                  className="h-[18px] w-[18px]"
                  strokeWidth={1.75}
                />
                {strings.sync.autoSyncStartupLabel}
              </label>
              <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
                {strings.sync.autoSyncStartupDesc}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAutoSyncOnStartupPref(!autoSyncOnStartup)}
              disabled={!isOnline}
              aria-label={strings.sync.autoSyncStartupLabel}
              aria-pressed={autoSyncOnStartup}
              className={`ui-focus-ring relative inline-flex h-11 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent p-0.5 transition-colors duration-200 ease-in-out ${
                autoSyncOnStartup && isOnline
                  ? "bg-[var(--color-primary)]"
                  : "bg-gray-200"
              } ${!isOnline ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autoSyncOnStartup && isOnline
                    ? "translate-x-4"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <label className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text)]">
                <BookOpen
                  aria-hidden="true"
                  className="h-[18px] w-[18px]"
                  strokeWidth={1.75}
                />
                {strings.sync.autoSyncProgressLabel}
              </label>
              <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
                {strings.sync.autoSyncProgressDesc}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setAutoSyncProgressPref(!autoSyncProgressOnReading)
              }
              disabled={!isOnline}
              aria-label={strings.sync.autoSyncProgressLabel}
              aria-pressed={autoSyncProgressOnReading}
              className={`ui-focus-ring relative inline-flex h-11 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent p-0.5 transition-colors duration-200 ease-in-out ${
                autoSyncProgressOnReading && isOnline
                  ? "bg-[var(--color-primary)]"
                  : "bg-gray-200"
              } ${!isOnline ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autoSyncProgressOnReading && isOnline
                    ? "translate-x-4"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* 访问口令 */}
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <div className="flex flex-col gap-1.5">
              <label
                className="text-xs font-semibold text-[var(--color-muted)]"
                htmlFor="settings-private-cloud-token"
              >
                {strings.sync.shareKeyLabel}
              </label>
              <div className="flex gap-2">
                <input
                  id="settings-private-cloud-token"
                  type="text"
                  value={shareTokenInput}
                  onChange={(event) => setShareTokenInput(event.target.value)}
                  placeholder={strings.sync.shareKeyPlaceholder}
                  className="ui-focus-ring min-h-11 min-w-0 flex-1 rounded-[var(--radius-field)] border border-[var(--color-border)] bg-white/60 px-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-quiet)]"
                />
                {currentShareToken &&
                currentShareToken === shareTokenInput.trim() ? (
                  <button
                    type="button"
                    onClick={handleCopyPoeticKey}
                    aria-label="复制私人云访问口令"
                    className="ui-focus-ring flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] bg-white/40 px-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-white/80"
                    title="复制访问口令"
                  >
                    <Copy
                      aria-hidden="true"
                      className="h-[18px] w-[18px]"
                      strokeWidth={1.75}
                    />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-3">
              <button
                type="button"
                onClick={handleGeneratePoeticKey}
                className="ui-focus-ring flex min-h-11 min-w-11 items-center gap-1 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)]"
              >
                <KeyRound
                  aria-hidden="true"
                  className="h-[18px] w-[18px]"
                  strokeWidth={1.75}
                />
                {strings.sync.shareGenerateBtn}
              </button>

              <div className="flex-1" />

              {currentShareToken ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmClearOpen(true)}
                    disabled={!isOnline || clearingCloud}
                    className="ui-focus-ring flex min-h-11 min-w-11 items-center gap-1 rounded-[var(--radius-control)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-3 text-sm font-semibold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10 disabled:opacity-40"
                    title="清空此访问口令对应的云端书籍和阅读记录"
                  >
                    <Trash2
                      aria-hidden="true"
                      className="h-[18px] w-[18px]"
                      strokeWidth={1.75}
                    />
                    {clearingCloud ? "正在清空…" : "清空云端备份"}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearShareToken}
                    className="ui-focus-ring flex min-h-11 min-w-11 items-center gap-1 rounded-[var(--radius-control)] bg-[var(--color-warning)]/90 px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-warning)]"
                  >
                    <Link2
                      aria-hidden="true"
                      className="h-[18px] w-[18px]"
                      strokeWidth={1.75}
                    />
                    {strings.sync.shareClearBtn}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleBindShareToken}
                  disabled={!shareTokenInput.trim()}
                  title={
                    !shareTokenInput.trim()
                      ? "请先在上方输入同步口令"
                      : "绑定并启用私人云同步"
                  }
                  className="ui-focus-ring flex min-h-11 min-w-11 items-center gap-1 rounded-[var(--radius-control)] bg-[var(--color-primary)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-strong)] disabled:opacity-40"
                >
                  <Link2
                    aria-hidden="true"
                    className="h-[18px] w-[18px]"
                    strokeWidth={1.75}
                  />
                  {strings.sync.shareBindBtn}
                </button>
              )}
            </div>
          </div>
        </div>
      </SettingsCard>

      <ConfirmDialog
        isOpen={confirmClearOpen}
        title="清空私人云端备份"
        message="将删除当前访问口令下的私人云书籍与进度；本机书架不删除。此操作不可撤销。"
        isDanger
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={() => void handleClearCloudBooks()}
      />
    </>
  );
}
