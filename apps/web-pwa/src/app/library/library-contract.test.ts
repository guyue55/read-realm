import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./LibraryDefault.tsx", import.meta.url),
  "utf8",
);

describe("library truth contract", () => {
  it("uses real progress and never silently seeds the library", () => {
    expect(source).toContain("selectContinueBook");
    expect(source).not.toContain("books?.[0]");
    expect(source).not.toContain("library-auto-initialized");
    expect(source).not.toContain("PRESET_BOOKLISTS");
    expect(source).not.toContain("精选推荐书单");
    expect(source).not.toContain("推荐阁");
  });

  it("only claims cloud availability from the verified cloud inventory", () => {
    expect(source).toContain("if (cloudBookIds.has(book.id))");
    expect(source).toContain('label: "仅书目信息"');
    expect(source).not.toContain("密阁天青");
    expect(source).not.toContain("微秒级进度");
  });

  it("does not continue a remote delete unless the local command applied", () => {
    expect(source).toContain('if (result.status !== "applied")');
    expect(source).toContain("未发起云端删除");
    expect(source).toContain("已从本机移除；私人云删除");
    expect(source).toContain(
      "previous.filter((cloudBook) => cloudBook.id !== bookId)",
    );
    expect(source).not.toContain(
      "删除未完成，本地书籍与云端副本均按原状态保留",
    );
  });

  it("does not claim an unverified cloud difference", () => {
    expect(source).not.toContain("发现本地与云端存在数据微澜");
    expect(source).toContain("data-library-sync");
    expect(source).toContain("上次核验有云端副本");
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

  it("rechecks the shared write mutex at local mutation execution points", () => {
    expect(source.match(/tryAcquireLibraryMutation\(\)/gu)?.length).toBeGreaterThanOrEqual(
      5,
    );
    expect(source.match(/tryAcquireMutation\(\)/gu)?.length).toBeGreaterThanOrEqual(
      4,
    );
    expect(source).toContain("同步操作尚未完成，暂不解除原文件关联");
    expect(source).toContain("同步操作尚未完成，暂不从本机移除这本书");
  });

  it("reports only changed files that were actually marked for reparse", () => {
    expect(source).toContain("reconciliation.changed.filter");
    expect(source).toContain("indexedFile.bookId");
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
    expect(source).toContain(
      "const operation = createPersonalSyncOperation(currentShareToken)",
    );
    expect(source).toContain("currentShareTokenRef.current = trimmed");
    expect(source).toContain(
      "currentShareTokenRef.current !== recoveryShareToken",
    );
    expect(source).toContain(
      "recoveredShareTokenRef.current === recoveryShareToken",
    );
    expect(source).not.toMatch(
      /setTimeout\([\s\S]{0,160}handleDualSync\(true\)/,
    );
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

  it("keeps shelf entries keyboard reachable and records the return source", () => {
    expect(source).toContain('rememberViewScrollPosition("library"');
    expect(source).toContain('rememberViewSourceFocus("library"');
    expect(source.match(/data-library-entry-primary/gu)).toHaveLength(4);
    expect(source).not.toContain('role="link"');
    expect(source).not.toContain("tabIndex={0}");
    expect(source).not.toMatch(/\bconfirm\s*\(/u);
  });

  it("keeps confirmations open for typed non-applied maintenance outcomes", () => {
    expect(source).toContain('throw new Error("\u89e3\u9664\u76ee\u5f55\u5173\u8054\u5931\u8d25');
    expect(source).toContain('throw new Error("\u89e3\u9664\u539f\u6587\u4ef6\u5173\u8054\u5931\u8d25');
    expect(source).toContain('throw new Error("\u91cd\u65b0\u5bfc\u5165\u51c6\u5907\u5931\u8d25');
    expect(source).toContain('throw new Error("\u89e3\u6563\u4e66\u7ba7\u5931\u8d25');
    expect(source).not.toContain("DISCONNECT_FOLDER_");
    expect(source).toContain("canClampLibraryRoutePage({");
    expect(source).toContain("canCommitCloudInventory({");
    expect(source).toContain(
      "commitCloudInventory(shareToken, inventoryGeneration",
    );
  });
});
