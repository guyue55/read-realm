import { defineConfig, devices } from "@playwright/test";

const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "gate-00.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3102",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: `chromium-${browserChannel}`,
      use: { ...devices["Desktop Chrome"], channel: browserChannel },
    },
  ],
});
