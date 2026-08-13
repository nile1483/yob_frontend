import { expect, test, type Page } from '@playwright/test';

import { expectNoHorizontalOverflow, expectShellUsable } from './support/layout';

/**
 * The public payment page, in a real browser at every configured viewport.
 *
 * **No real provider calls.** Razorpay Checkout is substituted at the
 * `RazorpayCheckout` DI seam by the mock build, so no third-party script loads and no
 * modal opens. The stand-in's behaviour is chosen with `?razorpay=`.
 *
 * Every test here reaches the page **logged out**: `/payment/:token` is public, the
 * token is the credential, and a buyer may arrive from a link on another device.
 */

const TOKEN = 'mock-checkout-token-0001';
const SALES_ORDER = 'SAL-ORD-2026-00002';

/** Open the payment page as a guest, with optional mock flags. */
async function openPayment(page: Page, flags: string[] = []): Promise<void> {
  const query = flags.length > 0 ? `?${flags.join('&')}` : '';
  await page.goto(`/payment/${TOKEN}${query}`);
  await page.waitForSelector('[data-testid="payment-summary"], [data-testid="payment-load-error"]');
}

const methodOption = (page: Page, code: string) =>
  page.locator(`[data-testid="payment-method-option"][data-method-code="${code}"]`);

test.describe('reaching the page', () => {
  test('is reachable with no session at all', async ({ page }) => {
    await openPayment(page);

    await expect(page.getByTestId('payment-page')).toBeVisible();
    await expect(page.getByTestId('public-shell')).toBeVisible();
    await expect(page.getByTestId('secure-shell')).toHaveCount(0);
    // Never bounced to sign-in: an unusable token is not an auth failure.
    await expect(page).not.toHaveURL(/login/);
  });

  test('shows a Cart-backed summary', async ({ page }) => {
    await openPayment(page);

    await expect(page.getByTestId('payment-summary')).toBeVisible();
    await expect(page.getByTestId('payment-amount')).toContainText('135');
    await expect(page.getByTestId('payment-line')).toHaveCount(1);
    // A cart has not been committed, so there is no order status yet.
    await expect(page.getByTestId('payment-order-status')).toHaveCount(0);
  });

  test('shows a Sales-Order-backed summary', async ({ page }) => {
    await openPayment(page, ['mockScenario=payment-committed']);

    await expect(page.getByTestId('payment-order-status')).toContainText('Draft');
    await expect(page.getByTestId('payment-source-reference')).toContainText(SALES_ORDER);
    // Addresses arrive as bare record names in this shape.
    await expect(page.getByTestId('payment-billing')).toContainText('Mock Trading Co-Billing');
    await expect(page.getByTestId('payment-line')).toHaveCount(1);
  });

  test('never prints the backend HTML address block', async ({ page }) => {
    await openPayment(page);

    const body = await page.locator('body').innerText();
    expect(body).not.toContain('<br>');
    expect(body).not.toContain('State Code:');
  });
});

test.describe('payment methods', () => {
  test('offers both methods when the server allows both', async ({ page }) => {
    await openPayment(page);

    await expect(page.getByTestId('payment-method-option')).toHaveCount(2);
    await expect(methodOption(page, 'paylater')).toBeVisible();
    await expect(methodOption(page, 'razorpay')).toBeVisible();
  });

  test('offers only Razorpay when that is all the server returns', async ({ page }) => {
    await openPayment(page, ['mockScenario=payment-razorpay-only']);

    await expect(page.getByTestId('payment-method-option')).toHaveCount(1);
    await expect(methodOption(page, 'razorpay')).toBeVisible();
    await expect(page.getByText('Pay Later')).toHaveCount(0);
  });

  test('offers only Pay Later when that is all the server returns', async ({ page }) => {
    await openPayment(page, ['mockScenario=payment-paylater-only']);

    await expect(page.getByTestId('payment-method-option')).toHaveCount(1);
    await expect(methodOption(page, 'paylater')).toBeVisible();
    await expect(page.getByText('Razorpay')).toHaveCount(0);
  });

  test('is a labelled group of native radios', async ({ page }) => {
    await openPayment(page);

    const group = page.getByTestId('payment-methods');
    expect(await group.evaluate((el) => el.tagName)).toBe('FIELDSET');
    await expect(group.locator('legend')).not.toBeEmpty();
  });

  test('can be chosen with the keyboard alone', async ({ page }) => {
    await openPayment(page);

    const first = methodOption(page, 'paylater');
    await first.focus();
    await page.keyboard.press('ArrowDown');

    await expect(methodOption(page, 'razorpay')).toBeChecked();
  });
});

test.describe('Pay Later', () => {
  test('completes to an unpaid order, never to a successful payment', async ({ page }) => {
    await openPayment(page);

    await methodOption(page, 'paylater').click();
    await page.getByTestId('payment-pay').click();

    const result = page.getByTestId('payment-result');
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute('data-outcome', 'pay-later');
    await expect(page.getByTestId('payment-result-status')).toContainText('Unpaid');
    await expect(page.getByTestId('payment-result-order')).toContainText(SALES_ORDER);
    // The wording must not claim money changed hands.
    await expect(page.locator('body')).not.toContainText('Payment received');
  });

  test('does not verify anything', async ({ page }) => {
    let verifyCalls = 0;
    page.on('request', (r) => {
      if (r.url().includes('verify_payment')) {
        verifyCalls += 1;
      }
    });

    await openPayment(page);
    await methodOption(page, 'paylater').click();
    await page.getByTestId('payment-pay').click();
    await expect(page.getByTestId('payment-result')).toBeVisible();

    expect(verifyCalls).toBe(0);
  });
});

test.describe('Razorpay', () => {
  test('completes through the provider and server verification', async ({ page }) => {
    await openPayment(page, ['razorpay=success']);

    await methodOption(page, 'razorpay').click();
    await page.getByTestId('payment-pay').click();

    const result = page.getByTestId('payment-result');
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute('data-outcome', 'verified');
    await expect(page.getByTestId('payment-result-order')).toContainText(SALES_ORDER);
    await expect(page.getByTestId('payment-result-payment-id')).toContainText('pay_EXAMPLE0001');
  });

  test('hands the provider the server order id and the provider amount', async ({ page }) => {
    await openPayment(page, ['razorpay=hang']);

    await methodOption(page, 'razorpay').click();
    await page.getByTestId('payment-pay').click();
    await expect(page.getByTestId('payment-busy')).toBeVisible();

    const opens = await page.evaluate(
      () =>
        (window as unknown as { __yobFakeRazorpay?: { opens: unknown[] } }).__yobFakeRazorpay
          ?.opens ?? [],
    );
    expect(opens).toHaveLength(1);
    const options = opens[0] as { order_id: string; amount: number; key: string };
    expect(options.order_id).toBe('order_EXAMPLE0001');
    // Provider units, untouched - not the 135.00 shown on screen.
    expect(options.amount).toBe(13500);
    expect(options.key).toBe('rzp_test_EXAMPLE0001');
  });

  test('never shows the signature', async ({ page }) => {
    await openPayment(page, ['razorpay=success']);

    await methodOption(page, 'razorpay').click();
    await page.getByTestId('payment-pay').click();
    await expect(page.getByTestId('payment-result')).toBeVisible();

    const body = await page.locator('body').innerText();
    expect(body).not.toContain('fake-signature-not-a-secret');
  });

  test('a dismissed modal keeps the order and offers a retry', async ({ page }) => {
    await openPayment(page, ['razorpay=dismiss']);

    await methodOption(page, 'razorpay').click();
    await page.getByTestId('payment-pay').click();

    await expect(page.getByTestId('payment-dismissed')).toBeVisible();
    // Not treated as a failure, and emphatically not a rollback.
    await expect(page.getByTestId('payment-result')).toHaveCount(0);
    await expect(page.getByTestId('payment-pay')).toBeEnabled();
    await expectNoHorizontalOverflow(page);
  });

  test('reports a Checkout.js load failure without claiming a payment', async ({ page }) => {
    await openPayment(page, ['razorpay=load-failure']);

    await methodOption(page, 'razorpay').click();
    await page.getByTestId('payment-pay').click();

    await expect(page.getByTestId('payment-action-error')).toBeVisible();
    await expect(page.getByTestId('payment-result')).toHaveCount(0);
    await expect(page.getByTestId('payment-pay')).toBeEnabled();
  });

  test('a double click cannot open two modals', async ({ page }) => {
    await openPayment(page, ['razorpay=hang', 'mockLatency=500']);

    await methodOption(page, 'razorpay').click();
    const pay = page.getByTestId('payment-pay');
    await pay.click();
    await expect(pay).toBeDisabled();
    await pay.click({ force: true, timeout: 2000 }).catch(() => {
      /* clicking a disabled button is expected to do nothing */
    });

    await expect(page.getByTestId('payment-busy')).toBeVisible();
    const opens = await page.evaluate(
      () =>
        (window as unknown as { __yobFakeRazorpay?: { opens: unknown[] } }).__yobFakeRazorpay?.opens
          .length ?? 0,
    );
    expect(opens).toBeLessThanOrEqual(1);
  });
});

test.describe('failures', () => {
  test('a retryable provider failure preserves the order and allows a retry', async ({ page }) => {
    await openPayment(page, ['mockScenario=payment-provider-error']);

    await methodOption(page, 'razorpay').click();
    await page.getByTestId('payment-pay').click();

    const error = page.getByTestId('payment-action-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('order has been saved');
    // Never "order failed" - the Sales Order exists.
    await expect(page.locator('body')).not.toContainText('Order creation failed');
    await expect(page.getByTestId('payment-preserved-order')).toContainText(SALES_ORDER);
    await expect(page.getByTestId('payment-pay')).toBeEnabled();
  });

  test('a stale payment request offers a way back to checkout', async ({ page }) => {
    await openPayment(page, ['mockScenario=payment-stale']);

    await expect(page.getByTestId('payment-load-error')).toBeVisible();
    const back = page.getByTestId('payment-return-to-checkout');
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute('href', '/checkout');
    // Nothing payable is offered against a stale obligation.
    await expect(page.getByTestId('payment-methods')).toHaveCount(0);
  });

  test('an invalid token shows a public error, not a login redirect', async ({ page }) => {
    await page.goto('/payment/not-a-real-token');

    const error = page.getByTestId('payment-load-error');
    await expect(error).toBeVisible();
    // A revoked token - the state after a successful payment - answers with the same
    // code, so the wording must not call a paid buyer's link invalid.
    await expect(error).toContainText('payment link is closed');
    await expect(page).not.toHaveURL(/login/);
    // The token is never echoed back into the page.
    await expect(page.locator('body')).not.toContainText('not-a-real-token');
    await expectShellUsable(page);
  });

  test('an expired token shows its own message', async ({ page }) => {
    await openPayment(page, ['mockScenario=payment-token-expired']);

    await expect(page.getByTestId('payment-load-error')).toContainText('expired');
    await expect(page.locator('body')).not.toContainText(TOKEN);
  });

  test('a refused method is replaced by the authoritative list', async ({ page }) => {
    await openPayment(page, ['mockScenario=payment-method-ineligible']);
    await expect(page.getByTestId('payment-method-option')).toHaveCount(2);

    await methodOption(page, 'razorpay').click();
    await page.getByTestId('payment-pay').click();

    await expect(page.getByTestId('payment-action-error')).toBeVisible();
    // The rejected method is gone; the server's current set is shown instead.
    await expect(page.getByTestId('payment-method-option')).toHaveCount(1);
    await expect(methodOption(page, 'paylater')).toBeVisible();
    await expect(page.getByTestId('payment-pay')).toBeDisabled();
  });
});

test.describe('the source transition', () => {
  test('Cart-backed, then committed, then reloads as Sales-Order-backed', async ({ page }) => {
    // This is the lifecycle regression: the same token must keep working after the
    // obligation moves from the cart to the order.
    await openPayment(page, ['razorpay=dismiss']);
    await expect(page.getByTestId('payment-order-status')).toHaveCount(0);

    await methodOption(page, 'razorpay').click();
    await page.getByTestId('payment-pay').click();
    await expect(page.getByTestId('payment-dismissed')).toBeVisible();

    // A real reload. The mock server resets with the document, so the committed state
    // is carried explicitly by the scenario.
    await openPayment(page, ['mockScenario=payment-committed']);

    await expect(page.getByTestId('payment-order-status')).toContainText('Draft');
    await expect(page.getByTestId('payment-source-reference')).toContainText(SALES_ORDER);
    await expect(page.getByTestId('payment-load-error')).toHaveCount(0);
    // Still payable, with no cart anywhere in sight.
    await expect(page.getByTestId('payment-method-option').first()).toBeVisible();
  });

  test('a committed order can still be paid', async ({ page }) => {
    await openPayment(page, ['mockScenario=payment-committed', 'razorpay=success']);

    await methodOption(page, 'razorpay').click();
    await page.getByTestId('payment-pay').click();

    await expect(page.getByTestId('payment-result')).toHaveAttribute('data-outcome', 'verified');
  });
});

test.describe('token safety', () => {
  test('the token is never persisted', async ({ page }) => {
    await openPayment(page);
    await methodOption(page, 'paylater').click();
    await page.getByTestId('payment-pay').click();
    await expect(page.getByTestId('payment-result')).toBeVisible();

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
    }, TOKEN);

    expect(leaked).toEqual({ local: false, session: false, cookie: false });
  });
});

test.describe('layout', () => {
  test('the payment page has no horizontal overflow', async ({ page }) => {
    await openPayment(page);

    await expect(page.getByTestId('payment-summary')).toBeVisible();
    await expect(page.getByTestId('payment-methods')).toBeVisible();
    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });

  test('the confirmation has no horizontal overflow', async ({ page }) => {
    await openPayment(page, ['razorpay=success']);

    await methodOption(page, 'razorpay').click();
    await page.getByTestId('payment-pay').click();
    await expect(page.getByTestId('payment-result')).toBeVisible();

    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });

  test('the order-backed summary has no horizontal overflow', async ({ page }) => {
    await openPayment(page, ['mockScenario=payment-committed']);

    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });
});
