import { expect, test, type Page } from "@playwright/test";

const apiBase = "http://127.0.0.1:4100";

test.use({ serviceWorkers: "block" });

async function readLocalBook(page: Page, bookId: string) {
  return page.evaluate(
    (targetBookId) =>
      new Promise<{ book?: { id: string; cacheStatus?: string }; chapters: number }>(
        (resolve, reject) => {
          const request = indexedDB.open("ReaderDatabase");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(
              ["books", "chapters"],
              "readonly",
            );
            const bookRequest = transaction.objectStore("books").get(targetBookId);
            const chapterRequest = transaction
              .objectStore("chapters")
              .index("bookId")
              .count(targetBookId);
            transaction.oncomplete = () => {
              database.close();
              resolve({
                book: bookRequest.result,
                chapters: chapterRequest.result,
              });
            };
            transaction.onerror = () => reject(transaction.error);
          };
        },
      ),
    bookId,
  );
}

async function writeReadableLocalBook(page: Page, bookId: string, title: string) {
  await page.evaluate(
    ({ id, bookTitle }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["books", "chapters", "progress"],
            "readwrite",
          );
          transaction.objectStore("books").put({
            id,
            title: bookTitle,
            sourceType: "upload",
            format: "txt",
            status: "reading",
            tags: [],
            chapterCount: 1,
            cacheStatus: "chapters_full",
            sourceAvailability: "full_cached",
            createdAt: "2026-08-15T00:00:00.000Z",
            updatedAt: "2026-08-15T01:00:00.000Z",
          });
          transaction.objectStore("chapters").put({
            id: `${id}-local-0`,
            bookId: id,
            index: 0,
            title: "本地章节",
            content: "另一上下文刚刚写入的本地正文",
          });
          transaction.objectStore("progress").put({
            bookId: id,
            chapterId: `${id}-local-0`,
            chapterIndex: 0,
            offset: 3,
            percentage: 61,
            updatedAt: "2026-08-15T01:00:00.000Z",
          });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    { id: bookId, bookTitle: title },
  );
}

test("private search validates and atomically downloads a complete book", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const suffix = Date.now().toString(36);
  const token = `search-private-${suffix}`;
  const bookId = `search-book-${suffix}`;
  const title = `私人检索样本-${suffix}`;
  await page.addInitScript((shareToken) => {
    localStorage.setItem("reader-share-token", shareToken);
    localStorage.setItem("reader-sync-auto-startup", "false");
  }, token);
  const imported = await request.post(`${apiBase}/books/import`, {
    headers: { "x-share-token": token },
    data: {
      metadata: {
        id: bookId,
        title,
        sourceType: "upload",
        format: "txt",
        status: "reading",
        tags: [],
        chapterCount: 2,
        createdAt: "2026-08-15T00:00:00.000Z",
        updatedAt: "2026-08-15T00:00:00.000Z",
      },
      chapters: [
        { index: 0, title: "第一章", content: "完整正文一" },
        { index: 1, title: "第二章", content: "完整正文二" },
      ],
      replaceExisting: true,
    },
  });
  expect(imported.ok()).toBeTruthy();

  try {
    await page.goto("/#/search");
    await page.getByRole("textbox", { name: /搜索本地书架/ }).fill(title);
    await page.getByRole("button", { name: "搜索私人云端" }).click();
    await expect(page.getByRole("heading", { name: /私人云端结果/ })).toBeVisible();
    const importButton = page.getByRole("button", { name: /拉取入库/ });
    const filters = page.getByRole("button", {
      name: /^(综合|书名|作者|标签|连载中|已完结)$/,
    });
    await expect.poll(async () => {
      const sizes = await filters.evaluateAll((items) =>
        items.map((item) => item.getBoundingClientRect().height),
      );
      return sizes.every((height) => height >= 44);
    }).toBe(true);
    await expect.poll(async () => (await importButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect.poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await importButton.click();

    await expect.poll(() => readLocalBook(page, bookId)).toMatchObject({
      book: { id: bookId, cacheStatus: "chapters_full" },
      chapters: 2,
    });
    await expect(page.getByText(/2 章已完整下载到本地/)).toBeVisible();
  } finally {
    await request.delete(`${apiBase}/books`, {
      headers: { "x-share-token": token },
    });
  }
});

test("keyboard-adjusted reader settings persist after blur and reload", async ({
  page,
}) => {
  await page.goto("/#/settings");
  const fontSize = page.getByRole("slider", { name: "字号" });
  await expect(fontSize).toHaveValue("18");
  await fontSize.focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "返回书架" }).focus();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("reader-settings") ?? "null"),
      ),
    )
    .toMatchObject({ fontSize: 19 });

  await page.reload();
  await expect(page.getByRole("slider", { name: "字号" })).toHaveValue("19");
});

test("private search observes a local copy added after results were rendered", async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString(36);
  const token = `search-live-${suffix}`;
  const bookId = `search-live-book-${suffix}`;
  const title = `跨上下文搜索样本-${suffix}`;
  await page.addInitScript((shareToken) => {
    localStorage.setItem("reader-share-token", shareToken);
    localStorage.setItem("reader-sync-auto-startup", "false");
  }, token);
  const imported = await request.post(`${apiBase}/books/import`, {
    headers: { "x-share-token": token },
    data: {
      metadata: {
        id: bookId,
        title,
        sourceType: "upload",
        format: "txt",
        status: "reading",
        tags: [],
        chapterCount: 1,
        createdAt: "2026-08-15T00:00:00.000Z",
        updatedAt: "2026-08-15T00:00:00.000Z",
      },
      chapters: [{ index: 0, title: "云端章节", content: "云端正文" }],
      replaceExisting: true,
    },
  });
  expect(imported.ok()).toBeTruthy();

  try {
    await page.goto("/#/search");
    await page.getByRole("textbox", { name: /搜索本地书架/ }).fill(title);
    await page.getByRole("button", { name: "搜索私人云端" }).click();
    await expect(page.getByRole("button", { name: "拉取入库" })).toBeVisible();

    await writeReadableLocalBook(page, bookId, title);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    await expect(page.getByRole("button", { name: "去阅读" })).toBeVisible();
    await expect(page.getByRole("button", { name: "拉取入库" })).toHaveCount(0);
    await expect.poll(() => readLocalBook(page, bookId)).toMatchObject({
      book: { id: bookId, cacheStatus: "chapters_full" },
      chapters: 1,
    });
  } finally {
    await request.delete(`${apiBase}/books`, {
      headers: { "x-share-token": token },
    });
  }
});
