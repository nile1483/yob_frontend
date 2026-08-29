import { expect, test, type Page } from '@playwright/test';

import { MOCK_CREDENTIALS } from '../src/mock-api/fixtures/session.fixture';
import { expectNoHorizontalOverflow, expectShellUsable } from './support/layout';
import { goToAccountRoute } from './support/header';

/**
 * The first real end-to-end user journey: guest -> sign in -> secure shell.
 *
 * Runs against the mock API, so it is deterministic and needs no Frappe bench. The
 * credentials come from the mock fixture - obviously fake, `.invalid` domain, and
 * useless against any real system. Real backend credentials never appear in this
 * repository; the live authentication lifecycle is proven separately by
 * `scripts/live-smoke.mjs`, which reads its password from the environment.
 */

async function fillCredentials(
  page: Page,
  username: string = MOCK_CREDENTIALS.username,
  password: string = MOCK_CREDENTIALS.password,
): Promise<void> {
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
}

test.describe('sign-in page', () => {
  test('a guest can open it', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByTestId('public-shell')).toBeVisible();
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('uses native inputs with the right autofill hints', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByTestId('login-username')).toHaveAttribute('autocomplete', 'username');
    await expect(page.getByTestId('login-password')).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
    await expect(page.getByTestId('login-password')).toHaveAttribute('type', 'password');
  });

  test('requires both fields', async ({ page }) => {
    await page.goto('/login');

    await page.getByTestId('login-submit').click();

    await expect(page.getByText('Enter your username.')).toBeVisible();
    await expect(page.getByText('Enter your password.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows a safe message for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await fillCredentials(page, MOCK_CREDENTIALS.username, 'definitely-wrong');

    await page.getByTestId('login-submit').click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('The username or password is incorrect.');
    // Nothing from the backend reaches the screen.
    await expect(alert).not.toContainText('frappe');
    await expect(alert).not.toContainText('Traceback');
    await expect(page).toHaveURL(/\/login/);
  });

  test('signs in with valid credentials and lands on the storefront home page', async ({ page }) => {
    await page.goto('/login');
    await fillCredentials(page);

    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL('/home');
    await expect(page.getByTestId('secure-shell')).toBeVisible();
  });

  test('has no horizontal overflow at this viewport', async ({ page }) => {
    await page.goto('/login');
    await expectNoHorizontalOverflow(page);
    await expectShellUsable(page);
  });

  test('still fits when a validation error is showing', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-submit').click();
    await expect(page.getByText('Enter your username.')).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });
});

test.describe('return URL', () => {
  test('a guest sent from /account returns there after signing in', async ({ page }) => {
    await page.goto('/account');

    await expect(page).toHaveURL('/login?returnUrl=%2Faccount');

    await fillCredentials(page);
    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL('/account');
    await expect(page.getByTestId('secure-shell')).toBeVisible();
  });

  test('an external return URL is discarded in favour of the safe default', async ({ page }) => {
    await page.goto('/login?returnUrl=https://phish.example/steal');
    await fillCredentials(page);

    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL('/home');
    expect(page.url()).not.toContain('phish.example');
  });

  test('a protocol-relative return URL is discarded too', async ({ page }) => {
    await page.goto('/login?returnUrl=%2F%2Fphish.example');
    await fillCredentials(page);

    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL('/home');
  });
});

test.describe('already authenticated', () => {
  /**
   * Reached with the Back button rather than `page.goto`, deliberately.
   *
   * `goto` is a full document load, which restarts the application - and the mock
   * server keeps its session in memory, so it would have forgotten the user and the
   * test would prove nothing about the page. Back is a client-side popstate the
   * router handles with the session intact, and it is the way a real user lands back
   * on a sign-in page anyway.
   */
  test('going back to the sign-in page does not show the form again', async ({ page }) => {
    await page.goto('/login');
    await fillCredentials(page);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL('/home');

    await page.goBack();

    await expect(page).toHaveURL('/home');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0);
    await expect(page.getByTestId('secure-shell')).toBeVisible();
  });

  test('a valid return URL still wins over the default', async ({ page }) => {
    await page.goto('/login?returnUrl=%2Faccount');
    await fillCredentials(page);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL('/account');

    // Back returns to /login?returnUrl=/account, which must forward to /account.
    await page.goBack();

    await expect(page).toHaveURL('/account');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0);
  });
});

test.describe('pending state', () => {
  // `?mockLatency` stalls the in-memory mock so the pending window is observable.
  test('a second submit is blocked while the first is in flight', async ({ page }) => {
    await page.goto('/login?mockLatency=1500');
    await fillCredentials(page);

    const submit = page.getByTestId('login-submit');
    await submit.click();

    // Signal Forms holds `submitting`, which disables the button and marks it busy.
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute('aria-busy', 'true');

    // A determined second click cannot start another sign-in.
    await submit.click({ force: true });

    await expect(page).toHaveURL('/home', { timeout: 10_000 });
  });
});

test.describe('keyboard', () => {
  test('tab order runs username, password, submit', async ({ page }) => {
    await page.goto('/login');

    await page.getByTestId('login-username').focus();
    await expect(page.getByTestId('login-username')).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('login-password')).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('login-submit')).toBeFocused();
  });

  test('focus stays visible on the submit button', async ({ page }) => {
    await page.goto('/login');

    await page.getByTestId('login-password').focus();
    await page.keyboard.press('Tab');

    const outline = await page.getByTestId('login-submit').evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
    });

    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThan(0);
  });

  test('the whole form can be completed and submitted from the keyboard', async ({ page }) => {
    await page.goto('/login');

    await page.getByTestId('login-username').focus();
    await page.keyboard.type(MOCK_CREDENTIALS.username);
    await page.keyboard.press('Tab');
    await page.keyboard.type(MOCK_CREDENTIALS.password);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL('/home');
  });
});

test.describe('secure shell after sign-in', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await fillCredentials(page);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL('/home');
  });

  test('renders with its header, navigation and routed content', async ({ page }) => {
    await expect(page.getByTestId('secure-shell')).toBeVisible();
    await expect(page.getByTestId('public-shell')).toHaveCount(0);

    // the header is present; the merchant row itself is desktop-only since Phase 26B.
    await expect(page.getByTestId('secure-header')).toBeVisible();
    // The routed content is now the storefront home page, which the merchant fills.
    await expect(page.getByTestId('home-page')).toBeVisible();
    await expect(page.getByRole('banner')).toContainText('Mock Buyer');
  });

  test('stays usable with no horizontal overflow at this viewport', async ({ page }) => {
    // Closes the Phase 5 gap: the secure shell could not be reached in a browser
    // until sign-in existed, so its header wrapping was never verified on a phone.
    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });

  test('its navigation stays inside the viewport', async ({ page }) => {
    // Measured on the header itself: the merchant row is desktop-only since Phase 26B,
    // and what this protects is that nothing in the header escapes the viewport.
    const nav = page.getByTestId('secure-header');
    const box = await nav.boundingBox();
    const viewport = page.viewportSize();

    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box && viewport) {
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }
  });

  test('navigates between secure pages without a page load', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>)['__spaMarker'] = true;
    });

    await goToAccountRoute(page, 'Account');

    await expect(page).toHaveURL('/account');
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();

    const survived = await page.evaluate(
      () => (window as unknown as Record<string, unknown>)['__spaMarker'] === true,
    );
    expect(survived, 'the browser performed a full page load instead of routing').toBe(true);
  });

  // A browser-level "refresh keeps me signed in" test is deliberately absent. The
  // mock server holds its session in memory, so a full reload restarts it and forgets
  // the user - which is a limitation of the stand-in, not of the application. Making
  // it survive would mean writing auth state into browser storage, and the assertions
  // that nothing does that are worth more than this test. Restore-after-reload is
  // covered by mock-api.session.spec.ts against a fresh client store, and end to end
  // by scripts/live-smoke.mjs against the real backend.
});
