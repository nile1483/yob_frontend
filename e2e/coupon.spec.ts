import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';
import { expectNoHorizontalOverflow } from './support/layout';
import { cartLink, goToMerchantDestination } from './support/header';

/**
 * The cart coupon, in a real browser at every viewport.
 *
 * Mock-backed and deterministic. Nothing here depends on an ERPNext Coupon Code or a
 * Pricing Rule existing on a bench: the real backend's only configured test coupon
 * (`DEMO10`) is attached to a rule that is not coupon-based, so applying it changes no
 * totals at all - see `docs/PROJECT-STATE.md`. Proving that totals move is therefore
 * the mock's job, and the mock reproduces the wire contract rather than ERPNext's
 * pricing engine.
 */
const BOLT = '/catalog/item/hex-bolt-m10-50';

/**
 * Navigate to the cart the way a buyer does - by clicking.
 *
 * NOT `page.goto('/cart')`. The mock server's cart lives in memory behind the
 * interceptor, so a fresh document load restarts the app and empties it; the lines
 * just added would be gone before the coupon block could be reached. Every navigation
 * in this file is client-side for that reason.
 */
async function goToCart(page: Page): Promise<void> {
  await cartLink(page)
    .click();
  await expect(page).toHaveURL('/cart');
}

/** Client-side route back to the bolt's detail page, via the catalog. */
async function goToBolt(page: Page): Promise<void> {
  await goToMerchantDestination(page, 'Catalog');
  await page
    .getByRole('link', { name: /Industrial Fasteners/ })
    .first()
    .click();
  await page.getByRole('link', { name: 'Hex Bolt M10 x 50mm' }).click();
  await expect(page).toHaveURL(BOLT);
}

/** Put something in the cart and land on it. Coupon UI only exists with lines. */
async function cartWithOneItem(page: Page): Promise<void> {
  await signInAsMockBuyer(page, { goTo: BOLT });
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
  await goToCart(page);
  await expect(page.getByTestId('cart-lines')).toBeVisible();
}

async function applyCode(page: Page, code: string): Promise<void> {
  await page.getByTestId('cart-coupon-input').fill(code);
  await page.getByTestId('cart-coupon-apply').click();
}

test.describe('coupon on the cart', () => {
  test('is offered above checkout, applies, changes totals, and removes', async ({ page }) => {
    await cartWithOneItem(page);

    const coupon = page.getByTestId('cart-coupon');
    await expect(coupon).toBeVisible();

    // Placement is part of the product decision, so it is asserted rather than
    // assumed: the coupon block sits above the checkout action in DOM order.
    const order = await page.evaluate(() => {
      const block = document.querySelector('[data-testid="cart-coupon"]');
      const checkout = document.querySelector('[data-testid="cart-checkout-link"]');
      if (!block || !checkout) {
        return 'missing';
      }
      // Node.DOCUMENT_POSITION_FOLLOWING === 4
      return (block.compareDocumentPosition(checkout) & 4) !== 0 ? 'above' : 'below';
    });
    expect(order).toBe('above');

    const grandTotalBefore = await page.getByTestId('cart-grand-total').textContent();

    await applyCode(page, 'SAVE10');

    // Applied state comes from the canonical cart, and the code shown is the
    // server's - upper-cased even though it was typed in caps here.
    await expect(page.getByTestId('cart-coupon-applied')).toContainText('SAVE10');
    await expect(page.getByTestId('cart-coupon-input')).toHaveCount(0);

    // The server moved the money. Nothing in the app computed this.
    await expect(page.getByTestId('cart-coupon-discount')).toBeVisible();
    await expect(page.getByTestId('cart-grand-total')).not.toHaveText(grandTotalBefore ?? '');

    await page.getByTestId('cart-coupon-remove').click();

    await expect(page.getByTestId('cart-coupon-input')).toBeVisible();
    await expect(page.getByTestId('cart-coupon-discount')).toHaveCount(0);
    await expect(page.getByTestId('cart-grand-total')).toHaveText(grandTotalBefore ?? '');
  });

  test('lower-case input is accepted and echoed back upper-cased by the server', async ({
    page,
  }) => {
    await cartWithOneItem(page);

    await applyCode(page, 'save10');

    await expect(page.getByTestId('cart-coupon-applied')).toContainText('SAVE10');
  });

  test('Enter submits the coupon', async ({ page }) => {
    await cartWithOneItem(page);

    await page.getByTestId('cart-coupon-input').fill('SAVE10');
    await page.getByTestId('cart-coupon-input').press('Enter');

    await expect(page.getByTestId('cart-coupon-applied')).toContainText('SAVE10');
  });

  test('an invalid coupon is refused and the cart is untouched', async ({ page }) => {
    await cartWithOneItem(page);

    const grandTotalBefore = await page.getByTestId('cart-grand-total').textContent();

    await applyCode(page, 'NOPE');

    await expect(page.getByTestId('cart-coupon')).toContainText('not valid');
    // Still the input form, still the same money, and the typed code is still there
    // so a typo can be corrected without retyping it.
    await expect(page.getByTestId('cart-coupon-input')).toHaveValue('NOPE');
    await expect(page.getByTestId('cart-grand-total')).toHaveText(grandTotalBefore ?? '');
    await expect(page.getByTestId('cart-coupon-discount')).toHaveCount(0);
  });

  test('a coupon that cannot be used with this cart says so', async ({ page }) => {
    await cartWithOneItem(page);

    await applyCode(page, 'OTHERCUST');

    await expect(page.getByTestId('cart-coupon')).toContainText('cannot be used');
  });

  test('a minimum-spend refusal never shows the backend threshold', async ({ page }) => {
    await cartWithOneItem(page);

    await applyCode(page, 'BIGSPEND');

    await expect(page.getByTestId('cart-coupon')).toContainText('below the minimum');
    // details.minimum_amount is dropped at the network boundary by design.
    await expect(page.getByTestId('cart-coupon')).not.toContainText('100000');
  });

  test('a second Apply cannot be issued while the first is in flight', async ({ page }) => {
    // The mock answers from memory, so there is no network request for the browser to
    // observe or count - `page.on('request')` sees nothing at all. The exact
    // one-request guarantee is therefore asserted where it IS observable, against
    // HttpTestingController in `coupon.spec.ts`. What a browser can prove is the
    // mechanism that produces it: while a mutation is pending the controls are
    // disabled, so there is nothing to click twice. `mockLatency` makes that window
    // long enough to see.
    await signInWithMockFlags(page, 'mockLatency=800', { goTo: BOLT });
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
    await goToCart(page);

    await page.getByTestId('cart-coupon-input').fill('SAVE10');
    const apply = page.getByTestId('cart-coupon-apply');
    await apply.click();

    await expect(apply).toBeDisabled();
    await expect(apply).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('cart-coupon-input')).toBeDisabled();

    await expect(page.getByTestId('cart-coupon-applied')).toContainText('SAVE10');
  });

  test('the coupon block is absent from an empty cart', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=empty', { goTo: '/cart' });

    await expect(page.getByTestId('cart-empty')).toBeVisible();
    await expect(page.getByTestId('cart-coupon')).toHaveCount(0);
  });

  test('an uncertain apply recovers by reading the cart, not by applying again', async ({
    page,
  }) => {
    await signInWithMockFlags(page, 'mockScenario=coupon-uncertain', { goTo: BOLT });
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
    await goToCart(page);

    await applyCode(page, 'SAVE10');

    // Told plainly that the outcome is unknown - never "that coupon is invalid".
    await expect(page.getByTestId('cart-coupon-unconfirmed')).toBeVisible();
    await expect(page.getByTestId('cart-coupon-unconfirmed')).toContainText('could not confirm');

    // The cart was re-read rather than the coupon re-applied, so the page shows the
    // canonical state: this scenario never applies the coupon, so it is still absent
    // and still offering the input rather than claiming success.
    await expect(page.getByTestId('cart-coupon-input')).toBeVisible();
    await expect(page.getByTestId('cart-coupon-discount')).toHaveCount(0);
  });

  test('checkout still works after applying a coupon', async ({ page }) => {
    await cartWithOneItem(page);

    await applyCode(page, 'SAVE10');
    await expect(page.getByTestId('cart-coupon-applied')).toContainText('SAVE10');

    await page.getByTestId('cart-checkout-link').click();
    await expect(page).toHaveURL('/checkout');
  });

  test('adding another item keeps the coupon as the server reports it', async ({ page }) => {
    await cartWithOneItem(page);
    await applyCode(page, 'SAVE10');
    await expect(page.getByTestId('cart-coupon-applied')).toContainText('SAVE10');

    // Change the cart, then come back. Coupon state is cart state - there is no
    // separate coupon cache that could now disagree with the totals.
    await goToBolt(page);
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
    await goToCart(page);

    await expect(page.getByTestId('cart-coupon-applied')).toContainText('SAVE10');
    await expect(page.getByTestId('cart-coupon-discount')).toBeVisible();
  });

  test('the coupon block fits its viewport', async ({ page }) => {
    await cartWithOneItem(page);

    await expect(page.getByTestId('cart-coupon')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await applyCode(page, 'SAVE10');
    await expect(page.getByTestId('cart-coupon-applied')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
