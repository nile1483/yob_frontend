import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';

const FAMILY = '/catalog/item/hi-vis-safety-vest';

/**
 * Merchant content inside application routes, in a real browser (Phase 25H).
 *
 * Phase 25E already proves each block renderer in depth, so nothing here re-tests a
 * carousel or a sanitiser. What is new - and what these cover - is that the same blocks
 * appear at fixed positions inside pages that have their own behaviour, cost one request
 * per route, and cannot damage the page they sit in.
 */

/**
 * One RPC as Angular composed it, read from the mock's request log.
 *
 * The mock answers **inside** `HttpClient`, so nothing reaches the network and
 * `page.waitForRequest` would wait for ever. The log records each call at the mock's
 * server boundary, one step before the socket.
 */
async function routeContentCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const log = (globalThis as Record<string, unknown>)['__yobMockRequests'];
    if (!Array.isArray(log)) {
      return [];
    }
    return (log as { rpcMethod: string; params: Record<string, string> }[])
      .filter((record) => record.rpcMethod === 'yob_storefront.api.cms.get_route_content')
      .map((record) => record.params['route_key'] ?? '');
  });
}

function slot(page: Page, routeKey: string, slotKey: string) {
  return page.locator(
    `[data-testid="content-slot"][data-route="${routeKey}"][data-slot="${slotKey}"]`,
  );
}

test.describe('home', () => {
  test('is where an unqualified sign-in lands', async ({ page }) => {
    await signInAsMockBuyer(page);

    await expect(page).toHaveURL('/home');
    await expect(page.getByTestId('home-page')).toBeVisible();
  });

  test('shows all three regions, in source order', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/home' });

    await expect(slot(page, 'home', 'hero')).toBeVisible();
    await expect(slot(page, 'home', 'main')).toBeVisible();
    await expect(slot(page, 'home', 'bottom')).toBeVisible();

    const order = await page
      .locator('[data-testid="content-slot"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-slot')));
    expect(order).toEqual(['hero', 'main', 'bottom']);
  });

  test('costs exactly one route-content request for all three', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/home' });
    await expect(slot(page, 'home', 'bottom')).toBeVisible();

    expect(await routeContentCalls(page)).toEqual(['home']);
  });

  test('renders Product Grid cards with the backend own price and unit', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/home' });

    const grid = page.getByTestId('block-product-grid');
    await expect(grid).toBeVisible();

    // A simple item: the authoritative rate and the selling UOM, neither computed here.
    await expect(grid.getByTestId('item-rate').first()).toContainText('240');
    await expect(grid.getByTestId('item-uom').first()).toContainText('Nos');

    // A family: Select options and no money at all.
    await expect(grid.getByTestId('item-select-options')).toBeVisible();
  });

  test('adds no catalogue or pricing request for those cards', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/home' });
    await expect(page.getByTestId('block-product-grid')).toBeVisible();

    const catalogCalls = await page.evaluate(() => {
      const log = (globalThis as Record<string, unknown>)['__yobMockRequests'];
      if (!Array.isArray(log)) {
        return [];
      }
      return (log as { rpcMethod: string }[])
        .map((record) => record.rpcMethod)
        .filter((rpc) => rpc.startsWith('yob_storefront.api.catalog.'));
    });

    expect(catalogCalls).toEqual([]);
  });

  test('navigates away from a merchant destination', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/home' });

    // The hero banner links at a category, through the shared destination handling.
    await slot(page, 'home', 'hero').getByTestId('destination-link').first().click();

    await expect(page).toHaveURL('/catalog/fasteners');
    await expect(page.getByTestId('category-title')).toBeVisible();
  });

  test('reaches a Storefront Page from a promo card, on the client-built route', async ({
    page,
  }) => {
    await signInAsMockBuyer(page, { goTo: '/home' });

    const promo = slot(page, 'home', 'bottom').locator(
      '[data-destination-type="storefront_page"]',
    );
    await expect(promo).toHaveAttribute('href', '/pages/support');

    await promo.click();
    await expect(page).toHaveURL('/pages/support');
  });
});

test.describe('cart', () => {
  test('shows both placements around a working cart', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/cart' });

    await expect(slot(page, 'cart', 'above_cart')).toContainText('Free delivery');
    await expect(slot(page, 'cart', 'below_cart')).toBeVisible();

    // The cart is still the page, and still the authority on it.
    await expect(page.getByRole('heading', { name: 'Your cart', exact: true })).toBeVisible();
  });

  test('asks once, for the cart route only', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/cart' });
    await expect(slot(page, 'cart', 'below_cart')).toBeVisible();

    // Two slots on the page, one response.
    expect(await routeContentCalls(page)).toEqual(['cart']);
  });
});

test.describe('category', () => {
  test('places content alongside the merchandising filters, changing neither', async ({
    page,
  }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/fasteners' });

    await expect(slot(page, 'category', 'above_listing')).toContainText('Bulk pricing');

    // Phase 25D, untouched: the category's own Filter Set still projects its facets,
    // and filtering still drives the listing through the URL. Small screens keep the
    // panel behind a disclosure, so open it where this viewport has one.
    const toggle = page.getByTestId('filters-toggle');
    if ((await toggle.count()) > 0 && (await toggle.isVisible())) {
      await toggle.click();
    }

    const material = page.locator('[data-testid="filter-value"][data-filter="material"]').first();
    await material.check();

    await expect(page).toHaveURL(/storefront_filters=/);
    await expect(page.getByTestId('item-grid')).toBeVisible();
    // The placement is route-level, so it survives a filter change untouched.
    await expect(slot(page, 'category', 'above_listing')).toContainText('Bulk pricing');
  });

  test('does not send the category slug to the content endpoint', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/fasteners' });
    await expect(slot(page, 'category', 'above_listing')).toBeVisible();

    const urls = await page.evaluate(() => {
      const log = (globalThis as Record<string, unknown>)['__yobMockRequests'];
      if (!Array.isArray(log)) {
        return [];
      }
      return (log as { rpcMethod: string; urlWithParams: string }[])
        .filter((r) => r.rpcMethod === 'yob_storefront.api.cms.get_route_content')
        .map((r) => r.urlWithParams);
    });

    // Route content is generic for the route TYPE in this phase, not per category.
    expect(urls).toHaveLength(1);
    expect(urls[0]).not.toContain('fasteners');
    expect(urls[0]).toContain('route_key=category');
  });
});

test.describe('product', () => {
  test('coexists with variant resolution and adds the resolved SKU only', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });

    await expect(slot(page, 'product', 'below_product')).toContainText('Need a different size');

    await page
      .locator('[data-testid="item-attribute-value"][data-attribute="Colour"][data-value="Orange"]')
      .click();
    await page
      .locator('[data-testid="item-attribute-value"][data-attribute="Size"][data-value="Medium"]')
      .click();

    await expect(page.getByTestId('add-to-cart')).toBeEnabled();
    await page.getByTestId('add-to-cart').click();

    const addBodies = await page.evaluate(() => {
      const log = (globalThis as Record<string, unknown>)['__yobMockRequests'];
      if (!Array.isArray(log)) {
        return [];
      }
      return (log as { rpcMethod: string; body: unknown }[])
        .filter((r) => r.rpcMethod === 'yob_storefront.api.cart.add_to_cart')
        .map((r) => r.body);
    });

    // Content placement changed nothing about what a buyer sends: the resolved SKU and
    // a quantity, and never a unit, warehouse or price.
    expect(addBodies).toHaveLength(1);
    expect(Object.keys(addBodies[0] as Record<string, unknown>).sort()).toEqual([
      'item_code',
      'qty',
    ]);
  });

  test('asks for the product route once, not per variant resolution', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });
    await expect(slot(page, 'product', 'below_product')).toBeVisible();

    await page
      .locator('[data-testid="item-attribute-value"][data-attribute="Colour"][data-value="Orange"]')
      .click();
    await page
      .locator('[data-testid="item-attribute-value"][data-attribute="Size"][data-value="Medium"]')
      .click();
    await expect(page.getByTestId('add-to-cart')).toBeEnabled();

    expect(await routeContentCalls(page)).toEqual(['product']);
  });
});

test.describe('orders', () => {
  test('places content around the list without altering it', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/orders' });

    await expect(slot(page, 'orders', 'above_list')).toContainText('before 3pm');
    await expect(page.getByTestId('order-row').first()).toBeVisible();

    expect(await routeContentCalls(page)).toEqual(['orders']);
  });

  test('places content around an order without altering the document', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/orders' });
    await page.getByTestId('order-row').first().click();

    await expect(page.getByTestId('order-name')).toBeVisible();
    await expect(slot(page, 'order_detail', 'below_order')).toContainText('Quote its number');

    // The order's own numbers are the backend's, and content sits beside them.
    await expect(page.getByTestId('order-grand-total')).toBeVisible();
  });
});

test.describe('when route content fails', () => {
  test('the host page still works, and says nothing about it', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=route-content-unavailable', { goTo: '/cart' });

    // No placement anywhere...
    await expect(page.locator('[data-testid="content-slot"]')).toHaveCount(0);
    // ...and no apology for content the buyer never asked to see.
    await expect(page.getByText('Free delivery')).toHaveCount(0);

    // The cart is entirely operational: its own heading, and its own state for a cart
    // with nothing in it. A failed banner took nothing away from it.
    await expect(page.getByRole('heading', { name: 'Your cart', exact: true })).toBeVisible();
    await expect(page.getByTestId('cart-empty')).toBeVisible();
  });

  test('a failed route is not retried', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=route-content-unavailable', { goTo: '/cart' });
    await expect(page.getByRole('heading', { name: 'Your cart', exact: true })).toBeVisible();

    const before = (await routeContentCalls(page)).length;
    await page.waitForTimeout(500);

    expect((await routeContentCalls(page)).length).toBe(before);
    expect(before).toBe(1);
  });
});

test.describe('excluded flows', () => {
  for (const url of ['/checkout', '/terms']) {
    test(`carries no placement on ${url}`, async ({ page }) => {
      await signInAsMockBuyer(page, { goTo: url, expectUrl: false });

      await expect(page.locator('[data-testid="content-slot"]')).toHaveCount(0);
      expect(await routeContentCalls(page)).toEqual([]);
    });
  }
});
