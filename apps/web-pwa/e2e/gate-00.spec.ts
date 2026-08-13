import { expect, test } from "@playwright/test";

test("EXP-08 validator qualification uses one observable target", async ({ page }) => {
  await page.goto("/#/library");
  const target = page.getByRole("heading", { name: "书架还是空的" });
  const targetCount = await target.count();
  console.log(`QUALIFICATION_TARGET_COUNT=${targetCount}`);
  expect(targetCount).toBe(1);
  await expect(target).toBeVisible();
  await expect(page.getByText("内容优先保存在本机", { exact: false })).toBeVisible();
});

test("EXP-12 validator qualification waits for one stable observable target", async ({ page }) => {
  await page.goto("/#/library");
  const target = page.getByRole("heading", { name: "书架还是空的" });
  await expect(target).toBeVisible({ timeout: 15_000 });
  const targetCount = await target.count();
  console.log(`QUALIFICATION_TARGET_COUNT=${targetCount}`);
  expect(targetCount).toBe(1);
  await expect(page.getByText("内容优先保存在本机", { exact: false })).toBeVisible();
});
