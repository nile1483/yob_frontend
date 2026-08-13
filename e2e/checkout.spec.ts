import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';
import { expectNoHorizontalOverflow, expectShellUsable } from './support/layout';

/**
 * Checkout details in a real browser, at every configured viewport.
 *
 * Mock-backed and deterministic. The real bench cannot serve an item at all (the
 * storefront user lacks Frappe permission on the `Item` doctype), so a real cart with
 * contents - and therefore a real checkout - is unreachable there. That limitation is
 * recorded in `docs/PROJECT-STATE.md` rather than papered over.
 *
 * Payment is deliberately never invoked: `proceed_to_payment` belongs to Phase 12.
 */

const BOLT = '/catalog/item/hex-bolt-m10-50';

const LOCAL_ADDRESS = 'ADDR-MOCK-0001';
const REMOTE_ADDRESS = 'ADDR-MOCK-0002';
const STALE_ADDRESS = 'ADDR-MOCK-STALE';
const PRIMARY_CONTACT = 'CONT-MOCK-0001';
const SECOND_CONTACT = 'CONT-MOCK-0002';
const STALE_CONTACT = 'CONT-MOCK-STALE';

/** Put something in the cart, the only way a browser can: through the UI. */
async function addBoltToCart(page: Page, quantity = '2'): Promise<void> {
  const input = page.getByTestId('item-quantity');
  await input.fill(quantity);
  await input.blur();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
}

/** Sign in, fill the cart, and land on checkout - all within one page load. */
async function openCheckout(page: Page, flags?: string): Promise<void> {
  if (flags === undefined) {
    await signInAsMockBuyer(page, { goTo: BOLT });
  } else {
    await signInWithMockFlags(page, flags, { goTo: BOLT });
  }

  await addBoltToCart(page);
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Cart' })
    .click();
  await expect(page).toHaveURL('/cart');
  await page.getByTestId('cart-checkout-link').click();
  await expect(page).toHaveURL('/checkout');
  await expect(page.getByTestId('checkout-items')).toBeVisible();
}

const radio = (page: Page, group: string, value: string) =>
  page.locator(`[data-testid="${group}-option"][data-value="${value}"]`);

test.describe('reaching checkout', () => {
  test('login to cart to checkout', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });
    await addBoltToCart(page);

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();
    await expect(page.getByTestId('cart-checkout-link')).toBeVisible();

    await page.getByTestId('cart-checkout-link').click();
    await expect(page).toHaveURL('/checkout');
  });

  test('routes client-side, without a page load', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });
    await addBoltToCart(page);
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
      .click();

    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>)['__spaMarker'] = true;
    });
    await page.getByTestId('cart-checkout-link').click();
    await expect(page).toHaveURL('/checkout');

    const survived = await page.evaluate(
      () => (window as unknown as Record<string, unknown>)['__spaMarker'] === true,
    );
    expect(survived, 'the browser reloaded instead of routing').toBe(true);
  });

  test('an empty cart offers no checkout link', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/cart' });

    await expect(page.getByTestId('cart-empty')).toBeVisible();
    await expect(page.getByTestId('cart-checkout-link')).toHaveCount(0);
  });

  test('checkout with an empty cart offers no selection at all', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/checkout' });

    await expect(page.getByTestId('checkout-empty')).toBeVisible();
    // Nothing selectable, so no setter is reachable.
    await expect(page.getByTestId('checkout-contact-section')).toHaveCount(0);
    await expect(page.getByTestId('checkout-billing-section')).toHaveCount(0);
    await expect(page.getByTestId('checkout-shipping-section')).toHaveCount(0);
  });

  test('renders inside the secure shell', async ({ page }) => {
    await openCheckout(page);

    await expect(page.getByTestId('secure-shell')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(page.getByRole('banner')).toContainText('Mock Buyer');
  });
});

test.describe('initial load', () => {
  test('shows the cart, the contacts and the addresses', async ({ page }) => {
    await openCheckout(page);

    await expect(page.getByTestId('checkout-items')).toBeVisible();
    await expect(page.getByTestId('checkout-contact-section')).toBeVisible();
    await expect(page.getByTestId('checkout-billing-section')).toBeVisible();
    await expect(page.getByTestId('cart-grand-total')).toBeVisible();
  });

  test('preselects the contact, billing and shipping the cart holds', async ({ page }) => {
    await openCheckout(page);

    await expect(radio(page, 'checkout-contact', PRIMARY_CONTACT)).toBeChecked();
    await expect(radio(page, 'checkout-billing', LOCAL_ADDRESS)).toBeChecked();
    await expect(radio(page, 'checkout-shipping', LOCAL_ADDRESS)).toBeChecked();
  });

  test('offers the same addresses for billing and shipping', async ({ page }) => {
    await openCheckout(page);

    const billing = await page.locator('[data-testid="checkout-billing-option"]').count();
    const shipping = await page.locator('[data-testid="checkout-shipping-option"]').count();
    expect(shipping).toBe(billing);
    expect(billing).toBeGreaterThan(1);
  });

  test('never prints the backend HTML address block', async ({ page }) => {
    await openCheckout(page);

    const body = await page.locator('body').innerText();
    expect(body).not.toContain('<br>');
    expect(body).not.toContain('State Code:');
  });
});

/**
 * These use `click()` rather than Playwright's `check()`.
 *
 * `check()` asserts the control is checked the instant the click returns, but the
 * radio here deliberately shows cart truth until the server confirms - so it is
 * momentarily unchecked. `click()` plus a retrying `toBeChecked()` describes the same
 * intent without racing the round trip.
 */
test.describe('selecting', () => {
  test('choosing another contact updates the cart', async ({ page }) => {
    await openCheckout(page);

    await radio(page, 'checkout-contact', SECOND_CONTACT).click();

    await expect(radio(page, 'checkout-contact', SECOND_CONTACT)).toBeChecked();
    await expect(radio(page, 'checkout-contact', PRIMARY_CONTACT)).not.toBeChecked();
  });

  test('choosing an out-of-state billing address reprices the order', async ({ page }) => {
    await openCheckout(page);
    const total = page.getByTestId('cart-grand-total');
    const before = (await total.textContent()) ?? '';

    await radio(page, 'checkout-billing', REMOTE_ADDRESS).click();

    // The server adds a destination surcharge; the page shows its figure.
    await expect(total).not.toHaveText(before);
    await expect(page.getByTestId('cart-tax-total')).toBeVisible();
  });

  test('choosing a different shipping address leaves billing alone', async ({ page }) => {
    await openCheckout(page);

    await radio(page, 'checkout-shipping', REMOTE_ADDRESS).click();

    await expect(radio(page, 'checkout-shipping', REMOTE_ADDRESS)).toBeChecked();
    await expect(radio(page, 'checkout-billing', LOCAL_ADDRESS)).toBeChecked();
    await expect(page.getByTestId('checkout-same-as-billing')).toHaveCount(0);
  });

  test('says shipping is the same as billing when it is', async ({ page }) => {
    await openCheckout(page);
    await expect(page.getByTestId('checkout-same-as-billing')).toBeVisible();
  });

  test('a refused address is reported safely and the choice does not stick', async ({ page }) => {
    await openCheckout(page, 'mockScenario=checkout-stale-records');

    // Not `.check()`: that would assert the radio stays checked, and the whole point
    // is that a refused choice does not stick.
    await radio(page, 'checkout-billing', STALE_ADDRESS).click();

    const error = page.getByTestId('checkout-selection-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('no longer available');
    // Nothing about ownership, existence, or the backend's own wording.
    await expect(error).not.toContainText('does not belong');
    await expect(error).not.toContainText('billing_address_invalid');
    // The previous selection is still the one shown.
    await expect(radio(page, 'checkout-billing', LOCAL_ADDRESS)).toBeChecked();
  });

  test('a refused contact is reported safely too', async ({ page }) => {
    await openCheckout(page, 'mockScenario=checkout-stale-records');

    await radio(page, 'checkout-contact', STALE_CONTACT).click();

    const error = page.getByTestId('checkout-selection-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('no longer available');
    await expect(radio(page, 'checkout-contact', PRIMARY_CONTACT)).toBeChecked();
  });

  test('a server failure is reported without leaking internals', async ({ page }) => {
    // Signing in is spared so the page is reachable; every other call fails.
    await signInWithMockFlags(page, 'mockScenario=server-error', { goTo: '/checkout' });

    const error = page.getByTestId('checkout-cart-error');
    await expect(error).toBeVisible();
    await expect(error).not.toContainText('internal_server_error');
    await expect(error).not.toContainText('correlation_id');
    await expect(page.getByTestId('secure-shell')).toBeVisible();
  });
});

test.describe('shipping section', () => {
  test('is shown for a shippable cart', async ({ page }) => {
    await openCheckout(page);
    await expect(page.getByTestId('checkout-shipping-section')).toBeVisible();
  });

  test('is hidden when the server says the cart does not ship', async ({ page }) => {
    await openCheckout(page, 'mockScenario=cart-not-shippable');

    await expect(page.getByTestId('checkout-shipping-section')).toHaveCount(0);
    // Billing is untouched, and the layout survives the section's absence.
    await expect(page.getByTestId('checkout-billing-section')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('readiness ignores shipping when the cart does not ship', async ({ page }) => {
    await openCheckout(page, 'mockScenario=cart-not-shippable');
    await expect(page.getByTestId('checkout-readiness')).toContainText('Ready to proceed');
  });
});

test.describe('adding records', () => {
  test('a new billing address appears in the list and is selected', async ({ page }) => {
    await openCheckout(page);

    await page.getByTestId('checkout-add-billing-address').click();
    await page.getByTestId('address-title').fill('Nagpur Depot');
    await page.getByTestId('address-line1').fill('Warehouse 12, MIDC');
    await page.getByTestId('address-city').fill('Nagpur');
    await page.getByTestId('address-country').fill('India');
    await page.getByTestId('address-form-submit').click();

    await expect(page.getByTestId('address-form')).toHaveCount(0);
    const created = page.locator('[data-testid="checkout-billing-option"][data-value*="Nagpur"]');
    await expect(created).toHaveCount(1);
    await expect(created).toBeChecked();
    await expect(page.getByTestId('checkout-billing-section')).toContainText('Nagpur Depot');
  });

  test('a new shipping address is selected for shipping only', async ({ page }) => {
    await openCheckout(page);

    await page.getByTestId('checkout-add-shipping-address').click();
    await page.getByTestId('address-title').fill('Surat Dock');
    await page.getByTestId('address-line1').fill('Dock 2');
    await page.getByTestId('address-city').fill('Surat');
    await page.getByTestId('address-country').fill('India');
    await page.getByTestId('address-form-submit').click();

    await expect(page.getByTestId('address-form')).toHaveCount(0);
    await expect(
      page.locator('[data-testid="checkout-shipping-option"][data-value*="Surat"]'),
    ).toBeChecked();
    // Billing kept what it had: only the section that opened the form adopts it.
    await expect(radio(page, 'checkout-billing', LOCAL_ADDRESS)).toBeChecked();
  });

  test('a new contact appears in the list and is selected', async ({ page }) => {
    await openCheckout(page);

    await page.getByTestId('checkout-add-contact').click();
    await page.getByTestId('contact-first-name').fill('Anita');
    await page.getByTestId('contact-last-name').fill('Mock');
    await page.getByTestId('contact-email').fill('anita.mock@example.invalid');
    await page.getByTestId('contact-form-submit').click();

    await expect(page.getByTestId('contact-form')).toHaveCount(0);
    // The composed name only the refreshed list knows.
    await expect(page.getByTestId('checkout-contact-section')).toContainText('Anita Mock');
    await expect(
      page.locator('[data-testid="checkout-contact-option"][data-value*="Anita"]'),
    ).toBeChecked();
  });

  test('an incomplete address is refused before any request', async ({ page }) => {
    await openCheckout(page);

    await page.getByTestId('checkout-add-billing-address').click();
    await page.getByTestId('address-form-submit').click();

    await expect(page.getByTestId('address-form')).toBeVisible();
    await expect(page.getByText('Enter the street address.')).toBeVisible();
    await expect(radio(page, 'checkout-billing', LOCAL_ADDRESS)).toBeChecked();
  });

  test('a contact with no first name is refused', async ({ page }) => {
    await openCheckout(page);

    await page.getByTestId('checkout-add-contact').click();
    await page.getByTestId('contact-form-submit').click();

    await expect(page.getByTestId('contact-form')).toBeVisible();
    await expect(page.getByText('Enter a first name.')).toBeVisible();
  });

  test('the form can be abandoned', async ({ page }) => {
    await openCheckout(page);

    await page.getByTestId('checkout-add-billing-address').click();
    await expect(page.getByTestId('address-form')).toBeVisible();

    await page.getByTestId('address-form-cancel').click();
    await expect(page.getByTestId('address-form')).toHaveCount(0);
    await expect(page.getByTestId('checkout-add-billing-address')).toBeVisible();
  });
});

test.describe('readiness', () => {
  test('reports ready when every required selection is present', async ({ page }) => {
    await openCheckout(page);
    await expect(page.getByTestId('checkout-readiness')).toContainText('Ready to proceed');
  });

  test('offers exactly one payment action, and it only hands off', async ({ page }) => {
    // Phase 11 asserted there was no payment action at all. Phase 12 added the handoff,
    // so the assertion that still earns its place is that there is precisely one - and
    // that nothing which belongs to Phase 13 has crept in beside it.
    await openCheckout(page);

    await expect(page.getByRole('button', { name: /pay|payment|place order/i })).toHaveCount(1);
    await expect(page.getByTestId('checkout-proceed')).toBeVisible();

    // No method selection, no provider, no order placement on this page.
    await expect(page.getByText(/pay later|razorpay|card|upi|net ?banking/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /pay|payment|place order/i })).toHaveCount(0);
  });
});

test.describe('keyboard and accessibility', () => {
  test('each list is a labelled group of native radios', async ({ page }) => {
    await openCheckout(page);

    for (const group of ['checkout-contact', 'checkout-billing', 'checkout-shipping']) {
      const fieldset = page.getByTestId(group);
      await expect(fieldset).toBeVisible();
      expect(await fieldset.evaluate((el) => el.tagName)).toBe('FIELDSET');
      await expect(fieldset.locator('legend')).not.toBeEmpty();
    }
  });

  test('a selection can be made with the keyboard alone', async ({ page }) => {
    await openCheckout(page);

    const first = radio(page, 'checkout-contact', PRIMARY_CONTACT);
    await first.focus();
    await expect(first).toBeFocused();

    // Native radio-group behaviour: arrow keys move and select.
    await page.keyboard.press('ArrowDown');

    await expect(radio(page, 'checkout-contact', SECOND_CONTACT)).toBeChecked();
  });

  test('a focused radio keeps focus across a selection', async ({ page }) => {
    await openCheckout(page);

    const target = radio(page, 'checkout-billing', REMOTE_ADDRESS);
    await target.focus();
    await page.keyboard.press('Space');

    await expect(target).toBeChecked();
    // The pending state must not move focus out from under a keyboard user.
    await expect(target).toBeFocused();
  });

  test('the radios show a visible focus ring', async ({ page }) => {
    await openCheckout(page);

    const target = radio(page, 'checkout-contact', PRIMARY_CONTACT);
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      if (await target.evaluate((el) => el === document.activeElement)) {
        break;
      }
    }
    await expect(target).toBeFocused();

    const outline = await target.evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThan(0);
  });

  test('the add forms are operable by keyboard', async ({ page }) => {
    await openCheckout(page);

    const add = page.getByTestId('checkout-add-contact');
    await add.focus();
    await expect(add).toBeFocused();
    await page.keyboard.press('Enter');

    const firstName = page.getByTestId('contact-first-name');
    await expect(firstName).toBeVisible();
    await firstName.focus();
    await page.keyboard.type('Keyboard');
    // Implicit submission from a text input inside the form.
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('contact-form')).toHaveCount(0);
    await expect(page.getByTestId('checkout-contact-section')).toContainText('Keyboard');
  });

  test('add buttons are real buttons', async ({ page }) => {
    await openCheckout(page);

    for (const id of ['checkout-add-contact', 'checkout-add-billing-address']) {
      expect(await page.getByTestId(id).evaluate((el) => el.tagName)).toBe('BUTTON');
      await expect(page.getByTestId(id)).toHaveAttribute('type', 'button');
    }
  });
});

test.describe('layout', () => {
  test('has no horizontal overflow', async ({ page }) => {
    await openCheckout(page);

    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });

  test('survives an added address with very long lines', async ({ page }) => {
    await openCheckout(page);

    await page.getByTestId('checkout-add-billing-address').click();
    await page
      .getByTestId('address-title')
      .fill('Extremely Long Warehouse Name For Layout Testing');
    await page
      .getByTestId('address-line1')
      .fill('Building 47B, Phase III Extension, Industrial Development Corporation Estate');
    await page.getByTestId('address-city').fill('Pimpri-Chinchwad');
    await page.getByTestId('address-country').fill('India');
    await page.getByTestId('address-form-submit').click();

    await expect(page.getByTestId('address-form')).toHaveCount(0);
    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });

  test('the open form does not break the layout', async ({ page }) => {
    await openCheckout(page);

    await page.getByTestId('checkout-add-billing-address').click();
    await expect(page.getByTestId('address-form')).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });
});
