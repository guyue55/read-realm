import { expect, test } from "@playwright/test";

function createPartialBackup() {
  return {
    books: Array.from({ length: 100 }, (_, index) => ({
      id: `recovered-book-${index}`,
      title: `恢复样本 ${index}`,
      sourceType: "upload",
      format: "epub",
      status: "reading",
      tags: [],
      chapterCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    })),
    progress: [],
    bookmarks: [],
    backupTime: "2026-08-15T00:00:00.000Z",
    isPartial: true,
    originalBookCount: 500,
  };
}

test("partial metadata recovery stays visibly partial", async ({ page }) => {
  await page.addInitScript((backup) => {
    window.localStorage.setItem(
      "read_realm_meta_shelf_backup",
      JSON.stringify(backup),
    );
  }, createPartialBackup());

  await page.goto("/library");

  const notice = page.locator('aside[role="alert"][aria-live="assertive"]');
  await expect(notice).toContainText("已从轻量应急备份恢复 100 / 500 本");
  await expect(notice).toContainText("需从您的完整备份恢复");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open("ReaderDatabase");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const transaction = database.transaction("books", "readonly");
              const countRequest = transaction.objectStore("books").count();
              countRequest.onerror = () => reject(countRequest.error);
              countRequest.onsuccess = () => {
                database.close();
                resolve(countRequest.result);
              };
            };
          }),
      ),
    )
    .toBe(100);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("read_realm_meta_shelf_recovery_gap"),
      ),
    )
    .toBe("500");

  await page.reload();
  await expect(notice).toContainText("本地书架仍只有 100 / 500 本");
  await expect(notice).toContainText("未被标记为已恢复");
});
