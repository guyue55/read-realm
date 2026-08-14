import { expect, test } from "@playwright/test";

const BOOK_COUNT = 500;
const PAGE_SIZE = 48;

async function seedLargeShelf(page: import("@playwright/test").Page) {
  await page.evaluate(
    ({ bookCount }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("books", "readwrite");
          const store = transaction.objectStore("books");
          for (let index = 0; index < bookCount; index += 1) {
            const suffix = String(index).padStart(3, "0");
            store.put({
              id: `bounded-book-${suffix}`,
              title: `有界书架 ${suffix}`,
              sourceType: "upload",
              format: "epub",
              status: "reading",
              tags: [],
              chapterCount: 1,
              createdAt: "2026-08-15T00:00:00.000Z",
              updatedAt: "2026-08-15T00:00:00.000Z",
            });
          }
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        };
      }),
    { bookCount: BOOK_COUNT },
  );
}

async function seedLargeFolderShelf(page: import("@playwright/test").Page) {
  await page.evaluate(
    ({ itemCount }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("ReaderDatabase");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["books", "libraryFolders"],
            "readwrite",
          );
          const bookStore = transaction.objectStore("books");
          const folderStore = transaction.objectStore("libraryFolders");
          for (let index = 0; index < itemCount; index += 1) {
            const suffix = String(index).padStart(3, "0");
            const folderId = `bounded-folder-${suffix}`;
            folderStore.put({
              id: folderId,
              name: `有界书箧 ${suffix}`,
              sourceType: "virtual",
              depth: 0,
              sortOrder: index,
              createdAt: "2026-08-15T00:00:00.000Z",
              updatedAt: "2026-08-15T00:00:00.000Z",
            });
            bookStore.put({
              id: `folder-book-${suffix}`,
              title: `书箧藏书 ${suffix}`,
              sourceType: "upload",
              sourceFolderId: folderId,
              format: "epub",
              status: "reading",
              tags: [],
              chapterCount: 1,
              createdAt: "2026-08-15T00:00:00.000Z",
              updatedAt: "2026-08-15T00:00:00.000Z",
            });
          }
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        };
      }),
    { itemCount: BOOK_COUNT },
  );
}

test("500-book shelf stays bounded across views, pages, mobile, and offline", async ({
  context,
  page,
}) => {
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "书架还是空的" })).toBeVisible();
  await seedLargeShelf(page);
  await page.reload();

  const cards = page.locator("[data-library-shelf] [data-book-id]");
  const pagination = page.locator("[data-library-pagination]");
  await expect(cards).toHaveCount(PAGE_SIZE);
  await expect(pagination).toContainText("第 1 / 11 页");
  await expect(pagination).toContainText("当前 1–48 项，共 500 项");

  await page.getByRole("button", { name: "紧凑", exact: true }).click();
  await expect(cards).toHaveCount(PAGE_SIZE);
  await page.getByRole("button", { name: "列表", exact: true }).click();
  await expect(cards).toHaveCount(PAGE_SIZE);

  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(pagination).toContainText("第 2 / 11 页");
  await expect(page.locator('[data-book-id="bounded-book-048"]')).toHaveCount(1);
  await expect(page.locator('[data-book-id="bounded-book-000"]')).toHaveCount(0);

  await page.getByRole("button", { name: "末页", exact: true }).click();
  await expect(cards).toHaveCount(BOOK_COUNT - PAGE_SIZE * 10);
  await expect(pagination).toContainText("当前 481–500 项，共 500 项");
  await expect(page.locator('[data-book-id="bounded-book-499"]')).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(cards).toHaveCount(20);
  const paginationButtons = pagination.getByRole("button");
  expect(await paginationButtons.count()).toBe(4);
  for (const button of await paginationButtons.all()) {
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await context.setOffline(true);
  await page.getByRole("button", { name: "上一页", exact: true }).click();
  await expect(pagination).toContainText("第 10 / 11 页");
  await expect(cards).toHaveCount(PAGE_SIZE);
  await context.setOffline(false);

  await page.getByRole("button", { name: "书名", exact: true }).click();
  await expect(pagination).toContainText("第 1 / 11 页");
  await expect(page.locator('[data-book-id="bounded-book-000"]')).toHaveCount(1);
});

test("500 root folders share the same hard DOM bound as books", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "书架还是空的" })).toBeVisible();
  await seedLargeFolderShelf(page);
  await page.reload();

  const shelfEntries = page.locator(
    "[data-library-shelf] [data-folder-id], [data-library-shelf] [data-book-id]",
  );
  const pagination = page.locator("[data-library-pagination]");
  await expect(shelfEntries).toHaveCount(PAGE_SIZE);
  await expect(page.locator("[data-library-shelf] [data-folder-id]")).toHaveCount(
    PAGE_SIZE,
  );
  await expect(page.locator("[data-library-shelf] [data-book-id]")).toHaveCount(0);
  await expect(pagination).toContainText("第 1 / 11 页");

  await page.locator('[data-folder-id="bounded-folder-000"]').click();
  await expect(page.locator('[data-book-id="folder-book-000"]')).toHaveCount(1);
  await expect(page.locator("[data-library-pagination]")).toHaveCount(0);

  await page.getByRole("button", { name: "📖 私人藏书" }).click();
  await expect(shelfEntries).toHaveCount(PAGE_SIZE);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(pagination).toContainText("第 2 / 11 页");
  await expect(page.locator('[data-folder-id="bounded-folder-048"]')).toHaveCount(1);
  await expect(page.locator('[data-folder-id="bounded-folder-000"]')).toHaveCount(0);
});
