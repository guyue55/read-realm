import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
const isolatedRoot = mkdtempSync(join(tmpdir(), "reading-world-scan-e2e-"));
const maintenanceRoot = resolve(
  process.cwd(),
  "e2e/fixtures/public-library-maintenance",
);
process.env.READING_WORLD_SCAN_E2E_TEMP_ROOT = isolatedRoot;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "public-library-server-scan.spec.ts",
  globalTeardown: "./e2e/public-library-server-scan.teardown.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: browserChannel ? `chromium-${browserChannel}` : "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(browserChannel ? { channel: browserChannel } : {}),
      },
    },
  ],
  webServer: [
    {
      command: "corepack pnpm --dir ../.. --filter api dev",
      url: "http://127.0.0.1:4100/ai/status",
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        PORT: "4100",
        API_HOST: "127.0.0.1",
        CORS_ORIGIN: "http://127.0.0.1:3100",
        READER_SQLITE_DB_PATH: join(isolatedRoot, "personal.sqlite"),
        READER_BLOB_STORAGE_PATH: join(isolatedRoot, "personal-blobs"),
        READER_PUBLIC_LIBRARY_DB_PATH: join(isolatedRoot, "public.sqlite"),
        READER_PUBLIC_LIBRARY_BLOB_STORAGE_PATH: join(
          isolatedRoot,
          "public-objects",
        ),
        READER_PUBLIC_LIBRARY_MAINTENANCE_KEY: "gate-03-fixture-key",
        READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS: JSON.stringify({
          fixture: { label: "隔离维护样本", path: maintenanceRoot },
        }),
      },
    },
    {
      command: "corepack pnpm dev --port 3100",
      url: "http://127.0.0.1:3100",
      timeout: 120_000,
      reuseExistingServer: false,
      env: { NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:4100" },
    },
  ],
});
