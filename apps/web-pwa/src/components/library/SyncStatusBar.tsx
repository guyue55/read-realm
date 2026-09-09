"use client";

import { Cloud, CloudOff, LoaderCircle, Settings2 } from "lucide-react";
import { strings } from "@/lib/i18n";

/**
 * 书架顶部「私人云同步」折叠态单行状态条。
 *
 * 设计意图（贴合本地优先项目实情）：
 * - 云同步是可选、非核心能力；常态下书架首屏不应被整块同步卡占用。
 * - 本组件只负责“一行内陈述同步状态 + 提供入口”，配置与执行仍由父容器负责，
 *   因此保持高内聚（只做状态陈述）与低耦合（纯 props 接口，无业务副作用）。
 */
export interface SyncStatusBarProps {
  /** 是否在线（决定云/离线图标与文案） */
  isOnline: boolean;
  /** 是否正在同步（进行中展示旋转图标与进行中文案） */
  isSyncing: boolean;
  /** 是否已设置访问口令（未设置时展示“未开启”状态） */
  hasShareToken: boolean;
  /** 同步进行中的步骤文案（父容器提供的 syncStepText） */
  syncStepText: string;
  /** 打开同步设置 */
  onOpenSettings: () => void;
  /** 手动触发一次同步（有口令且在线时可用） */
  onSync: () => void;
}

export function SyncStatusBar({
  isOnline,
  isSyncing,
  hasShareToken,
  syncStepText,
  onOpenSettings,
  onSync,
}: SyncStatusBarProps) {
  const showSyncButton = isOnline && hasShareToken && !isSyncing;

  let statusText: string;
  if (isSyncing) {
    statusText = syncStepText || strings.sync.syncing;
  } else if (!hasShareToken) {
    statusText = strings.sync.notConfiguredDesc;
  } else if (isOnline) {
    statusText = strings.sync.diffDesc;
  } else {
    statusText = strings.sync.offlineDesc;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] ${
            isSyncing || hasShareToken
              ? "bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]"
              : "bg-[var(--ui-surface-muted)] text-[var(--ui-muted)]"
          }`}
        >
          {isSyncing ? (
            <LoaderCircle
              aria-hidden="true"
              className="h-5 w-5 animate-spin"
              strokeWidth={1.75}
            />
          ) : isOnline ? (
            <Cloud aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
          ) : (
            <CloudOff
              aria-hidden="true"
              className="h-5 w-5"
              strokeWidth={1.75}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
            <span className="whitespace-nowrap">{strings.sync.title}</span>
            {hasShareToken && (
              <span className="shrink-0 rounded-[var(--radius-control)] bg-[var(--ui-accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--ui-accent)]">
                {strings.sync.configuredBadge}
              </span>
            )}
          </h3>
          <p className="mt-0.5 truncate text-xs text-[var(--ui-muted)] leading-relaxed">
            {statusText}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {showSyncButton && (
          <button
            type="button"
            onClick={onSync}
            className="ui-focus-ring min-h-11 rounded-[var(--radius-control)] bg-[var(--ui-accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--ui-accent-hover)]"
          >
            {strings.sync.syncBtn}
          </button>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          className="ui-focus-ring flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-sm font-semibold text-[var(--ui-accent)] hover:bg-[var(--ui-accent-soft)]"
        >
          <Settings2
            aria-hidden="true"
            className="h-[18px] w-[18px]"
            strokeWidth={1.75}
          />
          <span className="whitespace-nowrap">
            {strings.sync.syncSettingsTitle}
          </span>
        </button>
      </div>
    </div>
  );
}
