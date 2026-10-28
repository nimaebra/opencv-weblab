import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  workers: 2,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: process.env.ROVERAN_REMOTE_TEST_SERVER
    ? undefined
    : [
        {
          command: 'pnpm --filter @roveran/web dev',
          url: 'http://localhost:5173',
          reuseExistingServer: !process.env.CI,
        },
        {
          command: 'node scripts/serve-test-build.mjs',
          url: 'http://localhost:4173',
          reuseExistingServer: false,
        },
        {
          command: 'node scripts/serve-test-build.mjs --nested',
          url: 'http://127.0.0.1:4174/lab/',
          reuseExistingServer: false,
          timeout: 120000,
        },
      ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
