import { expect, test } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';
import { expectNoHorizontalOverflow, expectShellUsable } from './support/layout';

/**
 * The catalog vertical slice in a real browser, at every configured viewport.
 *
 * Deterministic mock data throughout - no Frappe bench involved. The real backend's
 * behaviour (an empty category list) is covered separately by
 * `scripts/live-smoke.mjs` and by the empty-state test below, which reproduces exactly
 * that response.
 */

test.describe('login to catalog', () => {
  test('a full sign-in journey ends on a populated catalog', async ({ page }) => {
    // The one place this suite walks the whole journey rather than using the helper.
    await page.goto('/login');
    await page.getByTestId('login-username').fill('mock.buyer@example.invalid');
    await page.getByTestId('login-password').fill('mock-password-not-a-secret');
    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL('/catalog');
    await expect(page.getByTestId('secure-shell')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Catalog', level: 1 })).toBeVisible();
    await expect(page.getByTestId('category-grid')).toBeVisible();
  });
});

test.describe('category listing', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsMockBuyer(page);
  });

  test('lists the top-level categories inside the secure shell', async ({ page }) => {
    await expect(page.getByTestId('secure-shell')).toBeVisible();
    await expect(page.getByTestId('category-card')).toHaveCount(3);
    await expect(page.getByRole('link', { name: 'Industrial Supplies' })).toBeVisible();
  });

  test('has no horizontal overflow and stays usable', async ({ page }) => {
    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });

  test('navigates into a category without a full page load', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>)['__spaMarker'] = true;
    });

    await page.getByRole('link', { name: 'Industrial Supplies' }).click();

    await expect(page).toHaveURL('/catalog/industrial-supplies');
    await expect(page.getByTestId('category-title')).toContainText('Industrial Supplies');

    const survived = await page.evaluate(
      () => (window as unknown as Record<string, unknown>)['__spaMarker'] === true,
    );
    expect(survived, 'the browser reloaded instead of routing').toBe(true);
  });

  test('category links are reachable and activatable by keyboard', async ({ page }) => {
    const firstCard = page.getByTestId('category-card').first();

    // Tab from the top until the first category link has focus.
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      if (await firstCard.evaluate((el) => el === document.activeElement)) {
        break;
      }
    }
    await expect(firstCard).toBeFocused();

    // Focus must be visible, not just present.
    const outline = await firstCard.evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/catalog/industrial-supplies');
  });
});

test.describe('category detail', () => {
  test('shows subcategories for a group category', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/industrial-supplies' });

    await expect(page.getByRole('heading', { name: 'Subcategories' })).toBeVisible();
    await expect(page.getByTestId('subcategory-grid')).toBeVisible();
    // Fasteners, Abrasives and the multi-page Bulk Fasteners category.
    await expect(page.getByTestId('category-card')).toHaveCount(3);
    await expect(page.getByTestId('item-grid')).toHaveCount(0);
  });

  test('lists items with backend pricing', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/fasteners' });

    await expect(page.getByRole('heading', { name: 'Items' })).toBeVisible();
    await expect(page.getByTestId('item-card')).toHaveCount(4);
    await expect(page.getByTestId('category-description')).toContainText(
      'available to approved B2B buyers',
    );
  });

  test('renders a discounted item with its original price struck through', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/fasteners' });

    const bolt = page.getByTestId('item-card').filter({ hasText: 'Hex Bolt M10 x 50mm' });

    await expect(bolt.getByTestId('item-rate')).toContainText('11.25');
    await expect(bolt.getByTestId('item-base-price')).toContainText('12.50');
    await expect(bolt.getByTestId('item-discount')).toContainText('10');
    await expect(bolt.getByTestId('item-pricing-rule')).toContainText('YOB Demo Bulk Discount');
  });

  test('renders an undiscounted item without discount decoration', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/fasteners' });

    const washer = page.getByTestId('item-card').filter({ hasText: 'Flat Washer M10' });

    await expect(washer.getByTestId('item-rate')).toContainText('1.20');
    await expect(washer.getByTestId('item-base-price')).toHaveCount(0);
    await expect(washer.getByTestId('item-discount')).toHaveCount(0);
  });

  test('shows an empty state for a category with nothing in it', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/abrasives' });

    await expect(page.getByTestId('category-no-items')).toBeVisible();
    await expect(page.getByText('No items in this category')).toBeVisible();
  });

  test('shows a not-found state for an unknown category', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/no-such-category' });

    await expect(page.getByTestId('category-not-found')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Category not found' })).toBeVisible();
    // Still inside the secure shell, not the application-level 404.
    await expect(page.getByTestId('secure-shell')).toBeVisible();
  });

  test('offers a way back to the catalog from a category', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/fasteners' });

    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link').click();

    await expect(page).toHaveURL('/catalog');
    await expect(page.getByTestId('category-grid')).toBeVisible();
  });

  test('has no horizontal overflow, even with long item names', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/fasteners' });

    // The fixture includes a 90-character item name and a 63-character category name.
    await expect(page.getByTestId('item-card')).toHaveCount(4);
    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('bounded item listing (Phase 22B-2)', () => {
  const BULK = '/catalog/bulk-fasteners';

  test('shows a first page and offers Load More', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BULK });

    // Page size is 24; the category holds 30.
    await expect(page.getByTestId('item-card')).toHaveCount(24);
    await expect(page.getByTestId('load-more')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('Load More appends without disturbing what is already shown', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BULK });
    const first = await page.getByTestId('item-card').first().textContent();

    await page.getByTestId('load-more').click();

    await expect(page.getByTestId('item-card')).toHaveCount(30);
    // The card that was on screen before is still there, and still first.
    await expect(page.getByTestId('item-card').first()).toHaveText(first ?? '');
  });

  test('Load More disappears once the backend says there is no more', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BULK });
    await page.getByTestId('load-more').click();

    await expect(page.getByTestId('item-card')).toHaveCount(30);
    await expect(page.getByTestId('load-more')).toBeHidden();
  });

  test('a small category never offers Load More', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/fasteners' });

    await expect(page.getByTestId('item-card')).toHaveCount(4);
    await expect(page.getByTestId('load-more')).toBeHidden();
  });

  test.describe('sort', () => {
    test('defaults to name A to Z', async ({ page }) => {
      await signInAsMockBuyer(page, { goTo: BULK });

      await expect(page.getByTestId('item-sort')).toHaveValue('name_asc');
      await expect(page.getByTestId('item-card').first()).toContainText('Bulk Fastener 01');
    });

    test('name Z to A reverses the listing', async ({ page }) => {
      await signInAsMockBuyer(page, { goTo: BULK });
      await page.getByTestId('item-sort').selectOption('name_desc');

      await expect(page.getByTestId('item-card').first()).toContainText('Bulk Fastener 30');
    });

    test('newest is its own order', async ({ page }) => {
      await signInAsMockBuyer(page, { goTo: BULK });
      await page.getByTestId('item-sort').selectOption('newest');

      await expect(page.getByTestId('item-sort')).toHaveValue('newest');
      await expect(page.getByTestId('item-card').first()).toContainText('Bulk Fastener 30');
    });

    test('changing sort replaces the listing rather than appending', async ({ page }) => {
      await signInAsMockBuyer(page, { goTo: BULK });
      await page.getByTestId('load-more').click();
      await expect(page.getByTestId('item-card')).toHaveCount(30);

      await page.getByTestId('item-sort').selectOption('name_desc');

      // Back to a single page, not 30 + 24.
      await expect(page.getByTestId('item-card')).toHaveCount(24);
      await expect(page.getByTestId('item-card').first()).toContainText('Bulk Fastener 30');
    });

    test('Load More after a sort continues that sort', async ({ page }) => {
      await signInAsMockBuyer(page, { goTo: BULK });
      await page.getByTestId('item-sort').selectOption('name_desc');
      await expect(page.getByTestId('item-card')).toHaveCount(24);

      await page.getByTestId('load-more').click();

      await expect(page.getByTestId('item-card')).toHaveCount(30);
      // Descending throughout: the continuation used the new sort's cursor.
      await expect(page.getByTestId('item-card').first()).toContainText('Bulk Fastener 30');
      await expect(page.getByTestId('item-card').last()).toContainText('Bulk Fastener 01');
    });
  });

  test('an empty page that reports more to come is not the end of the catalog', async ({
    page,
  }) => {
    await signInWithMockFlags(page, 'mockScenario=catalog-empty-page', { goTo: BULK });

    // The scan-budget continuation: nothing returned, but not exhausted.
    await expect(page.getByTestId('item-card')).toHaveCount(0);
    await expect(page.getByTestId('category-no-items')).toBeHidden();
    await expect(page.getByTestId('load-more')).toBeVisible();
  });

  test('a truly empty category shows the empty state', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/abrasives' });

    await expect(page.getByTestId('category-no-items')).toBeVisible();
    await expect(page.getByTestId('load-more')).toBeHidden();
  });

  test('a group category keeps its subcategory experience and asks for no listing', async ({
    page,
  }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/industrial-supplies' });

    await expect(page.getByTestId('subcategory-grid')).toBeVisible();
    await expect(page.getByTestId('item-listing')).toBeHidden();
    await expect(page.getByTestId('items-error')).toBeHidden();
  });

  test('the listing is usable at every viewport', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BULK });

    await expect(page.getByTestId('item-sort')).toBeVisible();
    await expect(page.getByTestId('load-more')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectShellUsable(page);
  });
});

test.describe('failure and edge states', () => {
  test('shows an empty catalog safely', async ({ page }) => {
    // Reproduces what the real bench returns today: a 200 with an empty list.
    await signInWithMockFlags(page, 'mockScenario=empty');

    await expect(page.getByTestId('catalog-empty')).toBeVisible();
    await expect(page.getByText('No categories yet')).toBeVisible();
    await expect(page.getByTestId('category-grid')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test('shows a safe error when the catalog request fails', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=server-error');

    const error = page.getByTestId('catalog-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('could not load the catalog');
    // Nothing from the backend reaches the screen.
    await expect(error).not.toContainText('internal_server_error');
    await expect(error).not.toContainText('correlation_id');
    await expect(error).not.toContainText('frappe');
  });

  test('shows a loading indicator while the catalog is slow', async ({ page }) => {
    await signInWithMockFlags(page, 'mockLatency=2000');

    // The sign-in navigation lands on /catalog while its request is still in flight.
    await expect(page.getByTestId('catalog-loading')).toBeVisible();
    await expect(page.getByTestId('category-grid')).toHaveCount(0);

    await expect(page.getByTestId('category-grid')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('catalog-loading')).toHaveCount(0);
  });
});
