import type { ReadingProgress } from "@reader/shared-types";

/** 阅读翻页自动备份进度的偏好键（默认开启，仅显式 "false" 视为关闭） */
export const PROGRESS_AUTO_BACKUP_KEY = "reader-sync-auto-progress";
/** 私人云访问口令键 */
export const SHARE_TOKEN_KEY = "reader-share-token";
/** 翻页后延迟上报的毫秒数：合并连续翻页，减少云端写入 */
export const PROGRESS_AUTO_BACKUP_DELAY_MS = 3000;

export interface ProgressAutoBackupOptions {
  /** 读取是否开启自动备份 */
  readAutoBackupEnabled: () => boolean;
  /** 读取当前访问口令（空串表示未绑定） */
  readShareToken: () => string;
  /** 当前是否在线 */
  isOnline: () => boolean;
  /** 上报单条进度到私人云（由调用方注入 API 客户端） */
  updateRemoteProgress: (
    shareToken: string,
    progress: ReadingProgress,
  ) => Promise<void>;
  /** 上报失败时的降级处理（默认忽略，不打扰阅读） */
  onError?: (error: unknown) => void;
  /** 延迟毫秒数，默认 3000 */
  delayMs?: number;
}

export interface ProgressAutoBackup {
  /** 安排一次延迟上报；连续调用只保留最后一次（3 秒防抖） */
  schedule(progress: ReadingProgress): void;
  /** 取消尚未触发的上报 */
  cancel(): void;
}

/**
 * 创建「阅读翻页自动备份」执行器。
 *
 * 语义：本地进度落库成功后调用 schedule()，延迟 3 秒把该进度上报私人云；
 * 期间若再次翻页则重置计时，只上报最后一次，避免频繁写入。
 * 未开启开关 / 未绑定口令 / 离线时静默跳过（本地保存不受影响）。
 */
export function createProgressAutoBackup({
  readAutoBackupEnabled,
  readShareToken,
  isOnline,
  updateRemoteProgress,
  onError,
  delayMs = PROGRESS_AUTO_BACKUP_DELAY_MS,
}: ProgressAutoBackupOptions): ProgressAutoBackup {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = (progress: ReadingProgress) => {
    // 前置守门：开关关闭或未绑定口令时无需排期（避免无谓计时器）
    if (!readAutoBackupEnabled()) return;
    if (!readShareToken()) return;

    cancel();
    timer = setTimeout(() => {
      timer = null;
      // 延迟期间可能已离线或解绑口令，触发前重新核验
      const shareToken = readShareToken();
      if (!shareToken || !isOnline()) return;
      void updateRemoteProgress(shareToken, progress).catch((error) => {
        onError?.(error);
      });
    }, delayMs);
  };

  return { schedule, cancel };
}
