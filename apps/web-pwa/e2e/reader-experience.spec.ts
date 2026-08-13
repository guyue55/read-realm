import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

async function readProgress(page: import("@playwright/test").Page) {
  return await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ chapterIndex: number; characterOffset: number }>((resolve, reject) => {
        const request = database.transaction("progress", "readonly")
          .objectStore("progress").get("pagination-e2e-book");
        request.onsuccess = () => resolve({
          chapterIndex: request.result?.chapterIndex ?? -1,
          characterOffset: request.result?.characterOffset ?? 0,
        });
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

test("mobile pagination advances one page before changing chapters and restores its anchor", async ({ page }) => {
  await page.goto("/#/library");
  await page.evaluate(async () => {
    localStorage.setItem("reader-settings", JSON.stringify({
      fontFamily: "kaiti",
      fontSize: 18,
      lineHeight: 1.7,
      theme: "paper",
      pageMode: "pagination",
      uiMode: "default",
      paragraphSpacing: 16,
      letterSpacing: 0.03,
      autoFlipAtBottom: false,
    }));
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
        const now = "2026-08-14T01:30:00.000Z";
        transaction.objectStore("books").put({
          id: "pagination-e2e-book",
          title: "分页纵切",
          sourceType: "upload",
          format: "txt",
          status: "reading",
          tags: [],
          chapterCount: 2,
          toc: [
            { index: 0, title: "第一章" },
            { index: 1, title: "第二章" },
          ],
          parseStatus: "parsed",
          cacheStatus: "chapters_full",
          sourceAvailability: "full_cached",
          createdAt: now,
          updatedAt: now,
        });
        transaction.objectStore("chapters").put({
          id: "pagination-chapter-0",
          bookId: "pagination-e2e-book",
          index: 0,
          title: "第一章",
          content: `起点${"长段正文".repeat(3_000)}终点`,
        });
        transaction.objectStore("chapters").put({
          id: "pagination-chapter-1",
          bookId: "pagination-e2e-book",
          index: 1,
          title: "第二章",
          content: "第二章正文。",
        });
        transaction.objectStore("progress").put({
          bookId: "pagination-e2e-book",
          chapterId: "pagination-chapter-0",
          chapterIndex: 0,
          offset: 0,
          paragraphIndex: 0,
          characterOffset: 0,
          percentage: 0,
          updatedAt: now,
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  });

  await page.goto("/#/reader/pagination-e2e-book");
  const mobileCanvas = page.locator('[data-reader-content-canvas="mobile"]');
  const pageIndicator = mobileCanvas.getByText(/\d+ \/ \d+/);
  await expect(pageIndicator).toContainText("1 /", { timeout: 15_000 });
  await expect(page.locator('[data-page-index]:visible')).toHaveCount(2);
  await expect(mobileCanvas.getByRole("heading", { name: "第一章" })).toBeVisible();

  await page.locator('button[aria-label="下一页"]:visible').click();
  await expect(pageIndicator).toContainText("2 /", { timeout: 5_000 });
  expect(await page.locator('[data-page-index]:visible').count()).toBeLessThanOrEqual(3);
  await expect.poll(async () => (await readProgress(page)).chapterIndex, {
    timeout: 1_000,
    intervals: [50, 100, 200],
  }).toBe(0);

  await expect.poll(async () => (await readProgress(page)).characterOffset, {
    timeout: 1_000,
    intervals: [50, 100, 200],
  }).toBeGreaterThan(0);
  const beforeReload = await readProgress(page);

  await page.reload();
  await expect.poll(async () => await readProgress(page), { timeout: 15_000 }).toEqual(beforeReload);
  const paginationState = mobileCanvas.locator('[data-anchor-page]');
  await expect(paginationState).toHaveAttribute("data-anchor-restored", "true", {
    timeout: 15_000,
  });
  await expect(paginationState).toHaveAttribute("data-anchor-page", "1");
  await expect(paginationState).toHaveAttribute("data-current-page", "1");
  await expect(pageIndicator).toContainText("2 /", { timeout: 15_000 });
  await expect.poll(async () => (await readProgress(page)).chapterIndex).toBe(0);

  const semanticCharacter = (await readProgress(page)).characterOffset;
  const expectVisiblePageContainsAnchor = async () => {
    await expect.poll(async () => page.locator('[data-page-index]:visible').evaluateAll(
      (nodes, anchor) => nodes.some((node) => {
        const start = Number((node as HTMLElement).dataset.startCharacter ?? 0);
        const end = Number((node as HTMLElement).dataset.endCharacter ?? 0);
        return start <= anchor && anchor < end;
      }),
      semanticCharacter,
    ), { timeout: 15_000 }).toBe(true);
  };

  await page.setViewportSize({ width: 1024, height: 900 });
  await expectVisiblePageContainsAnchor();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectVisiblePageContainsAnchor();

  const visibleIndicator = page.locator('[data-reader-content-canvas="mobile"]')
    .getByText(/\d+ \/ \d+/);
  const nextPage = page.locator('button[aria-label="下一页"]:visible');
  const parseIndicator = async () => {
    const text = await visibleIndicator.textContent();
    const match = text?.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) throw new Error(`PAGINATION_INDICATOR_INVALID:${text}`);
    return { current: Number(match[1]), total: Number(match[2]) };
  };
  let indicator = await parseIndicator();
  while (indicator.current < indicator.total) {
    const expectedPage = indicator.current + 1;
    await nextPage.click();
    await expect.poll(async () => (await parseIndicator()).current, {
      timeout: 5_000,
    }).toBe(expectedPage);
    expect((await readProgress(page)).chapterIndex).toBe(0);
    indicator = await parseIndicator();
  }

  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await readProgress(page)).chapterIndex, {
    timeout: 5_000,
  }).toBe(1);
  await expect(mobileCanvas.getByRole("heading", { name: "第二章" })).toBeVisible();
});
