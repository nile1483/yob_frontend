import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';
import { expectNoHorizontalOverflow, expectShellUsable } from './support/layout';

/**
 * Checkout → Proceed to Payment → public payment route, in a real browser at every
 * configured viewport.
 *
 * Mock-backed and deterministic. `proceed_to_payment` issues and revokes real Payment
 * Requests against a live backend, so it is never exercised there - not in these tests
 * and not in live smoke.
 *
 * Phase 12 stops at the handoff: no payment data is fetched, no methods are shown, and
 * nothing is paid.
 */

const BOLT = '/catalog/item/hex-bolt-m10-50';
const MOCK_TOKEN = 'mock-checkout-token-0001';

async function addBoltToCart(page: Page): Promise<void> {
  const input = page.getByTestId('item-quantity');
  await input.fill('2');
  await input.blur();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('add-to-cart-success')).toBeVisible();
}

/** Sign in, fill the cart and land on checkout, all inside one page load. */
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
  await page.getByTestId('cart-checkout-link').click();
  await expect(page).toHaveURL('/checkout');
  await expect(page.getByTestId('checkout-items')).toBeVisible();
}

test.describe('the Proceed CTA', () => {
  test('is enabled once the cart is ready', async ({ page }) => {
    await openCheckout(page);

    const proceed = page.getByTestId('checkout-proceed');
    await expect(proceed).toBeVisible();
    await expect(proceed).toBeEnabled();
    await expect(proceed).toContainText('Proceed to Payment');
    await expect(page.getByTestId('checkout-readiness')).toContainText('Ready to proceed');
  });

  test('is absent entirely when there is nothing to buy', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/checkout' });

    await expect(page.getByTestId('checkout-empty')).toBeVisible();
    // No obligation can be issued for an empty cart, so nothing offers to try.
    await expect(page.getByTestId('checkout-proceed')).toHaveCount(0);
  });

  test('stays enabled for a cart that needs no shipping', async ({ page }) => {
    await openCheckout(page, 'mockScenario=cart-not-shippable');

    // Readiness must not demand a shipping address the cart does not need.
    await expect(page.getByTestId('checkout-shipping-section')).toHaveCount(0);
    await expect(page.getByTestId('checkout-proceed')).toBeEnabled();
  });

  test('is a real button of the project type', async ({ page }) => {
    await openCheckout(page);

    const proceed = page.getByTestId('checkout-proceed');
    expect(await proceed.evaluate((el) => el.tagName)).toBe('BUTTON');
    await expect(proceed).toHaveAttribute('type', 'button');
  });

  test('is reachable and operable by keyboard', async ({ page }) => {
    await openCheckout(page);

    const proceed = page.getByTestId('checkout-proceed');
    // Tab rather than scripted focus: `:focus-visible` is only armed by real keyboard
    // interaction, and the visible ring is the thing under test.
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      if (await proceed.evaluate((el) => el === document.activeElement)) {
        break;
      }
    }
    await expect(proceed).toBeFocused();

    const outline = await proceed.evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/payment/${MOCK_TOKEN}`);
  });
});

test.describe('the handoff', () => {
  test('navigates to the payment route the server returned', async ({ page }) => {
    await openCheckout(page);

    await page.getByTestId('checkout-proceed').click();

    await expect(page).toHaveURL(`/payment/${MOCK_TOKEN}`);
    await expect(page.getByTestId('payment-page')).toBeVisible();
  });

  test('behaves identically when the obligation is reused', async ({ page }) => {
    // 200 rather than 201. Nothing the buyer sees may differ.
    await openCheckout(page, 'mockScenario=payment-reused');

    await page.getByTestId('checkout-proceed').click();

    await expect(page).toHaveURL(`/payment/${MOCK_TOKEN}`);
    await expect(page.getByTestId('payment-page')).toBeVisible();
    const body = await page.locator('body').innerText();
    for (const leak of ['reused', 'created', 'fingerprint', 'supersed', 'rotat']) {
      expect(body.toLowerCase()).not.toContain(leak);
    }
  });

  test('routes client-side, without a page load', async ({ page }) => {
    await openCheckout(page);

    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>)['__spaMarker'] = true;
    });
    await page.getByTestId('checkout-proceed').click();
    await expect(page).toHaveURL(`/payment/${MOCK_TOKEN}`);

    const survived = await page.evaluate(
      () => (window as unknown as Record<string, unknown>)['__spaMarker'] === true,
    );
    expect(survived, 'the browser reloaded instead of routing').toBe(true);
  });

  test('a second click cannot issue a second obligation', async ({ page }) => {
    // The mock answers in memory, so without latency there is no pending window to
    // click into at all. This is what the latency knob exists for.
    await openCheckout(page, 'mockLatency=700');

    const proceed = page.getByTestId('checkout-proceed');
    await proceed.click();

    // Busy and unclickable for the duration - a second obligation is not free, it is a
    // financial record on the server.
    await expect(proceed).toBeDisabled();
    await expect(proceed).toHaveAttribute('aria-busy', 'true');
    await proceed.click({ force: true, timeout: 2000 }).catch(() => {
      /* forcing a click onto a disabled button is expected to do nothing */
    });

    await expect(page).toHaveURL(`/payment/${MOCK_TOKEN}`, { timeout: 15000 });
    await expect(page.getByTestId('payment-page')).toBeVisible();
  });

  test('lands on a payment page that loads its own data', async ({ page }) => {
    // Phase 12 asserted this call never happened, because the page was a placeholder.
    // Phase 13 gave it a real payment page, so the assertion worth keeping is that the
    // handoff arrives somewhere that works - and that the token survived the hop.
    await openCheckout(page);
    await page.getByTestId('checkout-proceed').click();

    await expect(page).toHaveURL(`/payment/${MOCK_TOKEN}`);
    await expect(page.getByTestId('payment-summary')).toBeVisible();
    await expect(page.getByTestId('payment-methods')).toBeVisible();
  });
});

test.describe('the public payment route', () => {
  test('is reachable with no session at all', async ({ page }) => {
    // Straight to the URL as a guest - no sign-in anywhere in this test.
    await page.goto(`/payment/${MOCK_TOKEN}`);

    await expect(page).toHaveURL(`/payment/${MOCK_TOKEN}`);
    await expect(page.getByTestId('payment-page')).toBeVisible();
  });

  test('is not bounced to sign-in by the authenticated guard', async ({ page }) => {
    await page.goto(`/payment/${MOCK_TOKEN}`);

    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByTestId('login-submit')).toHaveCount(0);
  });

  test('renders in the public shell', async ({ page }) => {
    await page.goto(`/payment/${MOCK_TOKEN}`);

    await expect(page.getByTestId('public-shell')).toBeVisible();
    await expect(page.getByTestId('secure-shell')).toHaveCount(0);
  });

  test('does not persist the token anywhere', async ({ page }) => {
    await page.goto(`/payment/${MOCK_TOKEN}`);
    await expect(page.getByTestId('payment-page')).toBeVisible();

    const leaked = await page.evaluate((token) => {
      const dump = (s: Storage) =>
        Object.keys(s)
          .map((k) => `${k}=${s.getItem(k)}`)
          .join('|');
      return {
        local: dump(localStorage).includes(token),
        session: dump(sessionStorage).includes(token),
        cookie: document.cookie.includes(token),
      };
    }, MOCK_TOKEN);

    // The URL is the only place it lives, which is the contract.
    expect(leaked).toEqual({ local: false, session: false, cookie: false });
  });

  test('survives a reload, as a payment page must', async ({ page }) => {
    await page.goto(`/payment/${MOCK_TOKEN}`);
    await page.reload();

    await expect(page).toHaveURL(`/payment/${MOCK_TOKEN}`);
    await expect(page.getByTestId('payment-page')).toBeVisible();
  });
});

test.describe('failure', () => {
  test('a server refusal keeps the buyer on checkout with safe wording', async ({ page }) => {
    // The mock answers in memory, so there is no HTTP request to intercept - the
    // refusal has to come from the mock server itself.
    await openCheckout(page, 'mockScenario=payment-refused');

    await page.getByTestId('checkout-proceed').click();

    await expect(page).toHaveURL('/checkout');
    const error = page.getByTestId('checkout-proceed-error');
    await expect(error).toBeVisible();
    await expect(error).not.toContainText('cart_empty');
    await expect(error).not.toContainText('Traceback');
    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });

  test('the buyer is not left stuck after a failure', async ({ page }) => {
    await openCheckout(page, 'mockScenario=payment-refused');

    await page.getByTestId('checkout-proceed').click();
    await expect(page.getByTestId('checkout-proceed-error')).toBeVisible();

    // The pending state was released, so the buyer can correct things and try again
    // rather than being trapped behind a permanently busy button.
    const proceed = page.getByTestId('checkout-proceed');
    await expect(proceed).toBeEnabled();
    await expect(proceed).not.toHaveAttribute('aria-busy', 'true');
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('layout', () => {
  test('checkout with the CTA has no horizontal overflow', async ({ page }) => {
    await openCheckout(page);

    await expect(page.getByTestId('checkout-proceed')).toBeVisible();
    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });

  test('the payment route has no horizontal overflow', async ({ page }) => {
    await page.goto(`/payment/${MOCK_TOKEN}`);

    await expect(page.getByTestId('payment-page')).toBeVisible();
    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });
});
