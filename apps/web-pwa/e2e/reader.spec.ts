import { expect, test } from "@playwright/test";
import path from "node:path";

test("首次导入、书签与续读", async ({ page }) => {
  await page.goto("/#/library");
  await expect(page.getByRole("heading", { name: "书架还是空的" })).toBeVisible();

  await page.getByRole("button", { name: "导入第一本书" }).click();
  await page.getByLabel("选择 TXT 或 EPUB 文件").setInputFiles(
    path.join(process.cwd(), "e2e/fixtures/short-novel.txt"),
  );

  await expect(page.getByRole("heading", { name: "解析预览" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "加入书架" }).click();
  await expect(page.getByText("short-novel", { exact: true })).toBeVisible();

  await page.getByText("short-novel", { exact: true }).click();
  await expect(page.locator(".reader-content:visible")).toContainText("清晨，林舟");
  await page.locator('button[aria-label="添加书签"]:visible').click();
  await page.reload();
  await expect(page.locator(".reader-content:visible")).toContainText("清晨，林舟");
});
