import { describe, expect, it } from "vitest";
import { safeSha256, sha256PureSync } from "./safe-crypto";

describe("safeSha256 and sha256PureSync", () => {
  it("computes correct SHA-256 for basic strings", async () => {
    // Known SHA-256 for "hello world"
    const expected =
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
    const bytes = new TextEncoder().encode("hello world");
    expect(sha256PureSync(bytes)).toBe(expected);
    await expect(safeSha256("hello world")).resolves.toBe(expected);
  });

  it("computes correct SHA-256 for Chinese novel chapter contents", async () => {
    const text =
      "第一章 混沌初开\n天地玄黄，宇宙洪荒。日月盈昃，辰宿列张。寒来暑往，秋收冬藏。";
    const bytes = new TextEncoder().encode(text);
    const pureHash = sha256PureSync(bytes);
    const safeHash = await safeSha256(text);
    expect(pureHash).toBe(safeHash);
    expect(pureHash.length).toBe(64);
  });

  it("works reliably even if crypto.subtle is undefined (LAN HTTP environment)", async () => {
    const originalSubtle = globalThis.crypto?.subtle;
    try {
      // 模拟局域网 HTTP 非安全上下文
      Object.defineProperty(globalThis.crypto, "subtle", {
        value: undefined,
        configurable: true,
      });

      const text = "局域网测试正文内容";
      const result = await safeSha256(text);
      expect(result.length).toBe(64);
      expect(result).toBe(sha256PureSync(new TextEncoder().encode(text)));
    } finally {
      if (originalSubtle) {
        Object.defineProperty(globalThis.crypto, "subtle", {
          value: originalSubtle,
          configurable: true,
        });
      }
    }
  });
});
