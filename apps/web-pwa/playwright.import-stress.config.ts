import { defineConfig, devices } from "@playwright/test";

const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "import-stress.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 600_000,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: `chromium-${browserChannel}`,
      use: {
        ...devices["Desktop Chrome"],
        channel: browserChannel,
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
        READER_SQLITE_DB_PATH: "../../.tmp/e2e/reader.sqlite",
        READER_BLOB_STORAGE_PATH: "../../.tmp/e2e/blobs",
        READER_PUBLIC_LIBRARY_DB_PATH: "../../.tmp/e2e/public-library.sqlite",
        READER_PUBLIC_LIBRARY_BLOB_STORAGE_PATH:
          "../../.tmp/e2e/public-library-objects",
        READER_PUBLIC_LIBRARY_MAINTENANCE_KEY: "gate-03-fixture-key",
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
