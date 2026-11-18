import { afterEach, describe, expect, it, vi } from "vitest";

/** 动态加载模块，确保每个用例都能以不同的 NEXT_PUBLIC_BASE_PATH 重新求值。 */
async function loadBasePath(basePath?: string) {
  if (basePath === undefined) {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", undefined);
  } else {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", basePath);
  }
  vi.resetModules();
  return import("./base-path");
}

describe("base-path 工具", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe("根域模式（默认，未设 NEXT_PUBLIC_BASE_PATH）", () => {
    it("normalizedBasePath 为空", async () => {
      const { normalizedBasePath } = await loadBasePath();
      expect(normalizedBasePath).toBe("");
    });

    it("withBasePath 原样返回，行为与历史一致", async () => {
      const { withBasePath } = await loadBasePath();
      expect(withBasePath("/")).toBe("/");
      expect(withBasePath("/sw.js")).toBe("/sw.js");
      expect(withBasePath("/manifest.json")).toBe("/manifest.json");
    });

    it("appPathname 原样返回", async () => {
      const { appPathname } = await loadBasePath();
      expect(appPathname("/")).toBe("/");
      expect(appPathname("/reader/abc")).toBe("/reader/abc");
    });

    it("swScope 为根作用域", async () => {
      const { swScope } = await loadBasePath();
      expect(swScope()).toBe("/");
    });
  });

  describe("项目站模式（NEXT_PUBLIC_BASE_PATH=/read-realm）", () => {
    it("normalizedBasePath 规范化首尾斜杠", async () => {
      const { normalizedBasePath } = await loadBasePath("/read-realm/");
      expect(normalizedBasePath).toBe("/read-realm");
    });

    it("withBasePath 为绝对路径加前缀", async () => {
      const { withBasePath } = await loadBasePath("/read-realm");
      expect(withBasePath("/")).toBe("/read-realm");
      expect(withBasePath("/sw.js")).toBe("/read-realm/sw.js");
      expect(withBasePath("/manifest.json")).toBe("/read-realm/manifest.json");
      expect(withBasePath("/icons/icon.svg")).toBe("/read-realm/icons/icon.svg");
    });

    it("withBasePath 对非斜杠开头补斜杠", async () => {
      const { withBasePath } = await loadBasePath("/read-realm");
      expect(withBasePath("sw.js")).toBe("/read-realm/sw.js");
    });

    it("swScope 带尾斜杠，与 next-pwa 一致", async () => {
      const { swScope } = await loadBasePath("/read-realm");
      expect(swScope()).toBe("/read-realm/");
    });

    it("appPathname 剥离 basePath 前缀", async () => {
      const { appPathname } = await loadBasePath("/read-realm");
      expect(appPathname("/read-realm")).toBe("/");
      expect(appPathname("/read-realm/")).toBe("/");
      expect(appPathname("/read-realm/reader/abc")).toBe("/reader/abc");
    });

    it("appPathname 对非本站路径原样返回（不误伤）", async () => {
      const { appPathname } = await loadBasePath("/read-realm");
      expect(appPathname("/reader/abc")).toBe("/reader/abc");
      expect(appPathname("/other-prefix/x")).toBe("/other-prefix/x");
    });
  });

  describe("resolveHashRedirect 旧式直链收敛", () => {
    it("根域模式：应用根路径不跳转，直链拼成 /#...", async () => {
      const { resolveHashRedirect } = await loadBasePath();
      expect(resolveHashRedirect("/", "")).toBeNull();
      expect(resolveHashRedirect("/reader/abc", "")).toBe("/#/reader/abc");
      expect(resolveHashRedirect("/reader/abc", "?x=1")).toBe("/#/reader/abc?x=1");
    });

    it("项目站模式：basePath 根路径不跳转，直链拼成 /read-realm#...", async () => {
      const { resolveHashRedirect } = await loadBasePath("/read-realm");
      expect(resolveHashRedirect("/read-realm", "")).toBeNull();
      expect(resolveHashRedirect("/read-realm/", "")).toBeNull();
      expect(resolveHashRedirect("/read-realm/reader/abc", "")).toBe(
        "/read-realm#/reader/abc",
      );
      expect(resolveHashRedirect("/read-realm/reader/abc", "?x=1")).toBe(
        "/read-realm#/reader/abc?x=1",
      );
    });
  });
});
