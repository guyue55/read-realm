import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "line",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
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
      },
    },
    {
      command: "corepack pnpm dev --port 3100",
      url: "http://127.0.0.1:3100",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: { NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:4100" },
    },
  ],
});
