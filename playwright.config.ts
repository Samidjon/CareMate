import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 375, height: 812 },
    locale: "uz-UZ",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node e2e/support/start-servers.mjs",
    // :3101 starts last, so when it answers everything is ready.
    url: "http://localhost:3101",
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
