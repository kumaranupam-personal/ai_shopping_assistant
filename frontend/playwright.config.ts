import { defineConfig, devices } from "@playwright/test";

// Browser tests run against the production build, with the backend API mocked per test (tests/mock-api.ts).
export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173" },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
  },
});
