// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { LocalApiStaticFetcher } from "./api-fetchers";
import { FetchError } from "./fetch-adapter";

describe("LocalApiStaticFetcher (L1 本地 API 静态抓取器)", () => {
  let fetcher: LocalApiStaticFetcher;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetcher = new LocalApiStaticFetcher();
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

  it("成功抓取返回 HTML 与 api 级别", async () => {
    mockOkResponse({
      html: "<html><body>静态抓取正文</body></html>",
      finalUrl: "https://example.com/ch/1",
    });
    const result = await fetcher.fetch("https://example.com/ch/1");
    expect(result.level).toBe("api");
    expect(result.html).toContain("静态抓取正文");
    expect(result.finalUrl).toBe("https://example.com/ch/1");
  });

  it("429 节流响应转为 FETCH_HTTP 且携带状态码", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("抓取过于频繁", { status: 429 }),
    ) as unknown as typeof fetch;
    await expect(fetcher.fetch("https://example.com/")).rejects.toMatchObject({
      code: "FETCH_HTTP",
      status: 429,
    });
  });

  it("后端 SSRF 拒绝的错误消息透传", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ message: "不允许访问本机或内网地址" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;
    await expect(fetcher.fetch("https://example.com/")).rejects.toMatchObject({
      code: "FETCH_HTTP",
      status: 400,
      message: "不允许访问本机或内网地址",
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

  it("无 finalUrl 时回退原始 URL", async () => {
    mockOkResponse({ html: "<html><body>x</body></html>" });
    const result = await fetcher.fetch("https://example.com/start");
    expect(result.finalUrl).toBe("https://example.com/start");
  });

  it("抛出的 FetchError 原样传递（不二次包装）", async () => {
    const original = new FetchError("节流", "FETCH_HTTP", 429);
    globalThis.fetch = vi.fn().mockRejectedValue(original) as unknown as typeof fetch;
    await expect(fetcher.fetch("https://example.com/")).rejects.toBe(original);
  });
});
