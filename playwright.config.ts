// The real-browser suite (test/browser/README.md): the production build in Chromium, Firefox and
// WebKit under the production CSP and Trusted Types. `npm run build && npm run test-browser`;
// `npm run test-browser -- --project=webkit` runs one engine.
import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

export default defineConfig({
  testDir: 'test/browser',
  // global-setup starts the app and the fake Keycloak (ephemeral ports) for the whole run.
  globalSetup: './test/browser/global-setup.ts',
  outputDir: 'test-results',
  // One fake Keycloak session and one recorder for the run: tests reset them, so one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'list',
  use: {
    // The servers use a throwaway self-signed certificate for 127.0.0.1.
    ignoreHTTPSErrors: true,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
