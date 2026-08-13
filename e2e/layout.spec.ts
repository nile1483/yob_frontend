import { expect, test } from '@playwright/test';

import { expectNoHorizontalOverflow, expectShellUsable } from './support/layout';

/**
 * Structural responsiveness, at every configured viewport.
 *
 * The project has no breakpoint configuration and must not grow one; the viewports in
 * `playwright.config.ts` are testing targets. These checks assert the shell stays
 * usable and never scrolls sideways - deliberately not how it looks, because the
 * design is placeholder-level. No screenshot snapshots for the same reason: they would
 * be pure maintenance until the styling phase lands.
 */

/** Every route the structural application currently serves. */
const ROUTES = [
  { path: '/login', heading: /Sign in/ },
  { path: '/terms', heading: /Terms/ },
  { path: '/session-unavailable', heading: /could not reach your account/i },
  { path: '/no-such-page', heading: /Page not found/ },
] as const;

for (const route of ROUTES) {
  test(`${route.path} has no horizontal overflow`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.getByRole('heading', { name: route.heading })).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });
}

test('the public shell stays usable at this viewport', async ({ page }) => {
  await page.goto('/terms');

  await expectShellUsable(page);

  // Header and footer landmarks both survive, including on a narrow phone where the
  // header contents must wrap rather than overflow.
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Your Order Book' }),
  ).toBeVisible();
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Terms' })).toBeVisible();
});

test('the guest redirect target stays usable at this viewport', async ({ page }) => {
  await page.goto('/catalog');

  await expect(page).toHaveURL(/\/login/);
  await expectShellUsable(page);
});

test('long content does not force the page sideways', async ({ page }) => {
  // The return URL is echoed into the sign-in page, so it is the one place today
  // where attacker- or router-supplied text of arbitrary length reaches the layout.
  const longPath = `/catalog/${'segment-'.repeat(40)}`;
  await page.goto(`/login?returnUrl=${encodeURIComponent(longPath)}`);

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
