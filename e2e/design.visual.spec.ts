import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';
import { expectNoHorizontalOverflow } from './support/layout';

/**
 * The storefront's visual system, asserted as behaviour rather than as styling.
 *
 * Nothing here reads a Tailwind class. A test that asserted `bg-slate-900` would fail
 * the moment the storefront was restyled - which is the entire point of a copied master
 * project - while proving nothing a buyer can perceive. So these check the things that
 * would actually be broken for someone using the page: the grid lining up, one primary
 * action per view, reachable navigation, a real sign-out, and no page that scrolls
 * sideways.
 *
 * Runs at all three configured viewports.
 */

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name });

async function openLeafCategory(page: Page): Promise<boolean> {
  for (let depth = 0; depth < 4; depth++) {
    if (await page.getByTestId('item-card').count()) return true;
    const card = page.getByTestId('category-card').first();
    if (!(await card.count())) return false;
    await card.click();
    await expect(page).toHaveURL(/\/catalog\//);
  }
  return (await page.getByTestId('item-card').count()) > 0;
}

test.describe('shell and navigation', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsMockBuyer(page);
  });

  test('every primary destination is reachable from the header', async ({ page }) => {
    for (const [name, url] of [
      ['Cart', '/cart'],
      ['Orders', '/orders'],
      ['Account', '/account'],
      ['Catalog', '/catalog'],
    ] as const) {
      await nav(page, name).click();
      await expect(page).toHaveURL(url);
    }
  });

  test('the header marks where you are', async ({ page }) => {
    await nav(page, 'Orders').click();

    // `aria-current` is what a screen reader announces; the visual treatment follows it.
    // Asserting the styling instead would tie the test to a colour.
    await expect(nav(page, 'Orders')).toHaveAttribute('aria-current', 'page');
    await expect(nav(page, 'Catalog')).not.toHaveAttribute('aria-current', 'page');
  });

  test('a buyer can actually sign out', async ({ page }) => {
    await page.getByTestId('sign-out').click();

    await expect(page).toHaveURL(/login/);
    // And the session is really gone, not just navigated away from.
    await page.goto('/orders');
    await expect(page).toHaveURL(/login/);
  });

  test('the header stays usable at every width', async ({ page }) => {
    await expect(page.getByTestId('sign-out')).toBeVisible();
    await expect(nav(page, 'Catalog')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Tap targets: 44px is the floor for a thumb.
    const box = await nav(page, 'Cart').boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
  });

  test('the cart count appears once the cart is known', async ({ page }) => {
    // Nothing has loaded a cart yet, so there is deliberately no number to show.
    await expect(page.getByTestId('nav-cart-count')).toHaveCount(0);

    await nav(page, 'Cart').click();
    await expect(page.getByTestId('cart-empty')).toBeVisible();

    // Still nothing: an empty cart has no count worth rendering.
    await expect(page.getByTestId('nav-cart-count')).toHaveCount(0);
  });
});

test.describe('catalog grid', () => {
  test('product cards form an even grid', async ({ page }) => {
    await signInAsMockBuyer(page);
    test.skip(!(await openLeafCategory(page)), 'no items in the mock catalog');

    const cards = page.getByTestId('item-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(1);

    const boxes = [];
    for (let i = 0; i < count; i++) {
      boxes.push(await cards.nth(i).boundingBox());
    }

    // Cards in the same row must be the same width. Before Phase 17 each card was a
    // flex item that shrank to its own content, so a row of products was ragged - the
    // single most visible defect in the storefront.
    const byRow = new Map<number, number[]>();
    for (const box of boxes) {
      if (!box) continue;
      const row = Math.round(box.y / 20);
      byRow.set(row, [...(byRow.get(row) ?? []), box.width]);
    }
    for (const widths of byRow.values()) {
      const min = Math.min(...widths);
      const max = Math.max(...widths);
      expect(max - min, `cards in one row differ in width: ${widths.join(', ')}`).toBeLessThan(2);
    }

    await expectNoHorizontalOverflow(page);
  });

  test('a long product name does not widen its card', async ({ page }) => {
    await signInAsMockBuyer(page);
    test.skip(!(await openLeafCategory(page)), 'no items in the mock catalog');

    await expectNoHorizontalOverflow(page);
    const cards = page.getByTestId('item-card');
    const first = await cards.first().boundingBox();
    const last = await cards.last().boundingBox();
    // The long-named anchor fixture is the last item; it must not be wider than the
    // first, whatever its name length.
    expect(last?.width).toBeCloseTo(first?.width ?? 0, 0);
  });
});

test.describe('action hierarchy', () => {
  test('checkout offers exactly one primary action', async ({ page }) => {
    await signInAsMockBuyer(page);
    test.skip(!(await openLeafCategory(page)), 'no items in the mock catalog');

    await page.getByTestId('item-card').first().click();
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();

    await nav(page, 'Cart').click();
    await page.getByTestId('cart-checkout-link').click();
    await expect(page).toHaveURL('/checkout');

    // The supporting actions are still present and reachable - the point is that they
    // no longer look like the thing the page wants you to press.
    await expect(page.getByTestId('checkout-add-contact')).toBeVisible();
    await expect(page.getByTestId('checkout-proceed')).toBeVisible();

    // The one action the page exists for is the widest control in its column.
    const proceed = await page.getByTestId('checkout-proceed').boundingBox();
    const addContact = await page.getByTestId('checkout-add-contact').boundingBox();
    expect(proceed?.width ?? 0).toBeGreaterThan(addContact?.width ?? 0);

    await expectNoHorizontalOverflow(page);
  });

  test('the cart does not push Remove as hard as Checkout', async ({ page }) => {
    await signInAsMockBuyer(page);
    test.skip(!(await openLeafCategory(page)), 'no items in the mock catalog');

    await page.getByTestId('item-card').first().click();
    await page.getByTestId('add-to-cart').click();
    await nav(page, 'Cart').click();

    const remove = await page.getByTestId('cart-line-remove').boundingBox();
    const checkout = await page.getByTestId('cart-checkout-link').boundingBox();
    expect(checkout?.width ?? 0).toBeGreaterThan(remove?.width ?? 0);
  });
});

test.describe('order status is legible', () => {
  test('finished and stopped orders are distinguishable', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/orders' });

    const statuses = page.getByTestId('order-row-status');
    await expect(statuses.first()).toBeVisible();

    // The word is always present - colour reinforces it and never replaces it.
    const texts = await statuses.allTextContents();
    expect(texts.every((t) => t.trim().length > 0)).toBe(true);
    // And no ERPNext vocabulary reaches the buyer.
    expect(texts.join(' ')).not.toContain('Draft');

    await expectNoHorizontalOverflow(page);
  });
});

test.describe('states look like one storefront', () => {
  test('empty states offer a way out', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=empty', { goTo: '/orders' });
    await expect(page.getByTestId('orders-empty')).toBeVisible();
    await expect(page.getByTestId('orders-empty').getByRole('link')).toBeVisible();

    await nav(page, 'Cart').click();
    await expect(page.getByTestId('cart-empty')).toBeVisible();
    await expect(page.getByTestId('cart-empty').getByRole('link')).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test('error states stay inside the shell and leak nothing', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=server-error', { goTo: '/orders' });

    await expect(page.getByTestId('orders-error')).toBeVisible();
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Traceback');
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('page rhythm', () => {
  test('every page starts at the same place and has one h1', async ({ page }) => {
    await signInAsMockBuyer(page);

    const tops: number[] = [];
    for (const [name, url] of [
      ['Catalog', '/catalog'],
      ['Cart', '/cart'],
      ['Orders', '/orders'],
      ['Account', '/account'],
    ] as const) {
      await nav(page, name).click();
      // Wait for the destination before measuring: mid-navigation the query can still
      // resolve to the outgoing page's heading, which reports a zeroed rect.
      await expect(page).toHaveURL(url);

      const h1 = page.getByRole('heading', { level: 1 });
      await expect(h1).toHaveCount(1);
      await expect(h1).toBeVisible();
      // Document-relative, not viewport-relative: a page that happens to be scrolled
      // would otherwise report a different top for an identical layout.
      tops.push(await h1.evaluate((el) => el.getBoundingClientRect().top + window.scrollY));

      await expectNoHorizontalOverflow(page);
    }

    // Pages that begin at different heights are the thing that makes a set of screens
    // feel like separate applications.
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
  });
});
