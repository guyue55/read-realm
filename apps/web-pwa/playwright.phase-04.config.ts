import { defineConfig, devices } from "@playwright/test";

const channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3104",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{
    name: `chromium-${channel}`,
    use: { ...devices["Desktop Chrome"], channel },
  }],
});
