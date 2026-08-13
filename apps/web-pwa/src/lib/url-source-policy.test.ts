import { describe, expect, it } from "vitest";
import {
  assertAuthorizedPublicSourceUrl,
  createUrlSourceCheckPreview,
  createDefaultSourceCheckPreference,
  isSourceCheckDue,
  nextSourceCheckAt,
  parseSourceCheckPreference,
  shouldUseBackendUrlFallback,
} from "./url-source-policy";
import { UrlImportError } from "./url-import";

describe("URL source policy", () => {
  it("requires an explicit rights confirmation for public http(s) URLs", () => {
    expect(() =>
      assertAuthorizedPublicSourceUrl("https://example.com/book", false),
    ).toThrow("SOURCE_RIGHTS_CONFIRMATION_REQUIRED");
    expect(
      assertAuthorizedPublicSourceUrl("https://example.com/book", true),
    ).toBe("https://example.com/book");
  });

  it("rejects embedded credentials and unsupported protocols", () => {
    expect(() =>
      assertAuthorizedPublicSourceUrl("https://user:pass@example.com/book", true),
    ).toThrow("SOURCE_URL_EMBEDDED_CREDENTIALS_FORBIDDEN");
    expect(() =>
      assertAuthorizedPublicSourceUrl("file:///tmp/book.txt", true),
    ).toThrow("SOURCE_URL_PROTOCOL_UNSUPPORTED");
  });

  it("keeps scheduled checks disabled by default", () => {
    expect(createDefaultSourceCheckPreference()).toEqual({
      enabled: false,
      intervalHours: 24,
    });
    expect(nextSourceCheckAt(createDefaultSourceCheckPreference(), Date.now())).toBeNull();
  });

  it("accepts only bounded opt-in intervals and computes the next check", () => {
    expect(parseSourceCheckPreference({ enabled: true, intervalHours: 12 })).toEqual({
      enabled: true,
      intervalHours: 12,
    });
    expect(nextSourceCheckAt({ enabled: true, intervalHours: 12 }, 1_000)).toBe(
      1_000 + 12 * 60 * 60 * 1_000,
    );
    expect(() =>
      parseSourceCheckPreference({ enabled: true, intervalHours: 1 }),
    ).toThrow("SOURCE_CHECK_INTERVAL_UNSUPPORTED");
  });

  it("uses backend fallback only for browser network/CORS failures", () => {
    expect(shouldUseBackendUrlFallback(new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldUseBackendUrlFallback(new DOMException("timeout", "AbortError"))).toBe(false);
    expect(
      shouldUseBackendUrlFallback(
        new UrlImportError("需要验证码", "SOURCE_RATE_LIMITED"),
      ),
    ).toBe(false);
    expect(shouldUseBackendUrlFallback(new Error("页面正文为空"))).toBe(false);
  });

  it("produces a non-mutating update preview from source metadata", () => {
    expect(
      createUrlSourceCheckPreview(
        { title: "旧书名", chapterCount: 2 },
        {
          title: "新书名",
          chapters: [
            { index: 0, title: "第一章", content: "一" },
            { index: 1, title: "第二章", content: "二" },
            { index: 2, title: "第三章", content: "三" },
          ],
        },
      ),
    ).toEqual({
      status: "update_available",
      remoteTitle: "新书名",
      remoteChapterCount: 3,
      differences: ["书名：旧书名 → 新书名", "章节数：2 → 3"],
    });
  });

  it("runs opt-in checks only when the bounded interval is due", () => {
    const now = new Date("2026-08-13T12:00:00.000Z");
    expect(isSourceCheckDue({ enabled: false, intervalHours: 24 }, undefined, now)).toBe(false);
    expect(isSourceCheckDue({ enabled: true, intervalHours: 24 }, undefined, now)).toBe(true);
    expect(
      isSourceCheckDue(
        { enabled: true, intervalHours: 24 },
        "2026-08-13T00:00:01.000Z",
        now,
      ),
    ).toBe(false);
    expect(
      isSourceCheckDue(
        { enabled: true, intervalHours: 6 },
        "2026-08-13T05:59:59.000Z",
        now,
      ),
    ).toBe(true);
  });
});
