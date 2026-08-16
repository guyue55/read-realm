import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;

const publicLibraryMaintenanceFixture = path.resolve(
  __dirname,
  "e2e/fixtures/public-library-maintenance",
);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  testIgnore: [
    "**/personal-book-publication.spec.ts",
    "**/import-stress.spec.ts",
    "**/reader-touch.spec.ts",
    "**/task-0504-public-library-expansion.spec.ts",
    "**/gate-01.spec.ts",
  ],
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "line",
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
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: "4100",
        API_HOST: "127.0.0.1",
        CORS_ORIGIN: "http://127.0.0.1:3100",
        READER_SQLITE_DB_PATH: "../../.tmp/e2e/reader.sqlite",
        READER_BLOB_STORAGE_PATH: "../../.tmp/e2e/blobs",
        READER_PUBLIC_LIBRARY_DB_PATH: "../../.tmp/e2e/public-library.sqlite",
        READER_PUBLIC_LIBRARY_BLOB_STORAGE_PATH:
          "../../.tmp/e2e/public-library-objects",
        READER_PUBLIC_LIBRARY_MAINTENANCE_KEY: "gate-03-fixture-key",
        READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS: JSON.stringify({
          "e2e-maintenance": {
            label: "隔离维护样本",
            path: publicLibraryMaintenanceFixture,
          },
        }),
      },
    },
    {
      command:
        process.env.E2E_PRODUCTION === "1"
          ? "corepack pnpm start --port 3100"
          : "corepack pnpm dev --port 3100",
      url: "http://127.0.0.1:3100",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:4100",
        ...(process.env.E2E_PRODUCTION === "1"
          ? {}
          : { READING_WORLD_DISABLE_DEV_INDICATORS: "1" }),
      },
    },
  ],
});
