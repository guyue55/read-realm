import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("private search page boundary", () => {
  const source = readFileSync(
    new URL("../../app/search/page.tsx", import.meta.url),
    "utf8",
  );

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
    expect(source).toContain("min-h-11");
    expect(source).toMatch(/flex flex-col[^"\n]*sm:flex-row/);
    expect(source).toMatch(/w-full[^"\n]*sm:w-auto/);
    expect(source).not.toContain("animate-bounce-short");
    expect(source).not.toMatch(/[📖📥💡🍃]/u);
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
