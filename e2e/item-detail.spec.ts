import { expect, test, type Page } from '@playwright/test';

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
    await signInAsMockBuyer(page, { goTo: '/catalog' });

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
    // The selling UOM, which is what the price is per. The bolt is stocked in Nos and
    // sold by the Box, so this line and the availability line name different units.
    await expect(page.getByTestId('item-uom')).toContainText('Box');
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
    // Named here, unlike on a card: this image is the subject of the page. Since Phase
    // 27C the bolt has a gallery, and a row that carries its own alt text is described
    // by it rather than by the product's name.
    await expect(img).toHaveAttribute('alt', 'Hex bolt head, straight on');
    await expect(page.getByTestId('item-image-placeholder')).toHaveCount(0);
  });

  test('renders inside the secure shell', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    await expect(page.getByTestId('secure-shell')).toBeVisible();
    // the header is present; the merchant row itself is desktop-only since Phase 26B.
    await expect(page.getByTestId('secure-header')).toBeVisible();
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

/**
 * MRP and quantity guidance in a real browser (Phase 29B).
 *
 * The unit suite pins the rules; three things are only observable here. That the native
 * control agrees with the guidance - a `step` whose base disagreed with the start blocked
 * submission outright with the browser's own validation, which no unit assertion about
 * values would have shown. That editing a quantity costs no request. And that the guided
 * quantity reaches the cart as an ordinary qty.
 */
test.describe('MRP and quantity guidance (Phase 29B)', () => {
  /** Every RPC so far, from the mock's own log - the mock answers inside HttpClient. */
  async function rpcCalls(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const log = (globalThis as Record<string, unknown>)['__yobMockRequests'] as
        | { rpcMethod: string }[]
        | undefined;
      return (log ?? []).map((record) => record.rpcMethod);
    });
  }

  test('shows the MRP quietly beside the rate', async ({ page }) => {
    // The nut: MRP 30, MOQ 10, step 6.
    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-nut-m10' });

    const mrp = page.getByTestId('item-mrp');
    await expect(mrp).toBeVisible();
    await expect(mrp).toContainText('MRP');
    await expect(mrp).toContainText('30');

    // Subordinate to the rate, and no derived saving anywhere on the page.
    const rateSize = await page
      .getByTestId('item-rate')
      .evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
    const mrpSize = await mrp.evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
    expect(mrpSize).toBeLessThan(rateSize);
    await expect(page.locator('body')).not.toContainText('You save');
  });

  test('renders no MRP line for a product without one', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: WASHER });

    await expect(page.getByTestId('item-mrp')).toHaveCount(0);
  });

  test('opens at the MOQ and steps from it', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-nut-m10' });

    const quantity = page.getByTestId('item-quantity');
    await expect(quantity).toHaveValue('10');
    await expect(quantity).toHaveAttribute('min', '10');
    await expect(quantity).toHaveAttribute('step', '6');

    // The browser's own spinner counts FROM min: 10, 16, 22 - not multiples of six.
    await quantity.click();
    await quantity.press('ArrowUp');
    await expect(quantity).toHaveValue('16');
    await quantity.press('ArrowUp');
    await expect(quantity).toHaveValue('22');
    await quantity.press('ArrowDown');
    await expect(quantity).toHaveValue('16');

    // And the value the native validator sees is valid, so Add to cart is reachable.
    expect(await quantity.evaluate((n: HTMLInputElement) => n.checkValidity())).toBe(true);
  });

  test('cannot be driven below the MOQ by the control', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-nut-m10' });
    const quantity = page.getByTestId('item-quantity');

    for (let i = 0; i < 5; i += 1) {
      await quantity.press('ArrowDown');
    }
    await expect(quantity).toHaveValue('10');
  });

  test('normalises a typed off-sequence value downward on commit', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-nut-m10' });
    const quantity = page.getByTestId('item-quantity');

    await quantity.fill('19');
    await quantity.blur();
    await expect(quantity).toHaveValue('16');

    await quantity.fill('2');
    await quantity.blur();
    await expect(quantity).toHaveValue('10');
  });

  test('steps from the ordinary start when only a multiplier is configured', async ({ page }) => {
    // The washer: multiplier 5, no MOQ. Starts at 1 and offers 1, 6, 11 - the start is
    // NOT forced up to 5, and the native validator must accept 1.
    await signInAsMockBuyer(page, { goTo: WASHER });
    const quantity = page.getByTestId('item-quantity');

    await expect(quantity).toHaveValue('1');
    await expect(quantity).toHaveAttribute('step', '5');
    expect(await quantity.evaluate((n: HTMLInputElement) => n.checkValidity())).toBe(true);

    await quantity.press('ArrowUp');
    await expect(quantity).toHaveValue('6');
  });

  test('ignores both values when a Pricing Rule disallows the guidance', async ({ page }) => {
    // The anchor: MOQ 12 and step 4 are published, and `allowed` is false. Neither may be
    // applied - while the MRP still shows, because an MRP has no quantity behaviour.
    await signInAsMockBuyer(page, { goTo: ANCHOR });
    const quantity = page.getByTestId('item-quantity');

    await expect(quantity).toHaveValue('1');
    await expect(quantity).toHaveAttribute('step', 'any');
    await expect(quantity).not.toHaveAttribute('min', /.+/);
    await expect(page.getByTestId('item-mrp')).toContainText('4,200');
  });

  test('editing the quantity costs no application request', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-nut-m10' });
    const quantity = page.getByTestId('item-quantity');
    await expect(quantity).toHaveValue('10');

    const before = await rpcCalls(page);

    await quantity.press('ArrowUp');
    await quantity.press('ArrowUp');
    await quantity.fill('19');
    await quantity.blur();
    await expect(quantity).toHaveValue('16');

    // No reprice, no re-read, no resolver call - the price on screen is the backend's
    // standalone preview and stepping never asks for another.
    expect(await rpcCalls(page)).toEqual(before);
  });

  test('sends the guided quantity to the cart as an ordinary qty', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-nut-m10' });
    await page.getByTestId('item-quantity').fill('22');
    await page.getByTestId('item-quantity').blur();

    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();

    const body = await page.evaluate(() => {
      const log = (globalThis as Record<string, unknown>)['__yobMockRequests'] as
        | { rpcMethod: string; body: unknown }[]
        | undefined;
      return (log ?? []).filter((r) => r.rpcMethod.endsWith('cart.add_to_cart')).at(-1)?.body;
    });

    // No moq, no multiplier, no mrp: the guidance shapes the input and never the request.
    expect(Object.keys((body ?? {}) as Record<string, unknown>).sort()).toEqual([
      'item_code',
      'qty',
    ]);
    expect((body as Record<string, unknown>)['qty']).toBe(22);
  });

  test('claims no backend enforcement', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-nut-m10' });

    const text = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const phrase of ['minimum order', 'will be rejected', 'pack size', 'moq']) {
      expect(text, `the page claims: ${phrase}`).not.toContain(phrase);
    }
  });
});
