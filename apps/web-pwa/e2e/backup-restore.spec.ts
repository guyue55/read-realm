import { expect, test, type Download, type Page } from "@playwright/test";
import path from "node:path";

test.setTimeout(90_000);

async function readStore<T>(page: Page, storeName: string): Promise<T[]> {
  return page.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB["open"]("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<T[]>((resolve, reject) => {
        const transaction = database.transaction(name, "readonly");
        const request = transaction.objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, storeName);
}

async function readDownload(download: Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("portable backup rejects tampering, previews without writes, then restores with readback", async ({
  browser,
  page,
}) => {
  await page.goto("/#/library");
  await page.getByRole("button", { name: "导入第一本书" }).click();
  await page.getByLabel("选择 TXT 或 EPUB 文件").setInputFiles(
    path.join(process.cwd(), "e2e/fixtures/short-novel.txt"),
  );
  await expect(page.getByRole("heading", { name: "解析预览" })).toBeVisible();
  await page.getByRole("button", { name: "加入书架" }).click();
  await page.getByText("short-novel", { exact: true }).click();
  await page.locator('button[aria-label="添加书签"]:visible').click();
  await page.locator('button[aria-label="下一章"]:visible').click();

  await page.goto("/#/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载完整备份包" }).click();
  const download = await downloadPromise;
  const backupBuffer = await readDownload(download);
  const backup = JSON.parse(backupBuffer.toString("utf8"));
  expect(backup).toMatchObject({
    kind: "read-realm-portable-backup",
    packageVersion: 1,
    manifest: {
      algorithm: "SHA-256",
      entryCount: 1,
      entries: [
        {
          path: "data/local-snapshot-v1.json",
          byteLength: expect.any(Number),
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      ],
    },
  });

  const restoreContext = await browser.newContext();
  const restorePage = await restoreContext.newPage();
  try {
    await restorePage.goto("/#/settings");
    const tampered = structuredClone(backup);
    tampered.entries["data/local-snapshot-v1.json"] = tampered.entries[
      "data/local-snapshot-v1.json"
    ].replace("清晨，林舟", "篡改内容");
    await restorePage.getByLabel("选择阅读备份文件").setInputFiles({
      name: "tampered-portable-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(`${JSON.stringify(tampered)}\n`),
    });
    await expect(
      restorePage.getByText(
        "备份包内容与校验清单不一致，文件可能不完整或已被修改。",
        { exact: true },
      ),
    ).toBeVisible();
    expect(await readStore(restorePage, "books")).toHaveLength(0);
    expect(await readStore(restorePage, "chapters")).toHaveLength(0);

    await restorePage.getByLabel("选择阅读备份文件").setInputFiles({
      name: download.suggestedFilename(),
      mimeType: "application/json",
      buffer: backupBuffer,
    });
    const preview = restorePage.getByLabel("备份恢复预览");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("书籍1");
    await expect(preview).toContainText("章节2");
    await expect(preview).toContainText("进度1");
    await expect(preview).toContainText("书签1");
    await expect(restorePage.getByRole("status")).toContainText(
      "当前尚未写入书架",
    );
    expect(await readStore(restorePage, "books")).toHaveLength(0);
    expect(await readStore(restorePage, "chapters")).toHaveLength(0);
    expect(await readStore(restorePage, "progress")).toHaveLength(0);
    expect(await readStore(restorePage, "bookmarks")).toHaveLength(0);

    await restorePage
      .getByRole("button", { name: "确认恢复到空书架" })
      .click();
    await expect(restorePage.getByRole("status")).toContainText(
      "恢复完成：1 本书、2 章、1 条进度",
    );
    expect(await readStore(restorePage, "books")).toHaveLength(1);
    expect(await readStore(restorePage, "chapters")).toHaveLength(2);
    expect(await readStore(restorePage, "progress")).toHaveLength(1);
    expect(await readStore(restorePage, "bookmarks")).toHaveLength(1);
  } finally {
    await restoreContext.close();
  }
});
