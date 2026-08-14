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

  it("routes core local shelf mutations through the command boundary", () => {
    expect(source).toContain("libraryCommandService.moveBook");
    expect(source).toContain("libraryCommandService.createFolderAndMove");
    expect(source).toContain("libraryCommandService.dissolveFolder");
    expect(source).toContain("libraryCommandService.removeBook");
    expect(source).toContain("operation.service.offloadVerifiedBook");
    expect(source).not.toContain("await db.libraryFolders.add(");
  });

  it("keeps legacy private sync transport out of the page", () => {
    expect(source).toContain("createPersonalSyncOperation");
    expect(source).toContain("createLegacyPersonalSyncApiClient");
    expect(source).toContain("createPersonalSyncService");
    expect(source).not.toContain("legacyPersonalSyncApiClient");
    expect(source).not.toContain("personalSyncService");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toContain("getShareHeaders");
    expect(source).not.toContain('apiUrl("/books');
    expect(source).not.toContain('apiUrl("/folders');
    expect(source).toContain("const operation = createPersonalSyncOperation(currentShareToken)");
    expect(source).toContain("currentShareTokenRef.current = trimmed");
    expect(source).toContain("currentShareTokenRef.current !== recoveryShareToken");
    expect(source).toContain("recoveredShareTokenRef.current === recoveryShareToken");
    expect(source).not.toMatch(/setTimeout\([\s\S]{0,160}handleDualSync\(true\)/);
  });

  it("keeps large shelves on one bounded render window with indexed lookups", () => {
    expect(source).toContain("paginateLibraryItems(");
    expect(source).toContain("LIBRARY_PAGE_SIZE = 48");
    expect(source.match(/renderedShelfEntries\.books\.map/g)).toHaveLength(2);
    expect(source.match(/renderedShelfEntries\.folders\.map/g)).toHaveLength(2);
    expect(source).toContain("data-folder-id={folder.id}");
    expect(source).toContain("localBookIds.has(book.id)");
    expect(source).toContain("cloudBookIds.has(book.id)");
    expect(source).toContain("folderBookCounts.get(folder.id)");
    expect(source.match(/filteredMergedBooks\.map/g)).toHaveLength(1);
    expect(source).not.toContain("mergedBooks.filter");
    expect(source).not.toContain("(books || []).some");
    expect(source).not.toContain("cloudBooks.some");
    expect(source.match(/currentFolders\.map/g)).toHaveLength(1);
  });
});
