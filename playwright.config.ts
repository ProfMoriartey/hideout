import { defineConfig, devices } from '@playwright/test';

// PW_CHROMIUM: optional path to a Chromium binary, for machines where the
// browser matching @playwright/test is not installed (for example a sandbox
// with Chromium at /opt/pw-browsers/chromium). CI leaves it unset and uses
// the browser installed by `npx playwright install chromium`.
const executablePath = process.env.PW_CHROMIUM;
const launchOptions = executablePath ? { executablePath } : {};

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/hideout/`,
    trace: 'off',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        launchOptions,
      },
    },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], launchOptions },
    },
  ],
  webServer: {
    // Serves the production build (run `npm run build` first) at /hideout/.
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/hideout/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
