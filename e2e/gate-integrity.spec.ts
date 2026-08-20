import { expect, test } from '@playwright/test';

import {
  DEV_PORT,
  GATE_PORT,
  MODE_ENV_VAR,
  e2eMode,
  e2ePort,
  mayReuseServer,
} from './support/gate';

/**
 * The gate proves it is testing this working tree.
 *
 * ## What went wrong, and why a test exists for it
 *
 * During Phase 23B-5U-FE a `ng serve --configuration mock` that had been up for hours
 * stopped rebuilding. `reuseExistingServer` adopted it, and the suite reported **green
 * against a bundle that predated the change**. The tests were fine; the thing they were
 * pointed at was not. Nothing in the run said so.
 *
 * So the invariant worth pinning is not "the app works" - every other spec does that -
 * but "this run could not have adopted a server". These assertions read the **resolved**
 * Playwright config, so they fail if a future edit re-enables reuse for the gate, whether
 * deliberately or by copying a snippet.
 */
test.describe('E2E gate integrity', () => {
  test('an authoritative run starts its own server and never adopts one', async ({}, testInfo) => {
    test.skip(e2eMode() !== 'authoritative', 'reuse loop - covered by its own test below');

    const webServer = testInfo.config.webServer;

    // The whole guarantee in one line: Playwright must start the server, so it is built
    // from the tree under test. With this false, a stale server cannot be picked up -
    // an occupied port fails the run instead, which is the recoverable outcome.
    expect(webServer?.reuseExistingServer).toBe(false);

    // On its own port, so an ordinary development server is neither blocked nor visible.
    expect(webServer?.url).toContain(String(GATE_PORT));
    expect(webServer?.url).not.toContain(String(DEV_PORT));
    expect(process.env[MODE_ENV_VAR]).toBe('authoritative');
  });

  test('a reuse run is labelled as one, so it cannot be mistaken for the gate', async ({}, testInfo) => {
    test.skip(e2eMode() !== 'reuse', 'authoritative run - covered by the test above');

    // Reuse is legitimate as a fast local loop. What it must never do is look like a
    // gate: it says so in the environment, in the log banner, and here.
    expect(testInfo.config.webServer?.reuseExistingServer).toBe(true);
    expect(testInfo.config.webServer?.url).toContain(String(DEV_PORT));
    expect(process.env[MODE_ENV_VAR]).toBe('reuse');
  });

  test('the mode is opt-in to reuse, never opt-out of the gate', () => {
    // A missing, empty or misspelled variable must leave the run authoritative: failing
    // towards "start a fresh server" is recoverable, failing towards "adopt whatever is
    // there" is the bug this whole file exists for.
    expect(e2eMode({})).toBe('authoritative');
    expect(e2eMode({ E2E_REUSE_SERVER: '' })).toBe('authoritative');
    expect(e2eMode({ E2E_REUSE_SERVER: '0' })).toBe('authoritative');
    expect(e2eMode({ E2E_REUSE_SERVER: 'true' })).toBe('authoritative');
    expect(e2eMode({ E2E_REUSE_SERVER: '1' })).toBe('reuse');

    expect(mayReuseServer('authoritative')).toBe(false);
    expect(mayReuseServer('reuse')).toBe(true);

    // The ports are distinct on purpose; collapsing them would let a development server
    // answer a gate run again.
    expect(e2ePort('authoritative')).toBe(GATE_PORT);
    expect(e2ePort('reuse')).toBe(DEV_PORT);
    expect(GATE_PORT).not.toBe(DEV_PORT);
  });

  test('the server under test is answering the URL this run configured', async ({
    page,
  }, testInfo) => {
    // Cheap end-to-end confirmation that the base URL the config chose is the one the
    // browser actually reached - a misconfigured port would otherwise surface as a
    // hundred confusing navigation failures instead of one clear statement.
    const response = await page.goto('/login');

    expect(response?.status()).toBe(200);
    expect(page.url()).toContain(String(e2ePort(e2eMode())));
    expect(testInfo.config.webServer?.url).toContain(String(e2ePort(e2eMode())));
  });
});
