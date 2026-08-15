import { expect, test } from "@playwright/test";

function remoteSearchBook() {
  return {
    id: "stale-search-book",
    title: "不应回来的旧结果",
    sourceType: "cloud_cache",
    format: "txt",
    status: "reading",
    tags: [],
    chapterCount: 2,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  };
}

test("editing the route query invalidates an older private-cloud search response", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("reader-share-token", "search-route-key");
  });

  let releaseSearch: () => void = () => undefined;
  const searchGate = new Promise<void>((resolve) => {
    releaseSearch = resolve;
  });
  await page.route("**/search?q=query-a", async (route) => {
    await searchGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([remoteSearchBook()]),
    });
  });

  await page.goto("/#/search?q=query-a&filter=all");
  const input = page.locator("#search-input-field");
  await expect(input).toHaveValue("query-a");
  await page.getByRole("button", { name: "搜索私人云端" }).click();
  await expect(page.getByRole("button", { name: "搜索中" })).toBeVisible();

  await input.fill("query-b");
  await expect(page).toHaveURL(/#\/search\?q=query-b$/u);
  await expect(input).toHaveValue("query-b");
  releaseSearch();

  await expect(page.getByText("不应回来的旧结果")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /私人云端结果/u }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "搜索私人云端" }),
  ).toBeEnabled();
});
