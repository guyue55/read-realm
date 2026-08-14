import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./LibraryDefault.tsx", import.meta.url), "utf8");

describe("library truth contract", () => {
  it("uses real progress and never silently seeds the library", () => {
    expect(source).toContain("selectContinueBook");
    expect(source).not.toContain('books?.[0]');
    expect(source).not.toContain("library-auto-initialized");
  });

  it("does not claim an unverified cloud difference", () => {
    expect(source).not.toContain("发现本地与云端存在数据微澜");
    expect(source).toContain("currentShareToken || isSyncing");
  });

  it("reads shelf metadata through one library query boundary", () => {
    expect(source).toContain("libraryQueryService.readSnapshot");
    expect(source).toContain("libraryQueryService.readSyncInventory");
    expect(source).not.toContain("db.books.toArray()");
    expect(source).not.toContain("db.progress.toArray()");
    expect(source).not.toContain("db.libraryFolders.toArray()");
    expect(source).not.toContain('db.chapters.orderBy("bookId").uniqueKeys()');
    expect(source).not.toContain("db.bookmarks.count()");
  });
});
