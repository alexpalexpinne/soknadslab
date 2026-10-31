import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/fast/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: true,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 5000 },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "reports/playwright.json" }],
    ["./scripts/quality-reporter.ts"],
    // CI merges the per-browser blobs into the single published report.
    ...(process.env.CI ? [["blob"] as const] : []),
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run build && npm run test:serve",
    url: "http://127.0.0.1:4173/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
