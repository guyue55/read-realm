import { describe, it, expect, vi } from "vitest";
import {
  retryWithBackoff,
  createConcurrencyPool,
  createRateLimiter,
  FetchError,
} from "./fetch-adapter";

describe("retryWithBackoff 重试退避", () => {
  it("首次成功不重试", async () => {
    const attempt = vi.fn().mockResolvedValue("ok");
    const result = await retryWithBackoff(attempt, { maxRetries: 3 });
    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("失败后重试直至成功", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new Error("网络抖动"))
      .mockResolvedValueOnce("ok");
    const result = await retryWithBackoff(attempt, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("超过最大重试次数抛最后一次错误", async () => {
    const error = new Error("持续失败");
    const attempt = vi.fn().mockRejectedValue(error);
    await expect(
      retryWithBackoff(attempt, { maxRetries: 1, baseDelayMs: 1 }),
    ).rejects.toBe(error);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("shouldRetry 返回 false 时不重试", async () => {
    const error = new FetchError("不可重试", "FETCH_CORS");
    const attempt = vi.fn().mockRejectedValue(error);
    await expect(
      retryWithBackoff(attempt, {
        maxRetries: 3,
        baseDelayMs: 1,
        shouldRetry: (e) => e instanceof FetchError && e.code !== "FETCH_CORS",
      }),
    ).rejects.toBe(error);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("signal 中止时立即停止", async () => {
    const controller = new AbortController();
    controller.abort();
    const attempt = vi.fn().mockRejectedValue(new Error("x"));
    await expect(
      retryWithBackoff(attempt, { maxRetries: 3, baseDelayMs: 1, signal: controller.signal }),
    ).rejects.toThrow();
    expect(attempt).not.toHaveBeenCalled();
  });
});

describe("createConcurrencyPool 并发池", () => {
  it("按顺序返回结果，单项失败为 null", async () => {
    const items = [1, 2, 3, 4, 5];
    const worker = vi
      .fn()
      .mockImplementation(async (n: number) => (n === 3 ? Promise.reject(new Error("fail")) : n * 10));
    const results = await createConcurrencyPool(items, worker, 2);
    expect(results).toEqual([10, 20, null, 40, 50]);
  });

  it("并发度受限：同一时刻不超过 concurrency 个执行", async () => {
    let active = 0;
    let maxActive = 0;
    const worker = async (n: number) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return n;
    };
    await createConcurrencyPool([1, 2, 3, 4, 5, 6, 7, 8], worker, 3);
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("空数组立即返回", async () => {
    const results = await createConcurrencyPool([], async (n: number) => n, 3);
    expect(results).toEqual([]);
  });
});

describe("createRateLimiter 限速器", () => {
  it("窗口内超限拒绝", () => {
    const limiter = createRateLimiter({ maxPerMinute: 2 });
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
    expect(limiter.getCount()).toBe(2);
  });
});
