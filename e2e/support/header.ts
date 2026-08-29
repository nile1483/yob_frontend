import { expect, type Page } from '@playwright/test';

/**
 * Reaching the cart and the account routes through the Phase 26B header.
 *
 * Before that phase, Cart, Orders and Account were three links at the end of the merchant
 * navigation row, so every spec that needed one reached into
 * `getByRole('navigation', {name: 'Primary'})`. They are application controls rather than
 * merchandising, and the redesign gave each its own place: the cart is a header action,
 * and the account routes live behind the user menu.
 *
 * Collected here so a future header change is one edit rather than thirty-six, and so a
 * spec about the cart is not also a spec about where its link happens to sit.
 */

/** The cart action, wherever the current viewport puts it. */
export function cartLink(page: Page) {
  return page.getByTestId('cart-action');
}

/** Go to the cart. */
export async function goToCart(page: Page): Promise<void> {
  await cartLink(page).click();
}

/**
 * Go to one of the account routes, through the user menu that now holds them.
 *
 * The menu has to be opened first - that is the point of it - so this is two clicks
 * rather than one, on every viewport.
 */
export async function goToAccountRoute(page: Page, label: 'Orders' | 'Account'): Promise<void> {
  await page.getByTestId('user-menu-trigger').click();
  const link = page.locator(`[data-testid="user-menu-link"][data-label="${label}"]`);
  await expect(link).toBeVisible();
  await link.click();
}

/** Sign out, from the same menu. */
export async function signOutFromHeader(page: Page): Promise<void> {
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('sign-out').click();
}

/**
 * Open the merchant tree, whichever way this viewport offers it.
 *
 * The desktop row exists only from 1024px up; below that the same tree lives behind the
 * hamburger. Callers that just want to *reach a destination* should not have to care
 * which, so this opens the drawer when there is one and does nothing when the row is
 * already on screen.
 */
export async function openMerchantNav(page: Page): Promise<void> {
  const hamburger = page.getByTestId('nav-hamburger');
  if ((await hamburger.count()) > 0 && (await hamburger.isVisible())) {
    await hamburger.click();
  }
}

/** A merchant destination, in the row or in the drawer - whichever is showing. */
export function merchantLink(page: Page, label: string) {
  return page
    .locator(
      `[data-testid="nav-link"][data-label="${label}"], [data-testid="drawer-link"][data-label="${label}"]`,
    )
    .filter({ visible: true })
    .first();
}

/** A merchant group, in the row or in the drawer. */
export function merchantGroup(page: Page, label: string) {
  return page
    .locator(
      `[data-testid="nav-group"][data-label="${label}"], [data-testid="drawer-group"][data-label="${label}"]`,
    )
    .filter({ visible: true })
    .first();
}

/** Navigate to a merchant destination at any viewport, opening the drawer if needed. */
export async function goToMerchantDestination(page: Page, label: string): Promise<void> {
  await openMerchantNav(page);
  await merchantLink(page, label).click();
}

/** Navigate to a destination nested inside a merchant group, at any viewport. */
export async function goToMerchantChild(page: Page, group: string, label: string): Promise<void> {
  await openMerchantNav(page);
  await merchantGroup(page, group).click();
  await merchantLink(page, label).click();
}
