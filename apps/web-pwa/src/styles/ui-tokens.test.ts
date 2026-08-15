import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { APP_NAV_ITEMS } from "../components/app-shell/nav-items";
import { UI_TOKENS } from "./ui-tokens";

describe("UI design system", () => {
  it("颜色角色完整且采用固定的自然圆角层级", () => {
    expect(Object.keys(UI_TOKENS.color)).toEqual([
      "background",
      "surface",
      "text",
      "muted",
      "primary",
      "info",
      "danger",
    ]);
    expect(UI_TOKENS.radius).toEqual({
      control: 10,
      field: 12,
      card: 16,
      panel: 22,
      round: 999,
    });
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
