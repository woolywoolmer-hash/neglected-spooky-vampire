import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3001',
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox'],
    },
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run start -- --port 3001',
        url: 'http://localhost:3001',
        reuseExistingServer: !process.env.CI,
        env: { ALLOW_DEMO: 'true', DEMO_DATABASE_PATH: `.data/e2e-${Date.now()}` },
        timeout: 30000,
      },
});
