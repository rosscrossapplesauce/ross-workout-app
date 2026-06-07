const { defineConfig, devices } = require("@playwright/test");

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:4173";

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "mobile-workout",
      use: {
        ...devices["iPhone 12"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 }
      }
    }
  ]
});
