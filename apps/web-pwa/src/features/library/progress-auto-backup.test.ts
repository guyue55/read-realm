import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadingProgress } from "@reader/shared-types";
import {
  createProgressAutoBackup,
  PROGRESS_AUTO_BACKUP_DELAY_MS,
} from "./progress-auto-backup";

function makeProgress(bookId: string, chapterIndex: number): ReadingProgress {
  return {
    bookId,
    chapterId: `${bookId}-c${chapterIndex}`,
    chapterIndex,
    offset: 0,
    percentage: chapterIndex * 10,
    updatedAt: "2026-08-15T00:00:00.000Z",
  };
}

function setup(
  overrides: Partial<{
    enabled: boolean;
    shareToken: string;
    online: boolean;
  }> = {},
) {
  const state = {
    enabled: overrides.enabled ?? true,
    shareToken: overrides.shareToken ?? "松风阅心-1008",
    online: overrides.online ?? true,
  };
  const updateRemoteProgress = vi.fn().mockResolvedValue(undefined);
  const onError = vi.fn();
  const backup = createProgressAutoBackup({
    readAutoBackupEnabled: () => state.enabled,
    readShareToken: () => state.shareToken,
    isOnline: () => state.online,
    updateRemoteProgress,
    onError,
  });
  return { backup, updateRemoteProgress, onError, state };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("progress auto backup", () => {
  it("延迟 3 秒后上报一次进度", async () => {
    vi.useFakeTimers();
    const { backup, updateRemoteProgress } = setup();
    const progress = makeProgress("book-1", 3);

    backup.schedule(progress);
    expect(updateRemoteProgress).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(PROGRESS_AUTO_BACKUP_DELAY_MS);
    expect(updateRemoteProgress).toHaveBeenCalledTimes(1);
    expect(updateRemoteProgress).toHaveBeenCalledWith("松风阅心-1008", progress);
  });

  it("连续翻页只在停顿后上报最后一次", async () => {
    vi.useFakeTimers();
    const { backup, updateRemoteProgress } = setup();

    backup.schedule(makeProgress("book-1", 1));
    await vi.advanceTimersByTimeAsync(1000);
    backup.schedule(makeProgress("book-1", 2));
    await vi.advanceTimersByTimeAsync(1000);
    const last = makeProgress("book-1", 3);
    backup.schedule(last);

    await vi.advanceTimersByTimeAsync(PROGRESS_AUTO_BACKUP_DELAY_MS);
    expect(updateRemoteProgress).toHaveBeenCalledTimes(1);
    expect(updateRemoteProgress).toHaveBeenCalledWith("松风阅心-1008", last);
  });

  it("开关关闭时不排期也不上报", async () => {
    vi.useFakeTimers();
    const { backup, updateRemoteProgress } = setup({ enabled: false });

    backup.schedule(makeProgress("book-1", 1));
    await vi.advanceTimersByTimeAsync(PROGRESS_AUTO_BACKUP_DELAY_MS * 3);
    expect(updateRemoteProgress).not.toHaveBeenCalled();
  });

  it("未绑定访问口令时不排期也不上报", async () => {
    vi.useFakeTimers();
    const { backup, updateRemoteProgress } = setup({ shareToken: "" });

    backup.schedule(makeProgress("book-1", 1));
    await vi.advanceTimersByTimeAsync(PROGRESS_AUTO_BACKUP_DELAY_MS * 3);
    expect(updateRemoteProgress).not.toHaveBeenCalled();
  });

  it("触发前已离线则跳过上报", async () => {
    vi.useFakeTimers();
    const { backup, updateRemoteProgress, state } = setup();
    state.online = false;

    backup.schedule(makeProgress("book-1", 1));
    await vi.advanceTimersByTimeAsync(PROGRESS_AUTO_BACKUP_DELAY_MS);
    expect(updateRemoteProgress).not.toHaveBeenCalled();
  });

  it("触发前已解绑口令则跳过上报", async () => {
    vi.useFakeTimers();
    const { backup, updateRemoteProgress, state } = setup();

    backup.schedule(makeProgress("book-1", 1));
    state.shareToken = "";
    await vi.advanceTimersByTimeAsync(PROGRESS_AUTO_BACKUP_DELAY_MS);
    expect(updateRemoteProgress).not.toHaveBeenCalled();
  });

  it("cancel 后不再上报", async () => {
    vi.useFakeTimers();
    const { backup, updateRemoteProgress } = setup();

    backup.schedule(makeProgress("book-1", 1));
    backup.cancel();
    await vi.advanceTimersByTimeAsync(PROGRESS_AUTO_BACKUP_DELAY_MS * 2);
    expect(updateRemoteProgress).not.toHaveBeenCalled();
  });

  it("上报失败只走降级回调，不抛出", async () => {
    vi.useFakeTimers();
    const { backup, updateRemoteProgress, onError } = setup();
    updateRemoteProgress.mockRejectedValueOnce(new Error("云端不可用"));

    backup.schedule(makeProgress("book-1", 1));
    await vi.advanceTimersByTimeAsync(PROGRESS_AUTO_BACKUP_DELAY_MS);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
