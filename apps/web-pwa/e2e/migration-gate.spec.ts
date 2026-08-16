import { expect, test, type Page } from "@playwright/test";

const nativeVersionNine = 90;

async function seedVersionNine(page: Page, settingsValue: string) {
  await page.goto("/manifest.json");
  await page.evaluate(async ({ version, settings }) => {
    localStorage.setItem("reader-settings", settings);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB["open"]("ReaderDatabase", version);
      request.onupgradeneeded = () => {
        const database = request.result;
        const create = (
          name: string,
          keyPath: string,
          indexes: Array<[string, string | string[]]> = [],
        ) => {
          const store = database.createObjectStore(name, { keyPath });
          for (const [indexName, indexKeyPath] of indexes) {
            store.createIndex(indexName, indexKeyPath);
          }
        };
        create("books", "id", [
          ["title", "title"], ["createdAt", "createdAt"],
          ["lastReadAt", "lastReadAt"], ["sourceFolderId", "sourceFolderId"],
        ]);
        create("chapters", "id", [
          ["[bookId+index]", ["bookId", "index"]], ["bookId", "bookId"], ["index", "index"],
        ]);
        create("progress", "bookId");
        create("bookmarks", "id", [["bookId", "bookId"], ["chapterIndex", "chapterIndex"]]);
        create("importTasks", "id");
        create("aiViews", "id", [
          ["bookId", "bookId"], ["chapterIndex", "chapterIndex"], ["sourceHash", "sourceHash"],
        ]);
        create("librarySources", "id", [
          ["type", "type"], ["permissionState", "permissionState"], ["lastScanAt", "lastScanAt"],
        ]);
        create("libraryFolders", "id", [
          ["parentId", "parentId"], ["sourceId", "sourceId"], ["relativePath", "relativePath"],
        ]);
        create("indexedNovelFiles", "id", [
          ["sourceId", "sourceId"], ["parentFolderId", "parentFolderId"],
          ["relativePath", "relativePath"], ["bookId", "bookId"], ["status", "status"],
        ]);
        create("txtChapterIndices", "chapterId", [
          ["[bookId+index]", ["bookId", "index"]], ["bookId", "bookId"], ["index", "index"],
        ]);
        create("aiUserConfigs", "id");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(
          ["books", "chapters", "progress", "bookmarks", "librarySources", "indexedNovelFiles"],
          "readwrite",
        );
        const createdAt = "2026-08-13T10:20:00+08:00";
        transaction.objectStore("books").put({
          id: "legacy-book", title: "上一稳定版", sourceType: "upload", format: "txt",
          status: "reading", tags: [], chapterCount: 1, createdAt, updatedAt: createdAt,
        });
        transaction.objectStore("chapters").put({
          id: "legacy-chapter", bookId: "legacy-book", index: 0,
          title: "旧章", content: "旧版正文仍然可读。",
        });
        transaction.objectStore("progress").put({
          bookId: "legacy-book", chapterId: "legacy-chapter", chapterIndex: 0,
          offset: 4, percentage: 25, updatedAt: createdAt,
        });
        transaction.objectStore("bookmarks").put({
          id: "legacy-bookmark", bookId: "legacy-book", chapterIndex: 0,
          offset: 2, createdAt,
        });
        transaction.objectStore("librarySources").put({
          id: "legacy-source", name: "旧本地来源", type: "manual_upload", rootName: "uploads",
          permissionState: "granted", scanMode: "manual", createdAt, updatedAt: createdAt,
        });
        transaction.objectStore("indexedNovelFiles").put({
          id: "legacy-file", sourceId: "legacy-source", name: "legacy.txt",
          relativePath: "legacy.txt", kind: "file", format: "txt", status: "cached",
          bookId: "legacy-book", createdAt, updatedAt: createdAt,
        });
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      };
    });
  }, { version: nativeVersionNine, settings: settingsValue });
}

async function inspectDatabase(page: Page) {
  return page.evaluate(async () => new Promise<{
    version: number;
    stores: string[];
    bookTitle: string | null;
    backup: string | null;
  }>((resolve, reject) => {
    const request = indexedDB["open"]("ReaderDatabase");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const stores = Array.from(database.objectStoreNames);
      const names = stores.includes("migrationBackups")
        ? ["books", "migrationBackups"]
        : ["books"];
      const transaction = database.transaction(names, "readonly");
      const bookRequest = transaction.objectStore("books").get("legacy-book");
      const backupRequest = stores.includes("migrationBackups")
        ? transaction.objectStore("migrationBackups").get("pre-upgrade-v9-to-v10")
        : null;
      transaction.oncomplete = () => {
        const result = {
          version: database.version,
          stores,
          bookTitle: bookRequest.result?.title ?? null,
          backup: backupRequest?.result?.serializedSnapshot ?? null,
        };
        database.close();
        resolve(result);
      };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

test("RISK-03 real Dexie upgrade backs up, is idempotent and tolerates corrupt settings", async ({
  browser,
}) => {
  const validSettings = JSON.stringify({
    fontFamily: "kaiti", fontSize: 19, lineHeight: 1.9,
    theme: "paper", pageMode: "scroll",
  });
  const successContext = await browser.newContext();
  try {
    const page = await successContext.newPage();
    await seedVersionNine(page, validSettings);
    await page.goto("/#/library");
    await expect(page.locator('[data-book-id="legacy-book"]')).toHaveCount(1);
    const upgraded = await inspectDatabase(page);
    expect(upgraded.version).toBe(100);
    expect(upgraded.bookTitle).toBe("上一稳定版");
    expect(upgraded.stores).toContain("migrationBackups");
    const backup = JSON.parse(upgraded.backup ?? "null");
    expect(backup.source.databaseVersion).toBe(9);
    expect(backup.data.books[0].id).toBe("legacy-book");
    expect(backup.data.chapters[0].content).toBe("旧版正文仍然可读。");
    expect(backup.data.progress[0].chapterId).toBe("legacy-chapter");
    expect(backup.data.bookmarks).toHaveLength(1);
    expect(backup.data.fileRefs).toHaveLength(1);

    await page.reload();
    const reopened = await inspectDatabase(page);
    expect(reopened.version).toBe(100);
    expect(reopened.backup).toBe(upgraded.backup);
  } finally {
    await successContext.close();
  }

  // 🏮 [FIX] 修复后：损坏的 settings（非法 JSON）不再阻断升级。
  // 升级快照对旧库脏数据/损坏设置采取宽松清洗（safeParse 过滤 + 默认设置兜底），
  // 书架照常打开，不再出现“本地数据升级未完成”。
  const tolerantContext = await browser.newContext();
  try {
    const page = await tolerantContext.newPage();
    await seedVersionNine(page, "{broken-json");
    await page.goto("/#/library");
    await expect(page.locator('[data-book-id="legacy-book"]')).toHaveCount(1);
    await expect(page.locator('section[role="alert"]')).toHaveCount(0);
    const upgraded = await inspectDatabase(page);
    expect(upgraded.version).toBe(100);
    expect(upgraded.bookTitle).toBe("上一稳定版");
    expect(upgraded.stores).toContain("migrationBackups");
  } finally {
    await tolerantContext.close();
  }
});
