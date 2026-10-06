import { defineConfig, devices } from "@playwright/test";

// Browser tests run against the production build, with the backend API mocked per test (tests/mock-api.ts).
export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  reporter: "list",
  // The app lives under /saathi/, so tests open "./" for the chat and "./about/" for the about page.
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173/saathi/" },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173/saathi/",
    reuseExistingServer: false,
  },
});
