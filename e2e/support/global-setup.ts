import type { FullConfig } from '@playwright/test';

import { MODE_ENV_VAR, REUSE_ENV_VAR, e2eMode, e2ePort, mayReuseServer } from './gate';

/**
 * Refuse to run an authoritative gate that could adopt someone else's server.
 *
 * The last line of defence, and it runs before any test: it reads the **resolved**
 * config rather than the intent, so a future edit that sets `reuseExistingServer: true`
 * unconditionally stops the gate instead of quietly weakening it.
 *
 * It also publishes the mode to the workers, which spawn after this and inherit the
 * environment, so a test can state which kind of run it is in.
 */
async function globalSetup(config: FullConfig): Promise<void> {
  const mode = e2eMode();
  const port = e2ePort(mode);
  process.env[MODE_ENV_VAR] = mode;

  const reuseConfigured = config.webServer?.reuseExistingServer ?? false;

  if (!mayReuseServer(mode) && reuseConfigured) {
    throw new Error(
      'E2E gate integrity: this run is authoritative but the web server is configured to ' +
        'reuse an existing one. An adopted server can be serving a stale bundle, which is ' +
        'how a gate passes without exercising the working tree. Fix playwright.config.ts.',
    );
  }

  // One line, so a reader of the log can always tell which kind of run produced it.
  const summary =
    mode === 'authoritative'
      ? `E2E mode: authoritative - Playwright starts its own mock server on :${port} from the current working tree.`
      : `E2E mode: REUSE (${REUSE_ENV_VAR}=1) - talking to whatever answers on :${port}. ` +
        'Fast local loop only; this run is NOT the validation gate and may be testing stale code.';

  console.log(summary);
}

export default globalSetup;
