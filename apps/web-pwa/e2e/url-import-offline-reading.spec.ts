import { expect, test, type Page } from "@playwright/test";

/**
 * DoD-8：已导入 URL 书在「断网 + 本地 API 下线」下完整阅读。
 *
 * 语义：URL 书导入后章节全量落本地（cacheStatus: chapters_full），
 * 阅读走 Dexie，绝不依赖网络/本地 API；本地 API 下线不影响已导入内容阅读。
 */
const BOOK_ID = "offline-url-book";

async function seedUrlBook(page: Page, chapterCount: number) {
  await page.goto("/#/library");
  await expect(page.locator("[data-library-shelf]")).toBeAttached({ timeout: 15_000 });
  await expect.poll(async () => page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const metadata = databases.find(({ name }) => name === "ReaderDatabase");
    if (!metadata || (metadata.version ?? 0) < 10) return false;
    return await new Promise<boolean>((resolve) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => {
        const database = request.result;
        const ready =
          database.objectStoreNames.contains("books") &&
          database.objectStoreNames.contains("chapters");
        database.close();
        resolve(ready);
      };
      request.onerror = () => resolve(false);
    });
  }), { timeout: 15_000 }).toBe(true);

  const chapters = Array.from({ length: chapterCount }, (_, index) => ({
    id: `${BOOK_ID}-chapter-${index}`,
    bookId: BOOK_ID,
    index,
    title: `第${index + 1}章`,
    content: `第${index + 1}章正文内容。${"离线也能读的已导入内容。".repeat(120)}`,
  }));

  await page.evaluate(async ({ targetBookId, targetChapters }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ["books", "chapters", "progress", "bookmarks"],
          "readwrite",
        );
        for (const name of ["books", "chapters", "progress", "bookmarks"]) {
          transaction.objectStore(name).clear();
        }
        const now = "2026-08-14T12:00:00.000Z";
        transaction.objectStore("books").put({
          id: targetBookId,
          title: "离线可读URL书",
          sourceType: "url",
          sourceUrl: "https://offline.example/book",
          format: "html",
          status: "reading",
          tags: [],
          chapterCount: targetChapters.length,
          toc: targetChapters.map(({ index, title }) => ({ index, title })),
          parseStatus: "parsed",
          cacheStatus: "chapters_full",
          sourceAvailability: "full_cached",
          createdAt: now,
          updatedAt: now,
        });
        for (const chapter of targetChapters) {
          transaction.objectStore("chapters").put(chapter);
        }
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, { targetBookId: BOOK_ID, targetChapters: chapters });
}

test("断网 + 本地 API 下线：已导入 URL 书完整阅读", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await seedUrlBook(page, 3);

  // 模拟断网：navigator.onLine = false
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
  });

  // 模拟本地 API 下线：拦截所有 API 请求并返回失败
  let apiRequestCount = 0;
  await page.route("http://127.0.0.1:4100/**", async (route) => {
    apiRequestCount += 1;
    await route.abort("failed");
  });
  // 兜底：任意端口 API 请求也拦截（防止 baseURL 端口差异）
  await page.route("**/books/**", async (route) => {
    apiRequestCount += 1;
    await route.abort("failed");
  });

  // 打开已导入 URL 书（此时断网 + API 下线）
  await page.goto("/#/book/" + BOOK_ID);
  // 断网提示可见，证明离线态生效
  await expect(page.getByText(/离线.*仍可阅读已缓存内容/)).toBeVisible({
    timeout: 15_000,
  });
  // 进入阅读器继续阅读
  await page.getByRole("button", { name: "继续阅读" }).click();
  await expect(page.locator(".reader-content:visible").first()).toContainText(
    "第1章正文内容",
    { timeout: 15_000 },
  );

  // 断网下翻到下一章，验证完整阅读（章节走本地，不发 API 请求）
  await page.locator('button[aria-label="下一章"]:visible').first().click();
  await expect(page.locator(".reader-content:visible").first()).toContainText(
    "第2章正文内容",
    { timeout: 15_000 },
  );
  if (pageErrors.length > 0) {
    throw new Error(`阅读器出现页面错误: ${pageErrors.join(" | ")}`);
  }

  // 确保阅读全程未发起任何 API 请求（纯本地）
  expect(apiRequestCount).toBe(0);
});
