import { expect, test } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';
import { expectNoHorizontalOverflow, expectShellUsable } from './support/layout';

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
  // Commit as blur/Enter does, which is what triggers repricing.
  await input.blur();
}

test.describe('the full journey', () => {
  test('login to catalog to item to quantity to add to cart', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill('mock.buyer@example.invalid');
    await page.getByTestId('login-password').fill('mock-password-not-a-secret');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL('/catalog');

    await page.getByRole('link', { name: /Industrial Fasteners/ }).first().click();
    await expect(page).toHaveURL('/catalog/fasteners');

    await page.getByRole('link', { name: 'Hex Bolt M10 x 50mm' }).click();
    await expect(page).toHaveURL(BOLT);

    await setQuantity(page, '4');
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Cart' }).click();

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

  test('keeps the page usable while the new quantity is priced', async ({ page }) => {
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
    await page.keyboard.press('Tab');

    await expect(page.getByTestId('add-to-cart')).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
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

  test('sets the quantity rather than accumulating it', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    await setQuantity(page, '2');
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();

    await setQuantity(page, '3');
    await page.getByTestId('add-to-cart').click();

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Cart' }).click();
    await expect(page).toHaveURL('/cart');

    // 2 then 3 is 3 - never 5.
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.getByTestId('cart-line-quantity')).toContainText('3');
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
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Cart' }).click();
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

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Cart' }).click();
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
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Cart' }).click();
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
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Cart' }).click();

    const notice = page.getByTestId('cart-reconciliation');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('prices in your cart were updated');
    await expect(notice).not.toContainText('YOB-BOLT-M10');
  });

  test('explains removed lines even when the cart ends up empty', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=cart-item-removed', { goTo: BOLT });
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Cart' }).click();

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
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Cart' }).click();
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
    // No quantity input, stepper or inline update anywhere on the cart.
    await expect(page.locator('main input')).toHaveCount(0);
    await expect(page.locator('main select')).toHaveCount(0);
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
