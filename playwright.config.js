// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // data-freshness.test.js is a plain Node script (no browser, no `test()`
  // blocks) run directly by `npm test` before Playwright — exclude it here so
  // Playwright doesn't also try to load it as a spec file.
  testIgnore: ['**/data-freshness.test.js', '**/build-config.test.js', '**/global-setup.js'],
  globalSetup: require.resolve('./tests/global-setup.js'),
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5500',
    trace: 'on-first-retry',
  },
  webServer: {
    // --empty: tests always run local-only (never touch the real Supabase
    // project); sync tests inject their own config via page.route.
    command: 'node scripts/build-config.js --empty && npx serve . -l 5500',
    url: 'http://localhost:5500',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'ipad', use: { ...devices['iPad Pro 11'] } },
  ],
});
