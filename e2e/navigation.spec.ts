import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';

/** The merchant nav row for this breakpoint: the visible one of the shell's two. */
function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary' }).filter({ visible: true }).first();
}

function navLink(page: Page, label: string) {
  return nav(page).locator(`[data-testid="nav-link"][data-label="${label}"]`);
}

function navGroup(page: Page, label: string) {
  return nav(page).locator(`[data-testid="nav-group"][data-label="${label}"]`);
}

/**
 * Merchant-configured navigation in a real browser (Phase 25D).
 *
 * The shell renders one component twice - once for the wide header and once for the
 * narrow row - from a single store. So these run at all three viewports and assert the
 * *visible* navigation, which is how the same configured tree gets proven on a phone and
 * on a desktop without two datasets or two test suites.
 */
test.describe('configured navigation', () => {
  test('renders the merchant tree in the merchant order', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog' });

    await expect(navLink(page, 'Catalog')).toBeVisible();
    await expect(navGroup(page, 'Tools')).toBeVisible();
    await expect(navLink(page, 'About Us')).toBeVisible();

    // The merchant's sequence, not an alphabetical one.
    const labels = await nav(page)
      .locator('[data-testid="nav-link"], [data-testid="nav-group"], [data-testid="nav-inert"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-label')));
    expect(labels.slice(0, 3)).toEqual(['Catalog', 'Tools', 'About Us']);
  });

  test('opens a group, shows its children, and closes again', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog' });

    const group = navGroup(page, 'Tools');
    await expect(group).toHaveAttribute('aria-expanded', 'false');
    await expect(nav(page).getByTestId('nav-group-panel')).toHaveCount(0);

    await group.click();
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    await expect(navLink(page, 'Fasteners')).toBeVisible();

    await group.click();
    await expect(nav(page).getByTestId('nav-group-panel')).toHaveCount(0);
  });

  test('closes an open group with Escape', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog' });

    await navGroup(page, 'Tools').click();
    await expect(navLink(page, 'Fasteners')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(nav(page).getByTestId('nav-group-panel')).toHaveCount(0);
  });

  test('navigates to a category from inside a group', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog' });

    await navGroup(page, 'Tools').click();
    await navLink(page, 'Fasteners').click();

    await expect(page).toHaveURL('/catalog/fasteners');
    await expect(page.getByTestId('category-title')).toBeVisible();
  });

  test('builds the SPA route for a storefront page, whose href the backend leaves null', async ({
    page,
  }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog' });

    // The page renderer itself is the next phase; the link is this one.
    await expect(navLink(page, 'About Us')).toHaveAttribute('href', '/pages/about-us');
  });

  test('renders external links with the backend URL and safe new-tab behaviour', async ({
    page,
  }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog' });

    const newTab = navLink(page, 'Supplier site');
    await expect(newTab).toHaveAttribute('href', 'https://supplier.example.invalid/catalogue');
    await expect(newTab).toHaveAttribute('target', '_blank');
    await expect(newTab).toHaveAttribute('rel', /noopener/);

    // External without a new tab: the flags are independent.
    await expect(navLink(page, 'Price list PDF')).not.toHaveAttribute('target', '_blank');
  });

  test('renders an unresolvable destination as plain text', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog' });

    await expect(nav(page).locator('[data-testid="nav-inert"][data-label="Seasonal"]')).toBeVisible();
    await expect(navLink(page, 'Seasonal')).toHaveCount(0);
  });

  test('keeps the application controls beside the merchant tree', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog' });

    // Cart, Orders and Account are code-owned: they are how the application works, and a
    // merchant cannot remove them by leaving them out of a menu.
    await expect(nav(page).getByRole('link', { name: 'Cart' })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Orders' })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Account' })).toBeVisible();
  });

  test('carries on with the shell controls when no menu is configured', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=menu-missing', { goTo: '/catalog' });

    await expect(nav(page).getByTestId('nav-link')).toHaveCount(0);
    await expect(nav(page).getByRole('link', { name: 'Cart' })).toBeVisible();
    // A missing menu is not an error the buyer can do anything about.
    await expect(page.locator('body')).not.toContainText('menu_not_found');
  });
});
