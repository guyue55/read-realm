import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("private search page boundary", () => {
  const source = readFileSync(
    new URL("../../app/search/page.tsx", import.meta.url),
    "utf8",
  );
  // 搜索结果书卡已抽取为统一组件，触控安全与响应式布局契约由组件承担
  const cardSource = readFileSync(
    new URL("../../components/search/SearchBookCard.tsx", import.meta.url),
    "utf8",
  );
  const uiSource = `${source}\n${cardSource}`;

  it("does not issue raw storage or network operations from the page", () => {
    expect(source).not.toContain("db.books");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("getShareHeaders");
    expect(source).not.toContain("apiUrl(");
  });

  it("labels the legacy endpoint as private cloud and keeps public browsing separate", () => {
    expect(source).toContain("私人云端");
    expect(source).not.toContain("云端免费候选");
    expect(source).toContain('router.push("/public-library")');
    expect(source).toContain("浏览藏经阁");
  });

  it("keeps search feedback accessible and mobile controls touch safe", () => {
    expect(source).toContain(
      'role={statusTone === "error" ? "alert" : "status"}',
    );
    expect(source).toContain('role="status"');
    // 统一书卡组件的按钮触控高度与移动端响应式布局
    expect(cardSource).toContain("min-h-11");
    expect(cardSource).toMatch(/flex flex-col[^"\n]*sm:flex-row/);
    expect(cardSource).toMatch(/w-full[^"\n]*sm:w-auto/);
    expect(uiSource).not.toContain("animate-bounce-short");
    expect(uiSource).not.toMatch(/[📖📥💡🍃]/u);
  });

  it("invalidates stale private-cloud results when browser history restores a route", () => {
    const restoreStart = source.indexOf("const restoreRouteContext = () =>");
    const restoreEnd = source.indexOf(
      'window.addEventListener("popstate", restoreRouteContext)',
      restoreStart,
    );
    const restoreSource = source.slice(restoreStart, restoreEnd);

    expect(restoreSource).toContain("invalidateRemoteSearchResults()");
    expect(source).toContain("searchGenerationRef.current = generation");
    expect(source).toContain("setGlobalResults([])");
    expect(source).toContain('setRemoteStatus("idle")');
    expect(
      source.match(/invalidateRemoteSearchResults\(\)/gu)?.length ?? 0,
    ).toBeGreaterThanOrEqual(4);
  });
});
