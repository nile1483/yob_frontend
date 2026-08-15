import { expect, test } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';
import { expectNoHorizontalOverflow, expectShellUsable } from './support/layout';

/**
 * Item detail in a real browser, at every configured viewport.
 *
 * Deterministic mock data. The real backend cannot serve an item at all today - the
 * bench's storefront user lacks Frappe role permission on the `Item` doctype - so the
 * success path here is mock-only by necessity, and that limitation is recorded in
 * `docs/PROJECT-STATE.md` rather than papered over.
 */

const BOLT = '/catalog/item/hex-bolt-m10-50';
const WASHER = '/catalog/item/flat-washer-m10';
const ANCHOR = '/catalog/item/through-bolt-anchor-m12-120';

test.describe('reaching item detail from the catalog', () => {
  test('login to catalog to category to item', async ({ page }) => {
    await signInAsMockBuyer(page);

    await page
      .getByRole('link', { name: /Industrial Fasteners/ })
      .first()
      .click();
    await expect(page).toHaveURL('/catalog/fasteners');

    await page.getByRole('link', { name: 'Hex Bolt M10 x 50mm' }).click();

    await expect(page).toHaveURL(BOLT);
    await expect(page.getByTestId('item-title')).toContainText('Hex Bolt M10 x 50mm');
  });

  test('the item link routes client-side, without a page load', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/fasteners' });

    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>)['__spaMarker'] = true;
    });

    await page.getByRole('link', { name: 'Hex Bolt M10 x 50mm' }).click();
    await expect(page).toHaveURL(BOLT);

    const survived = await page.evaluate(
      () => (window as unknown as Record<string, unknown>)['__spaMarker'] === true,
    );
    expect(survived, 'the browser reloaded instead of routing').toBe(true);
  });

  test('the item link is keyboard reachable, focus-visible and activatable', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/fasteners' });

    const link = page.getByRole('link', { name: 'Hex Bolt M10 x 50mm' });

    await page.locator('body').click({ position: { x: 1, y: 1 } });
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      if (await link.evaluate((el) => el === document.activeElement)) {
        break;
      }
    }
    await expect(link).toBeFocused();

    const outline = await link.evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(BOLT);
  });

  test('browser back returns to the category listing', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/fasteners' });
    await page.getByRole('link', { name: 'Hex Bolt M10 x 50mm' }).click();
    await expect(page).toHaveURL(BOLT);

    await page.goBack();

    await expect(page).toHaveURL('/catalog/fasteners');
    await expect(page.getByTestId('item-grid')).toBeVisible();
  });

  test('the breadcrumb returns to the catalog', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link').click();

    await expect(page).toHaveURL('/catalog');
    await expect(page.getByTestId('category-grid')).toBeVisible();
  });
});

test.describe('item detail content', () => {
  test('shows a discounted item with backend pricing', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    await expect(page.getByTestId('item-rate')).toContainText('11.25');
    await expect(page.getByTestId('item-base-price')).toContainText('12.50');
    await expect(page.getByTestId('item-discount')).toContainText('10');
    await expect(page.getByTestId('item-uom')).toContainText('Nos');
    await expect(page.getByTestId('item-pricing-rule')).toContainText('YOB Demo Bulk Discount');
  });

  test('shows backend-supplied offers', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    await expect(page.getByTestId('item-offers')).toBeVisible();
    await expect(page.getByText('10% off on 50 or more')).toBeVisible();
  });

  test('shows an undiscounted item without discount decoration', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: WASHER });

    await expect(page.getByTestId('item-rate')).toContainText('1.20');
    await expect(page.getByTestId('item-base-price')).toHaveCount(0);
    await expect(page.getByTestId('item-discount')).toHaveCount(0);
    await expect(page.getByTestId('item-offers')).toHaveCount(0);
  });

  test('shows the tax breakdown when the backend reports tax', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: ANCHOR });

    await expect(page.getByTestId('item-tax-breakdown')).toBeVisible();
    await expect(page.getByTestId('item-tax-label')).toContainText('GST 18%');
    await expect(page.getByTestId('item-tax-amount')).toContainText('77.76');
    await expect(page.getByTestId('item-total-amount')).toContainText('509.76');
  });

  test('omits the tax breakdown when there is no tax', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });
    await expect(page.getByTestId('item-tax-breakdown')).toHaveCount(0);
  });

  test('shows a placeholder for a missing image', async ({ page }) => {
    // The washer is the fixture with no photograph. A product without one is normal,
    // not an error, and must occupy the same space as one that has it.
    await signInAsMockBuyer(page, { goTo: WASHER });

    await expect(page.getByTestId('item-image-placeholder')).toBeVisible();
    await expect(page.getByTestId('item-image-image')).toHaveCount(0);
    await expect(page.getByTestId('item-image')).toBeVisible();
  });

  test('shows the product image, named, when there is one', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    const img = page.getByTestId('item-image-image');
    await expect(img).toBeVisible();
    // Named here, unlike on a card: this image is the subject of the page.
    await expect(img).toHaveAttribute('alt', 'Hex Bolt M10 x 50mm');
    await expect(page.getByTestId('item-image-placeholder')).toHaveCount(0);
  });

  test('renders inside the secure shell', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    await expect(page.getByTestId('secure-shell')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(page.getByRole('banner')).toContainText('Mock Buyer');
  });
});

test.describe('layout', () => {
  test('has no horizontal overflow', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });

  test('a very long item name does not break the layout', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: ANCHOR });

    await expect(page.getByTestId('item-title')).toContainText('Heavy Duty Through Bolt Anchor');
    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('failure states', () => {
  test('shows a not-found state for an unknown item', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/no-such-item' });

    await expect(page.getByTestId('item-not-found')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Item not found' })).toBeVisible();
    await expect(page.getByTestId('secure-shell')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('shows a safe error when the request fails', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=server-error', { goTo: BOLT });

    const error = page.getByTestId('item-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('could not load this item');
    // Nothing from the backend reaches the screen.
    await expect(error).not.toContainText('internal_server_error');
    await expect(error).not.toContainText('PermissionError');
    await expect(error).not.toContainText('frappe');
  });

  test('shows a loading indicator while the item is slow', async ({ page }) => {
    await signInWithMockFlags(page, 'mockLatency=2000', { goTo: BOLT });

    await expect(page.getByTestId('item-loading')).toBeVisible();
    await expect(page.getByTestId('item-title')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('item-loading')).toHaveCount(0);
  });
});
