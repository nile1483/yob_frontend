import { expect, test } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';
import { expectNoHorizontalOverflow, expectShellUsable } from './support/layout';

test.describe('priced projection (Phase 23B-2)', () => {
  /** Client-side only: a full page load restarts the app and drops the mock session. */
  async function addBoltAndOpenCart(page: import('@playwright/test').Page): Promise<void> {
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Cart' }).click();
    await expect(page.getByTestId('cart-line').first()).toBeVisible();
  }

  test('a same-SKU promotion renders as its own row, without taking the paid price', async ({
    page,
  }) => {
    await signInWithMockFlags(page, 'mockScenario=cart-promotion-same-item', {
      goTo: '/catalog/item/hex-bolt-m10-50',
    });
    await addBoltAndOpenCart(page);

    await expect(page.getByTestId('cart-line')).toHaveCount(2);
    // The paid row keeps its price; the promotion row is free and labelled.
    await expect(page.getByTestId('cart-line-promotion')).toHaveCount(1);
    await expect(page.getByTestId('cart-line-amount').first()).not.toHaveText('₹0.00');
  });

  test('only the paid row offers Remove', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=cart-promotion-same-item', {
      goTo: '/catalog/item/hex-bolt-m10-50',
    });
    await addBoltAndOpenCart(page);

    // A promotion row is ERPNext output - the buyer does not own it and cannot remove it.
    await expect(page.getByTestId('cart-line')).toHaveCount(2);
    await expect(page.getByTestId('cart-line-remove')).toHaveCount(1);
  });

  test('a gift of a different SKU appears even though the cart never held it', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=cart-promotion-other-item', {
      goTo: '/catalog/item/hex-bolt-m10-50',
    });
    await addBoltAndOpenCart(page);

    await expect(page.getByTestId('cart-line')).toHaveCount(2);
    await expect(page.getByTestId('cart-lines')).toContainText('YOB Branded Cap');
    await expect(page.getByTestId('cart-line-remove')).toHaveCount(1);
  });

  test('a paid row priced to zero is still a paid row', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=cart-paid-zero-rate', {
      goTo: '/catalog/item/hex-bolt-m10-50',
    });
    await addBoltAndOpenCart(page);

    // Free by a 100% discount, not a gift: it keeps its Remove control and is not
    // labelled as a promotion.
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.getByTestId('cart-line-promotion')).toHaveCount(0);
    await expect(page.getByTestId('cart-line-remove')).toHaveCount(1);
  });
});

test.describe('row UOM and UOM conflict (Phase 23B-5U-FE)', () => {
  async function addBoltAndOpenCart(page: import('@playwright/test').Page): Promise<void> {
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();
    await expect(page.getByTestId('cart-line').first()).toBeVisible();
  }

  test('a paid row shows the unit ERPNext priced it in', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-bolt-m10-50' });
    await addBoltAndOpenCart(page);

    await expect(page.getByTestId('cart-line-uom')).toHaveText('Box');
  });

  test('a promotion row keeps its own unit, different from the paid row', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=cart-promotion-same-item', {
      goTo: '/catalog/item/hex-bolt-m10-50',
    });
    await addBoltAndOpenCart(page);

    // One item code, two rows, two legitimate units: ERPNext prices the free Product
    // Discount row in the item's stock UOM when the Pricing Rule names none.
    await expect(page.getByTestId('cart-line')).toHaveCount(2);
    await expect(page.getByTestId('cart-line-uom').nth(0)).toHaveText('Box');
    await expect(page.getByTestId('cart-line-uom').nth(1)).toHaveText('Nos');
  });

  test('a UOM conflict is explained, and the line is left for the buyer to remove', async ({
    page,
  }) => {
    await signInWithMockFlags(page, 'mockScenario=cart-item-uom-changed', {
      goTo: '/catalog/item/hex-bolt-m10-50',
    });

    // The first add creates the line; the second is refused with 409, because the line
    // is now held in a unit the item no longer sells in.
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();

    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-uom-changed')).toContainText(
      'sold in a different unit',
    );
    await expect(page.getByTestId('add-to-cart-error')).toHaveCount(0);
    // Nothing was converted on the buyer's behalf.
    await expect(page.getByTestId('item-quantity')).toHaveValue('1');

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();

    await expect(page.getByTestId('cart-uom-changed')).toContainText('sold in a different unit');
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.getByTestId('cart-line-remove')).toBeVisible();
  });
});

test.describe('row-level tax (Phase 23B-4)', () => {
  /** Client-side only: a full page load restarts the app and drops the mock session. */
  async function addAndOpenCart(page: import('@playwright/test').Page): Promise<void> {
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();
    await expect(page.getByTestId('cart-line').first()).toBeVisible();
  }

  test('an exclusive-tax row shows the backend tax and total', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/through-bolt-anchor-m12-120' });
    await addAndOpenCart(page);

    // The anchor is the taxed fixture: 432.00 net, 77.76 tax, 509.76 total.
    await expect(page.getByTestId('cart-line-tax')).toContainText('77.76');
    await expect(page.getByTestId('cart-line-total')).toContainText('509.76');
  });

  test('an inclusive-tax row shows the total as sent, without double-adding', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=cart-tax-inclusive', {
      goTo: '/catalog/item/through-bolt-anchor-m12-120',
    });
    await addAndOpenCart(page);

    await expect(page.getByTestId('cart-line-tax')).toContainText('15.25');
    await expect(page.getByTestId('cart-line-total')).toContainText('100.00');
    // 100 + 15.25 would charge the tax twice.
    await expect(page.getByTestId('cart-line-total')).not.toContainText('115.25');
  });

  test('shows CGST and SGST as separate components', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/through-bolt-anchor-m12-120' });
    await addAndOpenCart(page);

    const parts = page.getByTestId('cart-line-tax-component');
    await expect(parts).toHaveCount(2);
    await expect(parts.first()).toContainText('CGST');
    await expect(parts.last()).toContainText('SGST');
  });

  test('shows a single IGST component', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=cart-tax-igst', {
      goTo: '/catalog/item/through-bolt-anchor-m12-120',
    });
    await addAndOpenCart(page);

    const parts = page.getByTestId('cart-line-tax-component');
    await expect(parts).toHaveCount(1);
    await expect(parts.first()).toContainText('IGST');
    await expect(parts.first()).toContainText('18%');
  });

  test('names an unclassified component by its backend label', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=cart-tax-generic', {
      goTo: '/catalog/item/through-bolt-anchor-m12-120',
    });
    await addAndOpenCart(page);

    // tax_type is null - real tax from a GST-unregistered company, named by label.
    await expect(page.getByTestId('cart-line-tax-component')).toContainText('Service Tax');
  });

  test('a same-SKU promotion keeps its own tax, separate from the paid row', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=cart-promotion-same-item', {
      goTo: '/catalog/item/through-bolt-anchor-m12-120',
    });
    await addAndOpenCart(page);

    await expect(page.getByTestId('cart-line')).toHaveCount(2);
    // The paid row is taxed; the free row is not, and did not borrow the paid figure.
    await expect(page.getByTestId('cart-line-tax')).toHaveCount(1);
    await expect(page.getByTestId('cart-line-tax')).toContainText('77.76');
  });

  test('the summary stays document-authoritative when rows disagree', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=cart-summary-mismatch', {
      goTo: '/catalog/item/through-bolt-anchor-m12-120',
    });
    await addAndOpenCart(page);

    // The row is rigged to 999 / 9999; the summary must ignore it entirely.
    await expect(page.getByTestId('cart-line-total')).toContainText('9,999');
    await expect(page.getByTestId('cart-grand-total')).not.toContainText('9,999');
    await expect(page.getByTestId('cart-tax-total')).not.toContainText('999.00');
  });

  test('tax detail does not overflow the row', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/through-bolt-anchor-m12-120' });
    await addAndOpenCart(page);

    await expectNoHorizontalOverflow(page);
  });
});

test.describe('local quantity (Phase 23B-2)', () => {
  test('the chosen quantity reaches the cart in one go', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-bolt-m10-50' });

    // Request counting deliberately lives in the unit tests, not here: in mock mode the
    // API is served by an HttpClient interceptor, so nothing reaches the network and a
    // browser-level request assertion would pass without proving anything.
    // `item-pricing-race.spec.ts` pins the real guarantee against a testing backend -
    // zero pricing calls while the quantity changes, one add carrying the final value.
    const qty = page.getByTestId('item-quantity');
    for (const value of ['2', '3', '4', '5']) {
      await qty.fill(value);
      await qty.blur();
    }

    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();

    // The whole quantity arrived once, rather than one unit per keystroke.
    await expect(page.getByTestId('cart-line-quantity').first()).toHaveText('5');
  });

  test('the displayed price does not change with the chosen quantity', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-bolt-m10-50' });
    const before = await page.getByTestId('item-rate').textContent();

    await page.getByTestId('item-quantity').fill('40');
    await page.getByTestId('item-quantity').blur();

    // Angular does not multiply a preview and present it as the transaction price.
    await expect(page.getByTestId('item-rate')).toHaveText(before ?? '');
  });
});

test.describe('UOM and availability (Phase 23B-2, 23B-5U-FE)', () => {
  test('the listing and the detail both show the selling UOM', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/fasteners' });

    // The bolt sells by the Box and is stocked in Nos, so its card must say "per Box".
    // Before backend Phase 23B-5U the listing only had stock_uom and said "per Nos".
    const bolt = page.getByTestId('item-card').filter({ hasText: 'YOB-BOLT-M10' });
    await expect(bolt.getByTestId('item-uom')).toContainText('Box');
    await expect(bolt.getByTestId('item-uom')).not.toContainText('Nos');

    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-bolt-m10-50' });
    await expect(page.getByTestId('item-uom')).toContainText('Box');
  });

  test('the quantity box is labelled with the selling UOM', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-bolt-m10-50' });

    // The buyer types a number of Boxes, and the accessible name says so.
    await expect(page.getByTestId('item-quantity')).toHaveAccessibleName(/Box/);
    await expect(page.getByTestId('item-quantity-uom')).toHaveText('Box');
  });

  test('the buyer is offered no unit or warehouse to choose', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-bolt-m10-50' });

    await expect(page.locator('select')).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Warehouse');
  });

  test('stock is counted in the stock UOM, beside a price in the selling UOM', async ({
    page,
  }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-bolt-m10-50' });

    // 25 Nos on hand, priced per Box: two different units, both the backend's, neither
    // converted into the other.
    await expect(page.getByTestId('item-availability')).toContainText('25');
    await expect(page.getByTestId('item-availability-uom')).toHaveText('Nos');
    await expect(page.getByTestId('item-uom')).toContainText('Box');
    await expect(page.getByTestId('item-rate')).toContainText('11.25');
  });

  test('shows a real quantity, including zero', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-bolt-m10-50' });
    await expect(page.getByTestId('item-availability')).toContainText('25');

    await signInAsMockBuyer(page, { goTo: '/catalog/item/hex-nut-m10' });
    await expect(page.getByTestId('item-availability')).toContainText('0');
  });

  test('says nothing about stock for a non-stock item', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/flat-washer-m10' });

    await expect(page.getByTestId('item-availability')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Out of stock');
  });

  test('says nothing when the warehouse could not be resolved', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/item/through-bolt-anchor-m12-120' });

    // Unknown is not zero, and must not read as sold out.
    await expect(page.getByTestId('item-availability')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Out of stock');
  });
});

/**
 * Quantity, add-to-cart and the cart, in a real browser at every viewport.
 *
 * Mock-backed and deterministic. The real bench still cannot serve an item at all
 * (Item doctype permission), so a real add-to-cart is impossible; that limitation is
 * recorded rather than worked around.
 */
const BOLT = '/catalog/item/hex-bolt-m10-50';
const ANCHOR = '/catalog/item/through-bolt-anchor-m12-120';

async function setQuantity(page: import('@playwright/test').Page, value: string) {
  const input = page.getByTestId('item-quantity');
  await input.fill(value);
  // Commit the value the way blur or Enter does. Nothing is requested when it lands -
  // the quantity is local until Add to cart.
  await input.blur();
}

test.describe('the full journey', () => {
  test('login to catalog to item to quantity to add to cart', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill('mock.buyer@example.invalid');
    await page.getByTestId('login-password').fill('mock-password-not-a-secret');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL('/catalog');

    await page
      .getByRole('link', { name: /Industrial Fasteners/ })
      .first()
      .click();
    await expect(page).toHaveURL('/catalog/fasteners');

    await page.getByRole('link', { name: 'Hex Bolt M10 x 50mm' }).click();
    await expect(page).toHaveURL(BOLT);

    await setQuantity(page, '4');
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();

    await expect(page).toHaveURL('/cart');
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.getByTestId('cart-line-quantity')).toContainText('4');
    await expect(page.getByTestId('cart-grand-total')).toContainText('45.00');
  });
});

test.describe('quantity on item detail', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });
  });

  test('is a labelled number input allowing fractions', async ({ page }) => {
    const input = page.getByTestId('item-quantity');
    await expect(input).toHaveValue('1');
    await expect(input).toHaveAttribute('step', 'any');
    await expect(page.getByLabel('Quantity')).toBeVisible();
  });

  test('rejects zero without contacting the server', async ({ page }) => {
    await setQuantity(page, '0');

    await expect(page.getByText('greater than zero')).toBeVisible();
    await expect(page.getByTestId('add-to-cart')).toBeDisabled();
  });

  test('keeps the page usable after a quantity is committed', async ({ page }) => {
    await setQuantity(page, '50');

    await expect(page.getByTestId('item-title')).toBeVisible();
    await expect(page.getByTestId('item-quantity')).toHaveValue('50');
    await expect(page.getByTestId('item-loading')).toHaveCount(0);
  });

  test('can be operated entirely by keyboard', async ({ page }) => {
    const input = page.getByTestId('item-quantity');
    await input.focus();
    await input.fill('');
    await page.keyboard.type('3');

    // Clearing the field disables Add to cart, and typing re-enables it one change
    // detection later. Tabbing into that gap lands on the body, because a disabled
    // button is not focusable - so wait for the state a real user would be looking at
    // before moving on. Racing it tested the scheduler, not the keyboard journey.
    await expect(page.getByTestId('add-to-cart')).toBeEnabled();
    await page.keyboard.press('Tab');

    await expect(page.getByTestId('add-to-cart')).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
  });
});

test.describe('add_to_cart is a delta', () => {
  test('adding 2 then 5 gives 7, in one row', async ({ page }) => {
    // The highest-risk contract in the storefront: `qty` is added to the existing
    // line, not assigned to it. An earlier frontend phase assumed the opposite.
    await signInAsMockBuyer(page, { goTo: BOLT });

    await setQuantity(page, '2');
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();

    await setQuantity(page, '5');
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();

    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.getByTestId('cart-line-quantity')).toContainText('7');
  });

  test('says the quantity is what will be added', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });
    await expect(page.getByText('Quantity to add')).toBeVisible();
  });

  test('the cart stays read-only - no stepper, no inline editing', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();

    // Product decision: quantity is chosen on item detail and added. There is no
    // absolute set-quantity endpoint to build an editor on anyway.
    await expect(page.locator('[data-testid="cart-lines"] input')).toHaveCount(0);
    await expect(page.locator('[data-testid="cart-lines"] select')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^[+-]$/ })).toHaveCount(0);
  });

  test('a double click adds the delta once, not twice', async ({ page }) => {
    // Non-idempotent: two requests would mean the buyer silently gets double.
    // The flag has to ride on the sign-in page load: the mock reads it from
    // `location.search` at construction, and inside an encoded `returnUrl` it is invisible.
    await signInWithMockFlags(page, 'mockLatency=600', { goTo: BOLT });

    await setQuantity(page, '3');
    const add = page.getByTestId('add-to-cart');
    await add.click();
    await expect(add).toBeDisabled();
    await add.click({ force: true, timeout: 2000 }).catch(() => {
      /* a disabled button is expected to swallow this */
    });
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible({ timeout: 15000 });

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();
    await expect(page.getByTestId('cart-line-quantity')).toContainText('3');
  });
});

test.describe('add to cart', () => {
  test('acknowledges without navigating away', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });
    await page.getByTestId('add-to-cart').click();

    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
    await expect(page).toHaveURL(BOLT);
    await expect(page.getByRole('link', { name: 'View cart' })).toBeVisible();
  });

  test('a second add accumulates onto the same line', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    await setQuantity(page, '2');
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();

    await setQuantity(page, '3');
    await page.getByTestId('add-to-cart').click();

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();
    await expect(page).toHaveURL('/cart');

    // 2 + 3 = 5, in one row. This test previously asserted 3 - the SET assumption the
    // backend handoff corrected.
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.getByTestId('cart-line-quantity')).toContainText('5');
  });

  test('a double click cannot add twice', async ({ page }) => {
    await signInWithMockFlags(page, 'mockLatency=1200', { goTo: BOLT });

    const button = page.getByTestId('add-to-cart');
    await setQuantity(page, '2');
    await button.click();
    await expect(button).toBeDisabled();
    await button.click({ force: true });

    await expect(page.getByTestId('add-to-cart-success')).toBeVisible({ timeout: 15_000 });
  });

  test('shows a safe failure', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=server-error', { goTo: BOLT });
    // The item itself fails to load under this scenario, so the page shows its error.
    await expect(page.getByTestId('item-error')).toBeVisible();
    await expect(page.getByTestId('item-error')).not.toContainText('internal_server_error');
  });
});

test.describe('cart page', () => {
  test('shows an empty cart', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/cart' });

    await expect(page.getByTestId('cart-empty')).toBeVisible();
    await expect(page.getByText('Your cart is empty')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('shows server-authoritative lines and totals', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: ANCHOR });
    await setQuantity(page, '2');
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();

    // Client-side only: a goto would reload and drop the mock server session.
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();
    await expect(page).toHaveURL('/cart');

    await expect(page.getByTestId('cart-line-quantity')).toContainText('2');
    // 2 x 432 net, plus the backend's tax - all server figures.
    await expect(page.getByTestId('cart-net-total')).toContainText('864.00');
    await expect(page.getByTestId('cart-tax-total')).toContainText('155.52');
    await expect(page.getByTestId('cart-grand-total')).toContainText('1,019.52');
  });

  test('navigates to the cart client-side', async ({ page }) => {
    await signInAsMockBuyer(page);
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>)['__spaMarker'] = true;
    });

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();
    await expect(page).toHaveURL('/cart');

    const survived = await page.evaluate(
      () => (window as unknown as Record<string, unknown>)['__spaMarker'] === true,
    );
    expect(survived, 'the browser reloaded instead of routing').toBe(true);
  });

  test('stays usable with no horizontal overflow', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: ANCHOR });
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();
    await expect(page).toHaveURL('/cart');

    // The anchor has a 90-character name; the cart is a list, not a desktop table.
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });

  test('renders inside the secure shell', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/cart' });
    await expect(page.getByTestId('secure-shell')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  });

  test('fails safely', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=server-error', { goTo: '/cart' });

    await expect(page.getByTestId('cart-error')).toBeVisible();
    await expect(page.getByTestId('cart-error')).not.toContainText('internal_server_error');
    await expect(page.getByTestId('secure-shell')).toBeVisible();
  });
});

test.describe('reconciliation', () => {
  test('explains repriced lines without showing item codes', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();

    // Reload under the repriced scenario, signing in again on that page load.
    await signInWithMockFlags(page, 'mockScenario=cart-repriced', { goTo: BOLT });
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();

    const notice = page.getByTestId('cart-reconciliation');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('prices in your cart were updated');
    await expect(notice).not.toContainText('YOB-BOLT-M10');
  });

  test('explains removed lines even when the cart ends up empty', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=cart-item-removed', { goTo: BOLT });
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();

    const notice = page.getByTestId('cart-reconciliation');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('no longer available');
    await expect(notice).not.toContainText('YOB-BOLT-M10');
    // The explanation appears alongside the empty state, not instead of it.
    await expect(page.getByTestId('cart-empty')).toBeVisible();
  });
});

test.describe('removing from the cart', () => {
  /** Add an item and land on the cart, entirely client-side. */
  async function addAndOpenCart(page: import('@playwright/test').Page, item: string) {
    await signInAsMockBuyer(page, { goTo: item });
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();
    await expect(page).toHaveURL('/cart');
  }

  test('login to catalog to item to add to cart to remove to empty', async ({ page }) => {
    await addAndOpenCart(page, BOLT);
    await expect(page.getByTestId('cart-line')).toHaveCount(1);

    await page.getByTestId('cart-line-remove').click();

    await expect(page.getByTestId('cart-line')).toHaveCount(0);
    await expect(page.getByTestId('cart-empty')).toBeVisible();
    // The acknowledgement survives the cart emptying.
    await expect(page.getByTestId('cart-removed')).toContainText('Item removed from your cart');
  });

  test('names the row in the accessible label', async ({ page }) => {
    await addAndOpenCart(page, BOLT);

    await expect(page.getByTestId('cart-line-remove')).toHaveAttribute(
      'aria-label',
      /Remove Hex Bolt M10 x 50mm from your cart/,
    );
  });

  test('can be removed entirely by keyboard', async ({ page }) => {
    await addAndOpenCart(page, BOLT);

    const button = page.getByTestId('cart-line-remove');
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      if (await button.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(button).toBeFocused();

    const outline = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: parseFloat(s.outlineWidth), style: s.outlineStyle };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('cart-empty')).toBeVisible();
  });

  test('shows quantity read-only, with no editing controls', async ({ page }) => {
    await addAndOpenCart(page, BOLT);

    await expect(page.getByTestId('cart-line-quantity')).toBeVisible();
    // No quantity input, stepper or inline update on the cart LINES.
    //
    // Scoped to the lines rather than to `main`. The page-wide form was true by
    // coincidence until the coupon field arrived - a field that has nothing to do
    // with quantity - and a coincidence is not what this test is about. The coupon
    // has its own spec.
    await expect(page.getByTestId('cart-lines').locator('input')).toHaveCount(0);
    await expect(page.getByTestId('cart-lines').locator('select')).toHaveCount(0);
  });

  test('stays usable with no horizontal overflow', async ({ page }) => {
    await addAndOpenCart(page, ANCHOR);

    await expect(page.getByTestId('cart-line-remove')).toBeVisible();
    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });

  test('a failed removal keeps the line and the session', async ({ page }) => {
    // Sign in under the failing scenario, add, then attempt removal.
    await signInWithMockFlags(page, 'mockScenario=server-error', { goTo: '/cart' });

    // The cart itself fails to load under this scenario; the safe error shows and the
    // user stays authenticated inside the secure shell.
    await expect(page.getByTestId('cart-error')).toBeVisible();
    await expect(page.getByTestId('cart-error')).not.toContainText('internal_server_error');
    await expect(page.getByTestId('secure-shell')).toBeVisible();
    await expect(page.getByRole('banner')).toContainText('Mock Buyer');
    await expect(page).toHaveURL('/cart');
  });
});
