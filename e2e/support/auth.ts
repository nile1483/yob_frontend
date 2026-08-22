import { expect, type Page } from '@playwright/test';

import { MOCK_CREDENTIALS } from '../../src/mock-api/fixtures/session.fixture';

/**
 * Mock sign-in for tests whose subject is something other than the sign-in page.
 *
 * Deliberately drives the real form rather than reaching past it. There is no
 * back-door session injection here: a helper that faked authentication would let the
 * login flow rot silently, and every catalog test would stop proving that the guard,
 * the session store and the CSRF token actually work together.
 *
 * The full sign-in journey is still tested in its own right in `login.spec.ts`.
 *
 * Credentials come from the mock fixture - `.invalid` domain, useless anywhere real.
 * Real backend credentials never appear in this repository.
 */
export async function signInAsMockBuyer(
  page: Page,
  options: { goTo?: string; expectUrl?: boolean } = {},
): Promise<void> {
  const destination = options.goTo;
  const loginUrl = destination
    ? `/login?returnUrl=${encodeURIComponent(destination)}`
    : '/login';

  await page.goto(loginUrl);
  await page.getByTestId('login-username').fill(MOCK_CREDENTIALS.username);
  await page.getByTestId('login-password').fill(MOCK_CREDENTIALS.password);
  await page.getByTestId('login-submit').click();

  await expectLanded(page, destination, options.expectUrl);
}

/**
 * Sign in on a page load that carries mock query flags, then continue to `goTo`.
 *
 * Flags such as `?mockScenario=empty` are read once, when the mock services are
 * constructed on document load - so they must be present on the load that signs in.
 * That also means the destination has to be reached *client-side*: a later
 * `page.goto` would be a fresh document, restarting the app, dropping the mock
 * session and losing the flags. Handing the destination to the sign-in page as a
 * `returnUrl` keeps the whole journey inside one page load.
 */
export async function signInWithMockFlags(
  page: Page,
  flags: string,
  options: { goTo?: string; expectUrl?: boolean } = {},
): Promise<void> {
  const destination = options.goTo;
  const query = destination
    ? `${flags}&returnUrl=${encodeURIComponent(destination)}`
    : flags;

  await page.goto(`/login?${query}`);
  await page.getByTestId('login-username').fill(MOCK_CREDENTIALS.username);
  await page.getByTestId('login-password').fill(MOCK_CREDENTIALS.password);
  await page.getByTestId('login-submit').click();

  await expectLanded(page, destination, options.expectUrl);
}

/**
 * Wait for sign-in to land, comparing URLs by meaning rather than by spelling.
 *
 * Two things make an exact string comparison wrong here. A destination carrying a JSON
 * query value comes back re-encoded - Angular leaves `:` and `,` literal where
 * `encodeURIComponent` escapes them - and the two spell the same URL. And a page is
 * entitled to *correct* its own query on arrival: a category drops a filter selection it
 * cannot honour, so the landing URL is deliberately not the one requested.
 *
 * Callers in the second situation pass `expectUrl: false` and assert the corrected state
 * themselves, which is the thing actually worth checking.
 */
async function expectLanded(
  page: Page,
  destination: string | undefined,
  expectUrl = true,
): Promise<void> {
  if (!expectUrl) {
    await expect(page).not.toHaveURL(/\/login/);
    return;
  }

  const expected = new URL(destination ?? '/catalog', 'http://localhost');
  await expect
    .poll(() => {
      const actual = new URL(page.url());
      if (actual.pathname !== expected.pathname) {
        return false;
      }
      for (const [key, value] of expected.searchParams) {
        if (actual.searchParams.get(key) !== value) {
          return false;
        }
      }
      return true;
    })
    .toBe(true);
}
