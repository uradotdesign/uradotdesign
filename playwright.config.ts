import { defineConfig, devices } from "@playwright/test";

// Run against an isolated preview; never submit synthetic production inquiries.
if (!process.env.QA_BASE_URL) throw new Error("Set QA_BASE_URL to the isolated preview URL.");
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 120000,
  reporter: "list",
  outputDir: ".qa-results/browser",
  use: { baseURL: process.env.QA_BASE_URL, reducedMotion: "reduce", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
});
