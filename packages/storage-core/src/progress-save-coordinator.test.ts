import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadingProgress } from "@reader/shared-types";
import { createProgressSaveCoordinator } from "./progress-save-coordinator";

function progress(offset: number): ReadingProgress {
  return {
    bookId: "book-1",
    chapterId: "chapter-1",
    chapterIndex: 0,
    offset,
    percentage: offset,
    updatedAt: `2026-08-13T00:00:0${offset}.000Z`,
  };
}

describe("progress save coordinator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts persistence before the one-second deadline and reports saved", async () => {
    vi.useFakeTimers();
    const persist = vi.fn(async () => undefined);
    const statuses: string[] = [];
    const coordinator = createProgressSaveCoordinator({
      persist,
      onStatusChange: (status) => statuses.push(status.state),
    });

    coordinator.schedule(progress(1));
    expect(coordinator.getStatus().state).toBe("pending");

    await vi.advanceTimersByTimeAsync(999);

    expect(persist).toHaveBeenCalledOnce();
    expect(coordinator.getStatus().state).toBe("saved");
    expect(statuses).toEqual(["pending", "saved"]);
  });

  it("coalesces same-book updates and persists only the latest value", async () => {
    vi.useFakeTimers();
    const persist = vi.fn(async () => undefined);
    const coordinator = createProgressSaveCoordinator({ persist });

    coordinator.schedule(progress(1));
    coordinator.schedule(progress(2));
    await vi.runAllTimersAsync();

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(progress(2));
    expect(coordinator.getStatus()).toMatchObject({
      state: "saved",
      progress: progress(2),
    });
  });

  it("does not write an already confirmed progress value twice", async () => {
    const persist = vi.fn(async () => undefined);
    const coordinator = createProgressSaveCoordinator({ persist, delayMs: 0 });
    const value = progress(2);

    await coordinator.saveNow(value);
    await coordinator.saveNow(value);

    expect(persist).toHaveBeenCalledOnce();
    expect(coordinator.getStatus()).toMatchObject({ state: "saved", progress: value });
  });

  it("serializes an update arriving during a write and finishes on the latest value", async () => {
    let releaseFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const persist = vi
      .fn<(value: ReadingProgress) => Promise<void>>()
      .mockImplementationOnce(() => firstWrite)
      .mockResolvedValueOnce(undefined);
    const coordinator = createProgressSaveCoordinator({ persist, delayMs: 0 });

    const first = coordinator.saveNow(progress(1));
    await Promise.resolve();
    const second = coordinator.saveNow(progress(2));
    expect(persist).toHaveBeenCalledTimes(1);

    releaseFirst();
    await Promise.all([first, second]);

    expect(persist.mock.calls.map(([value]) => value.offset)).toEqual([1, 2]);
    expect(coordinator.getStatus()).toMatchObject({
      state: "saved",
      progress: progress(2),
    });
  });

  it("keeps failed progress pending for a visible retry instead of reporting success", async () => {
    const failure = new Error("quota exceeded");
    const persist = vi
      .fn<(value: ReadingProgress) => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined);
    const coordinator = createProgressSaveCoordinator({ persist, delayMs: 0 });

    await expect(coordinator.saveNow(progress(1))).rejects.toThrow("quota exceeded");
    expect(coordinator.getStatus()).toMatchObject({
      state: "failed",
      progress: progress(1),
      error: failure,
    });

    await coordinator.retry();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(coordinator.getStatus().state).toBe("saved");
  });

  it("lets a newer immediate save succeed independently after an in-flight failure", async () => {
    let rejectFirst!: (error: Error) => void;
    const firstWrite = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const persist = vi
      .fn<(value: ReadingProgress) => Promise<void>>()
      .mockImplementationOnce(() => firstWrite)
      .mockResolvedValueOnce(undefined);
    const statuses: string[] = [];
    const coordinator = createProgressSaveCoordinator({
      persist,
      delayMs: 0,
      onStatusChange: (status) => statuses.push(status.state),
    });

    const first = coordinator.saveNow(progress(1));
    await Promise.resolve();
    const second = coordinator.saveNow(progress(2));
    rejectFirst(new Error("temporary failure"));

    await expect(first).rejects.toThrow("temporary failure");
    await expect(second).resolves.toBeUndefined();
    expect(persist.mock.calls.map(([value]) => value.offset)).toEqual([1, 2]);
    expect(coordinator.getStatus()).toMatchObject({
      state: "saved",
      progress: progress(2),
    });
    expect(statuses).not.toContain("failed");
  });

  it("flushes scheduled progress immediately for lifecycle exits", async () => {
    vi.useFakeTimers();
    const persist = vi.fn(async () => undefined);
    const coordinator = createProgressSaveCoordinator({ persist });

    coordinator.schedule(progress(3));
    await coordinator.flush();

    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(progress(3));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries a retained failure when a lifecycle flush occurs", async () => {
    const persist = vi
      .fn<(value: ReadingProgress) => Promise<void>>()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(undefined);
    const coordinator = createProgressSaveCoordinator({ persist, delayMs: 0 });

    await expect(coordinator.saveNow(progress(3))).rejects.toThrow(
      "temporary failure",
    );
    await coordinator.flush();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(coordinator.getStatus()).toMatchObject({
      state: "saved",
      progress: progress(3),
    });
  });

  it("waits for the latest queued value when flushing during an active write", async () => {
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondWrite = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const persist = vi
      .fn<(value: ReadingProgress) => Promise<void>>()
      .mockImplementationOnce(() => firstWrite)
      .mockImplementationOnce(() => secondWrite);
    const coordinator = createProgressSaveCoordinator({ persist, delayMs: 0 });

    const first = coordinator.saveNow(progress(1));
    await Promise.resolve();
    coordinator.schedule(progress(2));
    let flushed = false;
    const flush = coordinator.flush().then(() => {
      flushed = true;
    });

    releaseFirst();
    await vi.waitFor(() => {
      expect(persist).toHaveBeenCalledTimes(2);
    });
    expect(flushed).toBe(false);

    releaseSecond();
    await Promise.all([first, flush]);
    expect(persist.mock.calls.map(([value]) => value.offset)).toEqual([1, 2]);
    expect(coordinator.getStatus()).toMatchObject({
      state: "saved",
      progress: progress(2),
    });
  });
});
