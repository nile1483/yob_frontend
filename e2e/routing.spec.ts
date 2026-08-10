import { expect, test } from '@playwright/test';

/**
 * Phase 5 structural verification in a real browser.
 *
 * Route branches, shell selection, the guard redirect and client-side navigation.
 * These run against the mock API, so the session resolves to guest deterministically
 * without a backend.
 *
 * Locators are roles, text and test ids. Nothing here may key off a Tailwind class -
 * the styling phase has not happened yet and every class in the shells is expected to
 * change.
 */
test.describe('public route branch', () => {
  test('serves /login inside the public shell', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByTestId('public-shell')).toBeVisible();
    await expect(page.getByTestId('secure-shell')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page).toHaveTitle(/Sign in/);
  });

  test('serves /terms to a guest', async ({ page }) => {
    await page.goto('/terms');

    await expect(page.getByTestId('public-shell')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Terms' })).toBeVisible();
    await expect(page).toHaveURL(/\/terms$/);
  });

  test('serves /session-unavailable directly', async ({ page }) => {
    await page.goto('/session-unavailable');

    await expect(page.getByTestId('public-shell')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /could not reach your account/i }),
    ).toBeVisible();
    // The recovery action is present and enabled.
    await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });
});

test.describe('secure route branch', () => {
  test('redirects a guest to sign in, preserving the requested URL', async ({ page }) => {
    await page.goto('/catalog');

    await expect(page).toHaveURL('/login?returnUrl=%2Fcatalog');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    // The destination survived the redirect. What the page does with it - return
    // there after signing in - is covered in login.spec.ts.
    expect(new URL(page.url()).searchParams.get('returnUrl')).toBe('/catalog');
  });

  test('preserves a deeper URL with its query string', async ({ page }) => {
    await page.goto('/account?tab=addresses');

    await expect(page).toHaveURL(/\/login\?returnUrl=/);
    const returnUrl = new URL(page.url()).searchParams.get('returnUrl');
    expect(returnUrl).toBe('/account?tab=addresses');
  });

  test('does not render the secure shell to a guest', async ({ page }) => {
    await page.goto('/catalog');

    await expect(page.getByTestId('secure-shell')).toHaveCount(0);
    await expect(page.getByTestId('public-shell')).toBeVisible();
  });

  test('discards an external return URL rather than offering it', async ({ page }) => {
    await page.goto('/login?returnUrl=https://phish.example/steal');

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('phish.example')).toHaveCount(0);
  });
});

test.describe('fallbacks', () => {
  test('an unknown route reaches not-found inside the public shell', async ({ page }) => {
    await page.goto('/no-such-page');

    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.getByTestId('public-shell')).toBeVisible();
  });

  test('the root URL redirects into the storefront', async ({ page }) => {
    await page.goto('/');

    // Guest, so the storefront redirect lands on sign-in with the destination kept.
    await expect(page).toHaveURL('/login?returnUrl=%2Fcatalog');
  });
});

test.describe('client-side routing', () => {
  test('navigates without a full page load', async ({ page }) => {
    await page.goto('/login');

    // A marker on `window` survives a router navigation but not a document load.
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>)['__spaMarker'] = true;
    });

    await page.getByRole('contentinfo').getByRole('link', { name: 'Terms' }).click();

    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole('heading', { name: 'Terms' })).toBeVisible();

    const survived = await page.evaluate(
      () => (window as unknown as Record<string, unknown>)['__spaMarker'] === true,
    );
    expect(survived, 'the browser performed a full page load instead of routing').toBe(true);
  });
});
