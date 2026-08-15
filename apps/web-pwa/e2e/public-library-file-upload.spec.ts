import { expect, test } from "@playwright/test";

const maintenanceKey = "gate-03-fixture-key";

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });

test("bounded TXT queue reports partial results and idempotent replay", async ({
  page,
}) => {
  const prefix = `TASK-0504-B-${Date.now()}`;
  const personalRequests: string[] = [];
  const publicWrites: Array<Record<string, string>> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/books" || url.pathname.startsWith("/books/")) {
      personalRequests.push(url.pathname);
    }
    if (
      request.method() === "POST" &&
      url.pathname === "/public-library/maintenance/files"
    ) {
      publicWrites.push(request.headers());
    }
  });
  await page.addInitScript((token) => {
    localStorage.setItem("reader-share-token", token);
    localStorage.setItem("reader-sync-auto-startup", "false");
  }, maintenanceKey);
  await page.goto("/#/public-library");

  const tasksBefore = await page.evaluate(() =>
    localStorage.getItem("reader-active-sync-tasks"),
  );
  const importButton = page.getByRole("button", { name: "入阁" });
  await expect(importButton).toBeEnabled();
  await expect(importButton).toHaveCSS("min-height", "44px");
  await importButton.click();
  const dialog = page.getByRole("dialog", { name: "入阁" });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "关闭入阁面板" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(importButton).toBeFocused();
  await importButton.click();
  await expect(dialog).toBeVisible();

  const fileInput = page.getByLabel("选择 TXT 文件", { exact: true });
  await fileInput.setInputFiles(
    Array.from({ length: 60 }, (_, index) => ({
      name: `${prefix}-window-${String(index).padStart(2, "0")}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from("第一章\n窗口上界"),
    })),
  );
  await expect(page.locator("[data-public-library-task-list] li")).toHaveCount(
    50,
  );
  await expect(page.getByText("其余 10 项已纳入上方汇总。")).toBeVisible();
  await fileInput.setInputFiles([
    {
      name: `${prefix}-one.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(`第一章\n正文一 ${prefix}`),
    },
    {
      name: `${prefix}-two.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(`第一章\n正文二 ${prefix}`),
    },
    {
      name: `${prefix}-bad.epub`,
      mimeType: "application/epub+zip",
      buffer: Buffer.from("不应入阁"),
    },
  ]);
  await expect(page.locator("[data-public-library-task-list] li")).toHaveCount(
    3,
  );
  await expect(page.getByText("仅支持 TXT 文件")).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: /将创建公共明文副本/,
    })
    .check();
  await page.getByRole("button", { name: "开始入阁" }).click();
  await expect(page.getByText("已入阁 2", { exact: true })).toBeVisible();
  await expect(page.getByText("未入阁 1", { exact: true })).toBeVisible();
  await expect(
    page.getByText("本批已处理完成，请查看每本书的结果。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭入阁面板" }).click();

  await expect(
    page.getByRole("heading", { name: `${prefix}-one` }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: `${prefix}-two` }),
  ).toBeVisible();

  await importButton.click();
  await fileInput.setInputFiles({
    name: `${prefix}-one.txt`,
    mimeType: "text/plain",
    buffer: Buffer.from(`第一章\n正文一 ${prefix}`),
  });
  await page.getByRole("checkbox", { name: /将创建公共明文副本/ }).check();
  await page.getByRole("button", { name: "开始入阁" }).click();
  await expect(page.getByText("已存在 1", { exact: true })).toBeVisible();

  const folderInput = page.getByLabel("选择 TXT 文件夹", { exact: true });
  await expect(folderInput).toBeAttached();
  await folderInput.evaluate((input, uniquePrefix) => {
    const transfer = new DataTransfer();
    const folderFile = new File(
      [`第一章\n文件夹正文 ${uniquePrefix}`],
      "nested.txt",
      { type: "text/plain" },
    );
    Object.defineProperty(folderFile, "webkitRelativePath", {
      configurable: true,
      value: `${uniquePrefix}-folder/经部/nested.txt`,
    });
    transfer.items.add(folderFile);
    Object.defineProperty(input, "files", {
      configurable: true,
      value: transfer.files,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, prefix);
  await expect(
    page.getByText(`${prefix}-folder/经部/nested.txt`),
  ).toBeVisible();
  await page.getByRole("button", { name: "开始入阁" }).click();
  await expect(page.getByText("已入阁 1", { exact: true })).toBeVisible();

  expect(publicWrites).toHaveLength(4);
  for (const headers of publicWrites) {
    expect(headers["x-public-library-maintenance-key"]).toBe(maintenanceKey);
    expect(headers["x-share-token"]).toBeUndefined();
  }
  expect(personalRequests).toEqual([]);
  expect(
    await page.evaluate(() => localStorage.getItem("reader-active-sync-tasks")),
  ).toBe(tasksBefore);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
