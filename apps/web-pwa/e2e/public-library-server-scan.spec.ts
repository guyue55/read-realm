import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const maintenanceKey = "gate-03-fixture-key";
const fixtureRoot = resolve(
  process.cwd(),
  "e2e/fixtures/public-library-maintenance",
);

async function sourceSnapshot() {
  const paths = [
    resolve(fixtureRoot, "古籍/经部/scan-one.txt"),
    resolve(fixtureRoot, "古籍/史部/scan-two.txt"),
  ];
  return Promise.all(
    paths.map(async (path) => {
      const [bytes, metadata] = await Promise.all([readFile(path), stat(path)]);
      return {
        hash: createHash("sha256").update(bytes).digest("hex"),
        mode: metadata.mode,
        mtimeMs: metadata.mtimeMs,
      };
    }),
  );
}

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });

test("allowlisted server scan is replayable and never exposes the source path", async ({
  page,
}) => {
  const before = await sourceSnapshot();
  const personalRequests: string[] = [];
  const scanRequests: Array<{
    headers: Record<string, string>;
    body?: unknown;
  }> = [];
  const scanResponseBodies: Array<Promise<string>> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/books" || url.pathname.startsWith("/books/")) {
      personalRequests.push(url.pathname);
    }
    if (url.pathname.includes("/public-library/maintenance/scan")) {
      scanRequests.push({
        headers: request.headers(),
        body: request.method() === "POST" ? request.postDataJSON() : undefined,
      });
    }
  });
  page.on("response", (response) => {
    if (response.url().includes("/public-library/maintenance/scan")) {
      scanResponseBodies.push(response.text());
    }
  });
  await page.addInitScript((token) => {
    localStorage.setItem("reader-share-token", token);
    localStorage.setItem("reader-sync-auto-startup", "false");
  }, maintenanceKey);
  await page.goto("/#/public-library");
  await page.getByRole("button", { name: "入阁" }).click();
  const dialog = page.getByRole("dialog", { name: "入阁" });
  await expect(dialog.getByText("服务端目录", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("option", { name: "隔离维护样本" }),
  ).toBeAttached();
  await dialog.getByRole("checkbox", { name: /将创建公共明文副本/ }).check();
  await dialog.getByRole("button", { name: "扫描并入阁" }).click();
  await expect(dialog.getByText("维护目录扫描完成。")).toBeVisible();
  await expect(dialog.getByText(/新入阁 2/)).toBeVisible();
  const closeButton = dialog.getByRole("button", { name: "关闭入阁面板" });
  const closeBox = await closeButton.boundingBox();
  expect(closeBox).not.toBeNull();
  expect(closeBox!.y).toBeGreaterThanOrEqual(0);
  expect(closeBox!.y + closeBox!.height).toBeLessThanOrEqual(844);
  expect(closeBox!.width).toBeGreaterThanOrEqual(44);
  expect(closeBox!.height).toBeGreaterThanOrEqual(44);
  await closeButton.click();
  await expect(page.getByRole("heading", { name: "scan-one" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "scan-two" })).toBeVisible();

  await page.getByRole("button", { name: "入阁" }).click();
  await dialog.getByRole("checkbox", { name: /将创建公共明文副本/ }).check();
  await dialog.getByRole("button", { name: "扫描并入阁" }).click();
  await expect(dialog.getByText("维护目录扫描完成。")).toBeVisible();
  await expect(dialog.getByText(/新入阁 0 · 已存在 2/)).toBeVisible();

  expect(scanRequests.length).toBeGreaterThanOrEqual(5);
  for (const request of scanRequests) {
    expect(request.headers["x-public-library-maintenance-key"]).toBe(
      maintenanceKey,
    );
    expect(request.headers["x-share-token"]).toBeUndefined();
    expect(JSON.stringify(request)).not.toContain(fixtureRoot);
  }
  const scanResponses = await Promise.all(scanResponseBodies);
  expect(scanResponses.length).toBeGreaterThanOrEqual(5);
  expect(scanResponses.join("\n")).not.toContain(fixtureRoot);
  expect(personalRequests).toEqual([]);
  expect(await sourceSnapshot()).toEqual(before);
  await page.setViewportSize({ width: 340, height: 844 });
  const narrowCloseBox = await dialog
    .getByRole("button", { name: "关闭入阁面板" })
    .boundingBox();
  const narrowScanBox = await dialog
    .getByRole("button", { name: "扫描并入阁" })
    .boundingBox();
  expect(narrowCloseBox).not.toBeNull();
  expect(narrowCloseBox!.y).toBeGreaterThanOrEqual(0);
  expect(narrowCloseBox!.x + narrowCloseBox!.width).toBeLessThanOrEqual(340);
  expect(narrowCloseBox!.width).toBeGreaterThanOrEqual(44);
  expect(narrowCloseBox!.height).toBeGreaterThanOrEqual(44);
  expect(narrowScanBox).not.toBeNull();
  expect(narrowScanBox!.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(340);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "入阁" })).toBeFocused();
});
