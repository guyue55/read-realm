import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

type CapacityManifest = {
  profile: string;
  fixtures: Array<{
    kind: string;
    filename: string;
    actualBytes: number;
    expectedChapterCount: number;
  }>;
};

type ImportTaskProbe = {
  state?: string;
  errorMessage?: string;
  receivedChapters?: number;
  totalChapters?: number | null;
  retainedChapters: number;
};

const fixtureRoot = path.resolve(process.cwd(), "../../.tmp/import-capacity/full");
const manifest = JSON.parse(
  readFileSync(path.join(fixtureRoot, "manifest.json"), "utf8"),
) as CapacityManifest;

async function readImportTask(page: Page): Promise<ImportTaskProbe | null> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ReaderDatabase");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<ImportTaskProbe | null>((resolve, reject) => {
        const transaction = database.transaction("importTasks", "readonly");
        const request = transaction.objectStore("importTasks").getAll();
        request.onsuccess = () => {
          const tasks = request.result as Array<{
            chapters: unknown[];
            lifecycle?: {
              state: string;
              error?: { message: string };
              progress: { receivedChapters: number; totalChapters: number | null };
            };
          }>;
          const task = tasks[0];
          resolve(task ? {
            state: task.lifecycle?.state,
            errorMessage: task.lifecycle?.error?.message,
            receivedChapters: task.lifecycle?.progress.receivedChapters,
            totalChapters: task.lifecycle?.progress.totalChapters,
            retainedChapters: task.chapters.length,
          } : null);
        };
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

async function startHeartbeat(page: Page) {
  await page.evaluate(() => {
    const target = window as typeof window & { __importHeartbeats?: number };
    target.__importHeartbeats = 0;
    window.setInterval(() => {
      target.__importHeartbeats = (target.__importHeartbeats ?? 0) + 1;
    }, 50);
  });
}

async function heartbeat(page: Page) {
  return page.evaluate(() =>
    (window as typeof window & { __importHeartbeats?: number }).__importHeartbeats ?? 0,
  );
}

for (const fixture of manifest.fixtures) {
  test(`${fixture.kind} stays responsive and reaches durable preview`, async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);
    await page.goto("/#/import");
    await startHeartbeat(page);
    const before = await heartbeat(page);
    await page.getByLabel("选择 TXT 或 EPUB 文件").setInputFiles(
      path.join(fixtureRoot, fixture.filename),
    );

    const outcome = await Promise.race([
      page.getByRole("heading", { name: "解析预览" }).waitFor({
        state: "visible",
        timeout: 8 * 60 * 1000,
      }).then(() => "preview" as const),
      page.getByRole("status").filter({ hasText: "草稿已保留" }).waitFor({
        state: "visible",
        timeout: 8 * 60 * 1000,
      }).then(() => "failed" as const),
    ]);
    if (outcome === "failed") {
      const failedTask = await readImportTask(page);
      throw new Error(`IMPORT_STRESS_FAILED: ${failedTask?.errorMessage ?? "unknown error"}`);
    }
    const after = await heartbeat(page);
    expect(after - before).toBeGreaterThan(5);

    const task = await readImportTask(page);
    expect(task).toMatchObject({
      state: "preview",
      receivedChapters: fixture.expectedChapterCount,
      totalChapters: fixture.expectedChapterCount,
      retainedChapters: fixture.expectedChapterCount,
    });
  });
}
