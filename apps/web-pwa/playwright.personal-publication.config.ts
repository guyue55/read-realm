import { defineConfig, devices } from "@playwright/test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
const isolatedRoot =
  process.env.READING_WORLD_PERSONAL_PUBLICATION_E2E_TEMP_ROOT ??
  mkdtempSync(join(tmpdir(), "reading-world-personal-publication-e2e-"));
process.env.READING_WORLD_PERSONAL_PUBLICATION_E2E_TEMP_ROOT = isolatedRoot;
mkdirSync(join(isolatedRoot, "personal-blobs"), { recursive: true });
mkdirSync(join(isolatedRoot, "public-objects"), { recursive: true });

export default defineConfig({
  testDir: "./e2e",
  testMatch: "personal-book-publication.spec.ts",
  globalTeardown: "./e2e/personal-book-publication.teardown.ts",
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
        READER_PUBLIC_LIBRARY_MAINTENANCE_KEY: "personal-publication-key",
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
