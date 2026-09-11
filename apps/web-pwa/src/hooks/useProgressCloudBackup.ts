"use client";

import { useEffect, useRef } from "react";
import type { ProgressSaveStatus } from "@reader/storage-core";
import { normalizeShareToken } from "@/lib/api";
import {
  createProgressAutoBackup,
  PROGRESS_AUTO_BACKUP_KEY,
  SHARE_TOKEN_KEY,
  type ProgressAutoBackup,
} from "@/features/library/progress-auto-backup";
import { createLegacyPersonalSyncApiClient } from "@/features/library/legacy-personal-sync-api";

/**
 * 阅读翻页自动备份到私人云。
 *
 * 本地进度落库成功（progressSaveStatus 变为 saved）后，延迟 3 秒把该进度
 * 上报私人云；连续翻页只上报最后一次。开关由设置页「私人云同步」卡片控制
 * （reader-sync-auto-progress），未绑定口令或离线时静默跳过，不影响阅读。
 *
 * 该能力此前只有开关与文案、没有消费方，本 hook 为其接上执行链路。
 */
export function useProgressCloudBackup(
  progressSaveStatus: ProgressSaveStatus,
): void {
  const backupRef = useRef<ProgressAutoBackup | null>(null);
  if (!backupRef.current) {
    backupRef.current = createProgressAutoBackup({
      readAutoBackupEnabled: () =>
        window.localStorage.getItem(PROGRESS_AUTO_BACKUP_KEY) !== "false",
      readShareToken: () =>
        normalizeShareToken(window.localStorage.getItem(SHARE_TOKEN_KEY)),
      isOnline: () => (typeof navigator === "undefined" ? true : navigator.onLine),
      updateRemoteProgress: async (shareToken, progress) => {
        const api = createLegacyPersonalSyncApiClient(shareToken);
        await api.updateProgress(progress.bookId, progress);
      },
      onError: (error) => {
        // 自动备份失败不打扰阅读：本地进度已保存，云端可稍后手动同步补齐。
        console.warn(
          "[Sync] 阅读进度自动备份到私人云失败（可稍后手动同步）:",
          error,
        );
      },
    });
  }

  useEffect(() => {
    if (progressSaveStatus.state !== "saved") return;
    backupRef.current?.schedule(progressSaveStatus.progress);
  }, [progressSaveStatus]);

  useEffect(() => {
    const backup = backupRef.current;
    return () => {
      backup?.cancel();
    };
  }, []);
}
