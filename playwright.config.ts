import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: process.env.ROVERAN_REMOTE_TEST_SERVER
    ? undefined
    : {
        command: 'pnpm --filter @roveran/web dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
