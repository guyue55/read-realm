import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("notes page boundary", () => {
  const source = readFileSync(
    new URL("../../app/notes/page.tsx", import.meta.url),
    "utf8",
  );

  it("does not scan or mutate Dexie directly", () => {
    expect(source).not.toContain("db.books");
    expect(source).not.toContain("db.bookmarks");
  });

  it("exposes operation failures as an alert", () => {
    expect(source).toContain('role="alert"');
    expect(source).toContain("笔记导出失败");
    expect(source).toContain("笔记删除失败");
  });
});
