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
export async function signInAsMockBuyer(page: Page, options: { goTo?: string } = {}): Promise<void> {
  const destination = options.goTo;
  const loginUrl = destination
    ? `/login?returnUrl=${encodeURIComponent(destination)}`
    : '/login';

  await page.goto(loginUrl);
  await page.getByTestId('login-username').fill(MOCK_CREDENTIALS.username);
  await page.getByTestId('login-password').fill(MOCK_CREDENTIALS.password);
  await page.getByTestId('login-submit').click();

  await expect(page).toHaveURL(destination ?? '/catalog');
}

/**
 * Sign in, then land on a URL that carries mock query flags.
 *
 * Needed because flags such as `?mockScenario=empty` are read once when the mock
 * services are constructed - which happens on document load. Signing in first and
 * then `goto`-ing the flagged URL would restart the app and drop the mock session, so
 * the flags have to be present on the page load that signs in.
 */
export async function signInWithMockFlags(page: Page, flags: string): Promise<void> {
  await page.goto(`/login?${flags}`);
  await page.getByTestId('login-username').fill(MOCK_CREDENTIALS.username);
  await page.getByTestId('login-password').fill(MOCK_CREDENTIALS.password);
  await page.getByTestId('login-submit').click();

  await expect(page).toHaveURL('/catalog');
}
