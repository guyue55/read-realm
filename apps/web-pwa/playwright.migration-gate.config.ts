import { defineConfig, devices } from "@playwright/test";

const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome";
const gateOrigin = ["http:", "//127.0.0.1:3102"].join("");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "migration-gate.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  reporter: "line",
  use: {
    baseURL: gateOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{
    name: `chromium-${browserChannel}`,
    use: { ...devices["Desktop Chrome"], channel: browserChannel },
  }],
});
