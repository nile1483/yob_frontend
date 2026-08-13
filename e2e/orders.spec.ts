import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';
import { expectNoHorizontalOverflow, expectShellUsable } from './support/layout';

/**
 * Buyer orders in a real browser, at every configured viewport.
 *
 * Mock-backed and deterministic - never dependent on the development bench, whose real
 * orders are read-only evidence rather than test fixtures.
 */

const PAID = 'SAL-ORD-MOCK-0001';
const UNPAID = 'SAL-ORD-MOCK-0002';
const CANCELLED = 'SAL-ORD-MOCK-0003';

const ordersLink = (page: Page) =>
  page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Orders' });

test.describe('reaching orders', () => {
  test('login to orders to an order detail', async ({ page }) => {
    await signInAsMockBuyer(page);

    await ordersLink(page).click();
    await expect(page).toHaveURL('/orders');
    await expect(page.getByTestId('order-row')).toHaveCount(3);

    await page.getByTestId('order-row').first().click();

    await expect(page).toHaveURL(`/orders/${PAID}`);
    await expect(page.getByTestId('order-name')).toContainText(PAID);
  });

  test('routes client-side, without a page load', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/orders' });

    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>)['__spaMarker'] = true;
    });
    await page.getByTestId('order-row').first().click();
    await expect(page).toHaveURL(`/orders/${PAID}`);

    const survived = await page.evaluate(
      () => (window as unknown as Record<string, unknown>)['__spaMarker'] === true,
    );
    expect(survived, 'the browser reloaded instead of routing').toBe(true);
  });

  test('renders inside the secure shell', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/orders' });

    await expect(page.getByTestId('secure-shell')).toBeVisible();
    await expect(page.getByRole('banner')).toContainText('Mock Buyer');
  });

  test('is not reachable without a session', async ({ page }) => {
    await page.goto('/orders');

    // The secure branch guard sends a guest to sign in, with the destination kept.
    await expect(page).toHaveURL(/login/);
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });
});

test.describe('order history', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/orders' });
  });

  test('shows each order with mapped status wording', async ({ page }) => {
    await expect(page.getByTestId('order-row-status').first()).toContainText('Order received');
    // "Draft" is an ERPNext submit state; every real order carries it, including paid
    // ones. It must never reach a buyer.
    await expect(page.locator('body')).not.toContainText('Draft');
  });

  test('leaks no internal fields', async ({ page }) => {
    const body = await page.locator('body').innerText();
    for (const internal of ['docstatus', 'modified_by', 'owner', 'idx', 'parenttype']) {
      expect(body).not.toContain(internal);
    }
  });

  test('each row is a real link', async ({ page }) => {
    const row = page.getByTestId('order-row').first();
    expect(await row.evaluate((el) => el.tagName)).toBe('A');
    await expect(row).toHaveAttribute('href', `/orders/${PAID}`);
  });

  test('is navigable by keyboard', async ({ page }) => {
    const row = page.getByTestId('order-row').first();

    await page.locator('body').click({ position: { x: 1, y: 1 } });
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      if (await row.evaluate((el) => el === document.activeElement)) {
        break;
      }
    }
    await expect(row).toBeFocused();

    const outline = await row.evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/orders/${PAID}`);
  });

  test('has no horizontal overflow', async ({ page }) => {
    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('order history edge states', () => {
  test('shows an empty state, not an error, for a buyer with no orders', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=empty', { goTo: '/orders' });

    await expect(page.getByTestId('orders-empty')).toBeVisible();
    await expect(page.getByTestId('orders-error')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Browse the catalog' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('reports a server failure safely', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=server-error', { goTo: '/orders' });

    const error = page.getByTestId('orders-error');
    await expect(error).toBeVisible();
    await expect(error).not.toContainText('internal_server_error');
    await expect(error).not.toContainText('Traceback');
    await expect(page.getByTestId('secure-shell')).toBeVisible();
  });
});

test.describe('order detail', () => {
  test('shows a paid order in full', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: `/orders/${PAID}` });

    await expect(page.getByTestId('order-name')).toContainText(PAID);
    await expect(page.getByTestId('order-status')).toContainText('Order received');
    await expect(page.getByTestId('order-payment-status')).toContainText('Paid');
    await expect(page.getByTestId('order-line')).toHaveCount(1);
    await expect(page.getByTestId('order-grand-total')).toContainText('1,350');
    await expect(page.getByTestId('order-payment-reference')).toContainText('pay_EXAMPLE0001');
  });

  test('shows the server discount, not a recomputed one', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: `/orders/${PAID}` });

    await expect(page.getByTestId('order-subtotal')).toContainText('1,350');
    await expect(page.getByTestId('order-discount')).toContainText('150');
  });

  test('shows billing and shipping for a shipped order', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: `/orders/${PAID}` });

    await expect(page.getByTestId('order-billing')).toBeVisible();
    await expect(page.getByTestId('order-shipping')).toBeVisible();
    // Each is its own labelled section rather than an unlabelled block.
    await expect(page.getByRole('heading', { name: 'Billing address' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Shipping address' })).toBeVisible();
  });

  test('an unpaid order says so and hides the payment block', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: `/orders/${UNPAID}` });

    await expect(page.getByTestId('order-payment-status')).toContainText('Awaiting payment');
    await expect(page.getByTestId('order-payment')).toHaveCount(0);
    // No shipping address on this one, so the section is absent entirely.
    await expect(page.getByTestId('order-shipping')).toHaveCount(0);
    await expect(page.getByTestId('order-billing')).toBeVisible();
  });

  test('a failed payment attempt is never shown as paid', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: `/orders/${CANCELLED}` });

    await expect(page.getByTestId('order-status')).toContainText('Cancelled');
    await expect(page.getByTestId('order-payment-status')).toContainText('Awaiting payment');
    // The failed attempt's reference must not read as a receipt.
    await expect(page.locator('body')).not.toContainText('pay_EXAMPLE0002');
  });

  test('an unknown order is reported without confirming anything', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/orders/SAL-ORD-SOMEONE-ELSE' });

    await expect(page.getByTestId('order-not-found')).toBeVisible();
    // Unknown and not-yours answer identically; the wording must not distinguish them.
    await expect(page.locator('body')).not.toContainText('another customer');
    await expect(page.locator('body')).not.toContainText('belongs to');
    await expect(page.getByRole('link', { name: 'Back to your orders' }).first()).toBeVisible();
  });

  test('reports a detail failure safely', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=server-error', { goTo: `/orders/${PAID}` });

    await expect(page.getByTestId('order-error')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('correlation_id');
  });

  test('has no horizontal overflow', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: `/orders/${PAID}` });

    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });

  test('a long order number and address wrap rather than overflow', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: `/orders/${PAID}` });

    // The order name is one long unbroken token - the classic overflow source.
    await expect(page.getByTestId('order-name')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
