import { defineConfig, devices } from '@playwright/test';

import { baseUrl, e2eMode, mayReuseServer } from './e2e/support/gate';

/**
 * Playwright configuration for yob-frontend.
 *
 * Chromium only, at three fixed viewports. Every spec runs at all three, so a layout
 * that breaks on a phone fails the suite rather than waiting to be noticed.
 *
 * The gate starts its own server - `npm run e2e` needs nothing running first, and
 * deliberately refuses to adopt anything that is already running.
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
 *
 * ## The server is never adopted by an authoritative run
 *
 * `npm run e2e` is the validation gate and starts its own server on its own port (4301),
 * every time, from the current working tree. It does not matter what is already running:
 * a stale `ng serve` that stopped rebuilding cannot be picked up, because nothing is
 * picked up. That is deliberate - Phase 23B-5U-FE lost a full suite to exactly that,
 * with a long-lived server answering the URL check and the run reporting green against a
 * pre-change bundle.
 *
 * `npm run e2e:dev` is the fast local loop: it reuses whatever is on the development
 * port and is explicitly not a gate. See `e2e/support/gate.ts`.
 */
const MODE = e2eMode();
const BASE_URL = baseUrl(MODE);

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

  /* Refuses an authoritative run that could adopt a server; publishes the mode. */
  globalSetup: './e2e/support/global-setup.ts',

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
    /*
     * The gate runs its own server on its own port, so a development server on 4300 is
     * neither blocked by a gate run nor reachable from one. The reuse loop points at
     * that development server instead.
     */
    command: mayReuseServer(MODE) ? 'npm run start:mock' : 'npm run e2e:server',
    url: BASE_URL,
    /*
     * False for every authoritative run - including local ones, which is the change.
     * Playwright then either starts a fresh server or fails because the port is busy;
     * a refusal is recoverable, a false green is not.
     */
    reuseExistingServer: mayReuseServer(MODE),
    /* A cold Angular dev-server build is slow the first time. */
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
