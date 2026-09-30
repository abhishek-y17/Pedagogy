// @ts-check
// MANUAL, opt-in: drives the real app in a real browser against the REAL Supabase
// project (config from .env.local). Never part of `npm test`.
//   STAFF_EMAIL=... STAFF_PASSWORD=... npm run test:live
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests-live',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 90000,
  use: { baseURL: 'http://localhost:5501' },
  webServer: {
    command: 'node scripts/build-config.js && npx serve . -l 5501',
    url: 'http://localhost:5501',
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
