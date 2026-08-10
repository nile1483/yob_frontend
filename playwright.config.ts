import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for yob-frontend.
 *
 * Chromium only, at three fixed viewports. Every spec runs at all three, so a layout
 * that breaks on a phone fails the suite rather than waiting to be noticed.
 *
 * The dev server starts itself - `npm run e2e` needs nothing running first.
 */

/**
 * E2E runs against the in-browser mock API, on its own port.
 *
 * Two reasons, both about determinism. The session must resolve the same way every
 * run, and against the real edge that depends on a Frappe bench being up; when it is
 * not, session restore fails and the app lands on `/session-unavailable` rather than
 * the sign-in page - correct behaviour, but not what a guest-redirect test is asking.
 * The separate port also means a hand-started `ng serve` on 4200, pointed at the real
 * backend, can never be silently reused by `reuseExistingServer`.
 *
 * Real-backend verification is `scripts/live-smoke.mjs`, which is a different job.
 */
const PORT = 4300;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Viewport targets. Testing sizes only - the application has no breakpoint
 * configuration and must not grow one.
 */
const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
} as const;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,

  /* A stray `test.only` must fail CI rather than quietly skipping the suite. */
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,

  /* `open: 'never'` matters in WSL, where launching a report browser hangs. */
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium-mobile',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS.mobile },
    },
    {
      name: 'chromium-tablet',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS.tablet },
    },
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS.desktop },
    },
  ],

  webServer: {
    command: 'npm run start:mock',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    /* A cold Angular dev-server build is slow the first time. */
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
