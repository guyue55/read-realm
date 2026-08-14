import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

async function seedReaderBook(
  page: Page,
  {
    bookId,
    pageMode,
  }: {
    bookId: string;
    pageMode: "scroll" | "pagination";
  },
) {
  await page.goto("/#/library");
  await page.evaluate(async ({ targetBookId, targetPageMode }) => {
    localStorage.setItem("reader-settings", JSON.stringify({
      fontFamily: "kaiti",
      fontSize: 18,
      lineHeight: 1.7,
      theme: "paper",
      pageMode: targetPageMode,
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
        const now = "2026-08-14T12:00:00.000Z";
        transaction.objectStore("books").put({
          id: targetBookId,
          title: "移动阅读打磨纵切",
          sourceType: "upload",
          format: "txt",
          status: "reading",
          tags: [],
          chapterCount: 1,
          toc: [{ index: 0, title: "第一章" }],
          parseStatus: "parsed",
          cacheStatus: "chapters_full",
          sourceAvailability: "full_cached",
          createdAt: now,
          updatedAt: now,
        });
        transaction.objectStore("chapters").put({
          id: `${targetBookId}-chapter-0`,
          bookId: targetBookId,
          index: 0,
          title: "第一章",
          content: `开篇锚点 ${"安静阅读的正文。".repeat(240)} 收束锚点`,
        });
        transaction.objectStore("progress").put({
          bookId: targetBookId,
          chapterId: `${targetBookId}-chapter-0`,
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
  }, { targetBookId: bookId, targetPageMode: pageMode });
}

async function readProgress(
  page: import("@playwright/test").Page,
  bookId = "pagination-e2e-book",
) {
  return await page.evaluate(async (targetBookId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ chapterIndex: number; characterOffset: number }>((resolve, reject) => {
        const request = database.transaction("progress", "readonly")
          .objectStore("progress").get(targetBookId);
        request.onsuccess = () => resolve({
          chapterIndex: request.result?.chapterIndex ?? -1,
          characterOffset: request.result?.characterOffset ?? 0,
        });
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, bookId);
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

test("continuous scroll keeps an active three-chapter window while moving both directions", async ({ page }) => {
  await page.goto("/#/library");
  await page.evaluate(async () => {
    localStorage.setItem("reader-settings", JSON.stringify({
      fontFamily: "kaiti",
      fontSize: 18,
      lineHeight: 1.7,
      theme: "paper",
      pageMode: "scroll",
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
        const now = "2026-08-14T02:55:00.000Z";
        const toc = Array.from({ length: 20 }, (_, index) => ({
          index,
          title: `第 ${index + 1} 章`,
        }));
        transaction.objectStore("books").put({
          id: "scroll-window-e2e-book",
          title: "滚动窗口纵切",
          sourceType: "upload",
          format: "txt",
          status: "reading",
          tags: [],
          chapterCount: toc.length,
          toc,
          parseStatus: "parsed",
          cacheStatus: "chapters_full",
          sourceAvailability: "full_cached",
          createdAt: now,
          updatedAt: now,
        });
        for (const item of toc) {
          transaction.objectStore("chapters").put({
            id: `scroll-window-chapter-${item.index}`,
            bookId: "scroll-window-e2e-book",
            index: item.index,
            title: item.title,
            content: `章节锚点 ${item.index} ${"正文段落".repeat(180)}`,
          });
        }
        transaction.objectStore("progress").put({
          bookId: "scroll-window-e2e-book",
          chapterId: "scroll-window-chapter-0",
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

  await page.goto("/#/reader/scroll-window-e2e-book");
  const mobileCanvas = page.locator('[data-reader-content-canvas="mobile"]');
  const chapterNodes = mobileCanvas.locator(".chapter-container");
  await expect(chapterNodes).toHaveCount(2, { timeout: 15_000 });

  const waitForWindow = async (expected: number[]) => {
    await expect.poll(async () => chapterNodes.evaluateAll((nodes) =>
      nodes.map((node) => Number((node as HTMLElement).dataset.chapterIndex)),
    ), { timeout: 15_000 }).toEqual(expected);
    expect(await chapterNodes.count()).toBeLessThanOrEqual(3);
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
  };
  const scrollToChapter = async (index: number) => {
    await mobileCanvas.locator(`[data-chapter-index="${index}"]`).evaluate((node) => {
      const chapterElement = node as HTMLElement;
      const container = chapterElement.closest(
        '[data-reader-content-canvas="mobile"]',
      ) as HTMLElement | null;
      if (!container) throw new Error("SCROLL_CONTAINER_NOT_FOUND");
      const previousBehavior = container.style.scrollBehavior;
      container.style.scrollBehavior = "auto";
      container.scrollTop = chapterElement.offsetTop;
      requestAnimationFrame(() => {
        container.style.scrollBehavior = previousBehavior;
      });
    });
  };

  for (let index = 1; index <= 11; index += 1) {
    await scrollToChapter(index);
    await waitForWindow([index - 1, index, index + 1]);
  }
  await expect.poll(async () => (
    await readProgress(page, "scroll-window-e2e-book")
  ).chapterIndex).toBe(11);

  for (let index = 10; index >= 8; index -= 1) {
    await scrollToChapter(index);
    await waitForWindow([index - 1, index, index + 1]);
  }
  await expect.poll(async () => (
    await readProgress(page, "scroll-window-e2e-book")
  ).chapterIndex).toBe(8);
  await expect(mobileCanvas.getByText("章节锚点 8", { exact: false })).toBeVisible();

  const savedAtChapterEight = await readProgress(page, "scroll-window-e2e-book");
  await page.reload();
  await expect.poll(async () => (
    await readProgress(page, "scroll-window-e2e-book")
  )).toEqual(savedAtChapterEight);
  await waitForWindow([7, 8, 9]);
  await expect(mobileCanvas.getByText("章节锚点 8", { exact: false })).toBeVisible();

  const tocButton = page.locator("button:visible").filter({ hasText: "目录" }).first();
  await tocButton.focus();
  await page.keyboard.press("Enter");
  const targetChapterButton = page.locator("button:visible").filter({ hasText: "第 18 章" });
  await targetChapterButton.focus();
  await page.keyboard.press("Enter");
  await waitForWindow([16, 17, 18]);
  await expect.poll(async () => (
    await readProgress(page, "scroll-window-e2e-book")
  ).chapterIndex).toBe(17);
  await expect(mobileCanvas.getByText("章节锚点 17", { exact: false })).toBeVisible();
});

test("reader dialogs contain and restore focus", async ({ page }) => {
  await seedReaderBook(page, {
    bookId: "reader-dialog-e2e-book",
    pageMode: "scroll",
  });
  await page.goto("/#/reader/reader-dialog-e2e-book");
  await expect(page.getByRole("heading", { name: "第一章" })).toBeVisible({
    timeout: 15_000,
  });

  const settingsTrigger = page.locator('button[aria-label="阅读设置"]:visible');
  await settingsTrigger.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "阅读设置" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((node) => (
    node.contains(document.activeElement)
  ))).toBe(true);

  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => dialog.evaluate((node) => (
    node.contains(document.activeElement)
  ))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(settingsTrigger).toBeFocused();

  const canvas = page.locator('[data-reader-content-canvas="mobile"]');
  await canvas.click({ position: { x: 190, y: 350 } });
  const hiddenToolbars = page.locator('[data-reader-toolbar][aria-hidden="true"]');
  await expect(hiddenToolbars).toHaveCount(2);
  await page.keyboard.press("Tab");
  await expect.poll(async () => hiddenToolbars.evaluateAll((toolbars) => (
    toolbars.every((toolbar) => !toolbar.contains(document.activeElement))
  ))).toBe(true);
});
