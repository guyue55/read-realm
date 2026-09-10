// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { LocalHeadlessFetcher } from "./headless-fetcher";
import { FetchError } from "./fetch-adapter";

describe("LocalHeadlessFetcher (L2 headless 渲染抓取器)", () => {
  let fetcher: LocalHeadlessFetcher;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetcher = new LocalHeadlessFetcher();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockOkResponse(payload: unknown) {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;
  }

  it("渲染成功返回 HTML 与 headless 级别", async () => {
    mockOkResponse({
      html: "<html><body>动态渲染后的正文</body></html>",
      finalUrl: "https://example.com/ch/1",
      meta: "ok",
    });
    const result = await fetcher.fetch("https://example.com/ch/1");
    expect(result.level).toBe("headless");
    expect(result.html).toContain("动态渲染后的正文");
    expect(result.finalUrl).toBe("https://example.com/ch/1");
  });

  it("挑战/登录 meta 转为 UrlImportError（触发 L3 手动协助）", async () => {
    mockOkResponse({
      html: "<html><body>challenge</body></html>",
      finalUrl: "https://example.com/",
      meta: "challenge",
    });
    await expect(fetcher.fetch("https://example.com/")).rejects.toMatchObject({
      code: "URL_DYNAMIC_RENDER_REQUIRED",
    });
  });

  it("登录 meta 转为 SOURCE_LOGIN_PAYWALL_REQUIRED", async () => {
    mockOkResponse({
      html: "<html><body>login</body></html>",
      finalUrl: "https://example.com/",
      meta: "login_required",
    });
    await expect(fetcher.fetch("https://example.com/")).rejects.toMatchObject({
      code: "SOURCE_LOGIN_PAYWALL_REQUIRED",
    });
  });

  it("HTTP 错误转为 FetchError 并携带状态码", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("渲染服务繁忙", { status: 429 }),
    ) as unknown as typeof fetch;
    await expect(fetcher.fetch("https://example.com/")).rejects.toMatchObject({
      code: "FETCH_HTTP",
      status: 429,
    });
  });

  it("网络不可达转为 FETCH_NETWORK", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
    await expect(fetcher.fetch("https://example.com/")).rejects.toMatchObject({
      code: "FETCH_NETWORK",
    });
  });

  it("AbortError 且 signal 未中止时归类为网络错误", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new DOMException("The operation was aborted", "AbortError")) as unknown as typeof fetch;
    await expect(fetcher.fetch("https://example.com/")).rejects.toMatchObject({
      code: "FETCH_NETWORK",
    });
  });

  it("超时（signal 中止）转为 FETCH_TIMEOUT", async () => {
    vi.useFakeTimers();
    // fetch 永不 resolve，直到 abort 触发才拒绝为 AbortError
    globalThis.fetch = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    }) as unknown as typeof fetch;

    const pending = fetcher.fetch("https://example.com/", { timeoutMs: 1000 });
    const assertion = expect(pending).rejects.toMatchObject({ code: "FETCH_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(1100);
    await assertion;
    vi.useRealTimers();
  });

  it("无 finalUrl 时回退原始 URL", async () => {
    mockOkResponse({ html: "<html><body>x</body></html>", meta: "ok" });
    const result = await fetcher.fetch("https://example.com/start");
    expect(result.finalUrl).toBe("https://example.com/start");
  });

  it("抛出的 FetchError 原样传递（不二次包装）", async () => {
    const original = new FetchError("已是最新错误", "FETCH_HTTP", 418);
    globalThis.fetch = vi.fn().mockRejectedValue(original) as unknown as typeof fetch;
    await expect(fetcher.fetch("https://example.com/")).rejects.toBe(original);
  });
});
