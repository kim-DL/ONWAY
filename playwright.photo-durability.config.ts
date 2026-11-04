import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "delivery-photo-durability.spec.ts",
  outputDir: "./output/playwright/photo-durability",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { serviceWorkers: "block", screenshot: "only-on-failure" },
  projects: [
    { name: "android-chromium", use: { ...devices["Pixel 7"] } },
    { name: "iphone-webkit", use: { ...devices["iPhone 13"] } },
  ],
});
