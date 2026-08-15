import { defineConfig, devices } from "@playwright/test";

const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome";

export default defineConfig({
  outputDir:
    process.env.READING_WORLD_TASK_0504_OUTPUT_DIR ??
    "test-results/task-0504-expansion",
  testDir: "./e2e",
  testMatch: "task-0504-public-library-expansion.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
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
});
