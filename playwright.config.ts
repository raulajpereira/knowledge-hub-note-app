import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT || 3100);
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Runs against a production build (`npm run build` first). Set
// E2E_SKIP_SERVER=1 to test an already-running instance instead.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}${basePath}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: process.env.E2E_SKIP_SERVER
    ? undefined
    : {
        command: `npx next start -p ${port} -H 127.0.0.1`,
        env: { KH_UI_CATALOG: 'true' },
        // Not /api/health: it may legitimately answer 503 while a dependency
        // is down, and Playwright treats that as "not ready".
        url: `http://127.0.0.1:${port}${basePath}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
