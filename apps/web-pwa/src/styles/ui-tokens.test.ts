import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { APP_NAV_ITEMS } from "../components/app-shell/nav-items";

describe("UI design system", () => {
  it("直接锁定运行时 tokens.css 的字体、圆角和阴影", async () => {
    const source = await readFile(
      new URL("./tokens.css", import.meta.url),
      "utf8",
    );

    expect(source).toContain("--font-ui:");
    expect(source).toContain("--font-display:");
    expect(source).toContain("--font-accent:");
    expect(source).toContain("--radius-control: 10px");
    expect(source).toContain("--radius-field: var(--radius-control)");
    expect(source).toContain("--radius-card: 16px");
    expect(source).toContain("--radius-panel: 22px");
    expect(source).toContain("--shadow-paper: 0 2px 12px");
    expect(source).toContain("--shadow-raised: 0 16px 44px");
  });

  it("主导航包含六个真实页面", () => {
    expect(APP_NAV_ITEMS.map((item) => item.href)).toEqual([
      "/library",
      "/public-library",
      "/search",
      "/import",
      "/notes",
      "/settings",
    ]);
  });

  it("字体和降级动效不依赖远程资源", async () => {
    const source = await readFile(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/@import\s+url\(['"]https?:\/\//);
    expect(source).toContain("@media (prefers-reduced-motion: reduce)");
    expect(source).toContain("user-select: text");
  });

  it("应用外壳不包含虚构用户和阅读统计", async () => {
    const source = await readFile(
      new URL("../components/AppShell.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/漫游的夜|18 天|15 \/ 45|藏书：12/);
  });
});
