import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e-auth",
  outputDir: "./output/playwright/phase3-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: "output/playwright/phase3-report", open: "never" }]]
    : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3103",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
});
