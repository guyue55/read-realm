/**
 * @file fetch-adapter.ts
 * @description URL 导入的抓取端口（Port）与稳定性基础设施。
 *
 * 设计目标（高内聚低耦合）：
 * - UrlFetcher 是"拿 HTML"的端口抽象，与解析引擎完全解耦；
 * - 多级抓取（L0 浏览器直连 / L1 本地 API / L2 headless / L3 手动）通过
 *   不同实现注入，上层编排层只面向端口编程；
 * - retryWithBackoff / createConcurrencyPool / rateLimit 为纯函数基础设施，
 *   不依赖具体抓取实现，可独立单测。
 */

/** 一次抓取的结果：HTML 文本 + 元信息（供上层判定是否需升级抓取级别） */
export interface FetchResult {
  html: string;
  /** 抓取级别：browser（L0）/ api（L1）/ headless（L2）/ third_party */
  level: "browser" | "api" | "headless" | "third_party";
  /** 最终 URL（可能经过重定向） */
  finalUrl: string;
  /** 页面识别结果（反爬/挑战/登录等），由上层在解析阶段判定 */
}

/** 抓取选项 */
export interface FetchOptions {
  /** 请求超时（毫秒） */
  timeoutMs?: number;
  /** 是否跟随重定向 */
  followRedirects?: boolean;
  /** 最大响应字节数（超过即视为异常） */
  maxBytes?: number;
  /** 中止信号 */
  signal?: AbortSignal;
}

/** 抓取端口：把 URL 变成 HTML 文本 */
export interface UrlFetcher {
  readonly level: FetchResult["level"];
  fetch(url: string, options?: FetchOptions): Promise<FetchResult>;
}

/**
 * 统一的抓取错误，携带可路由的稳定错误码。
 */
export class FetchError extends Error {
  constructor(
    message: string,
    readonly code:
      | "FETCH_TIMEOUT"
      | "FETCH_NETWORK"
      | "FETCH_HTTP"
      | "FETCH_TOO_LARGE"
      | "FETCH_CORS"
      | "FETCH_UNKNOWN" = "FETCH_UNKNOWN",
    readonly status?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

/**
 * 指数退避 + 抖动（jitter）重试。
 * 纯函数设计：接收"尝试函数"与参数，返回最终结果。
 *
 * @param attempt 每次尝试的执行函数
 * @param options 重试配置
 * @returns 成功返回结果；全部失败抛出最后一次错误
 */
export async function retryWithBackoff<T>(
  attempt: (attemptNumber: number) => Promise<T>,
  options: {
    /** 最大重试次数（不含首次） */
    maxRetries?: number;
    /** 基础延迟（毫秒） */
    baseDelayMs?: number;
    /** 是否只对特定错误重试 */
    shouldRetry?: (error: unknown) => boolean;
    /** 信号：中止时停止重试 */
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const {
    maxRetries = 2,
    baseDelayMs = 500,
    shouldRetry = () => true,
    signal,
  } = options;

  let lastError: unknown;
  for (let attemptNumber = 0; attemptNumber <= maxRetries; attemptNumber += 1) {
    if (signal?.aborted) {
      throw new FetchError("抓取任务已中止", "FETCH_NETWORK");
    }
    try {
      return await attempt(attemptNumber);
    } catch (error) {
      lastError = error;
      if (attemptNumber >= maxRetries || !shouldRetry(error)) break;
      // 指数退避 + 随机抖动，避免请求风暴
      const base = baseDelayMs * 2 ** attemptNumber;
      const jitter = Math.random() * baseDelayMs;
      const delay = Math.min(base + jitter, 10_000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * 并发池：把一组任务以有限并发执行，保持结果顺序与输入一致。
 * 纯函数基础设施，与具体抓取无关。
 *
 * @param items 待处理项
 * @param worker 每项的处理函数
 * @param concurrency 并发上限（默认 5）
 * @returns 与输入顺序一致的结果数组（单项失败不阻断整体，失败项为 null 由调用方处理）
 */
export async function createConcurrencyPool<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = 5,
): Promise<Array<R | null>> {
  const results: Array<R | null> = new Array(items.length).fill(null);
  let cursor = 0;

  async function runWorker(index: number): Promise<void> {
    try {
      results[index] = await worker(items[index], index);
    } catch {
      results[index] = null;
    }
  }

  async function pump(): Promise<void> {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      await runWorker(current);
    }
  }

  // 启动并发个数的 pump，各自串行消费任务槽；整体并行度受 concurrency 限制
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.max(1, concurrency); i += 1) {
    workers.push(pump());
  }
  await Promise.all(workers);
  return results;
}

/**
 * 限速器：控制单位时间内的请求次数。
 * 简单令牌桶实现，纯函数可测。
 */
export function createRateLimiter(options: {
  /** 每分钟最大请求数 */
  maxPerMinute: number;
}) {
  const { maxPerMinute } = options;
  let windowStart = Date.now();
  let count = 0;

  return {
    /**
     * 尝试取一个令牌；未超限返回 true，超限返回 false。
     * 调用方在返回 false 时应延迟后重试。
     */
    tryAcquire(): boolean {
      const now = Date.now();
      if (now - windowStart >= 60_000) {
        windowStart = now;
        count = 0;
      }
      if (count >= maxPerMinute) return false;
      count += 1;
      return true;
    },
    /** 当前窗口已用次数 */
    getCount(): number {
      return count;
    },
  };
}
