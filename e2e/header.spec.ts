import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';
import { expectNoHorizontalOverflow } from './support/layout';

/**
 * The storefront header, in a real browser (Phase 26B).
 *
 * The unit suite proves structure and request behaviour; this proves the geometry and the
 * interactions that structure was for - that the search box is genuinely usable, that a
 * phone shows an icon and not a name, and that Enter really does nothing.
 *
 * The desktop row starts at `lg` (1024px), so the 768px tablet viewport deliberately gets
 * the phone layout: a brand, navigation, a usable search box, a cart and a name do not
 * fit at that width, and the casualty would have been the search box.
 */

const DESKTOP_ONLY = 'the single-row header starts at 1024px';
const COMPACT_ONLY = 'the two-row header applies below 1024px';

/** Every suggestion request the browser actually made, in order. */
async function suggestionSearches(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const log = (globalThis as Record<string, unknown>)['__yobMockRequests'];
    if (!Array.isArray(log)) {
      return [];
    }
    return (log as { rpcMethod: string; params: Record<string, string> }[])
      .filter((r) => r.rpcMethod === 'yob_storefront.api.catalog.get_product_suggestions')
      .map((r) => r.params['search'] ?? '');
  });
}

/** The search input this viewport actually shows. */
function searchInput(page: Page) {
  return page.locator('[data-testid="product-search-input"]:visible').first();
}

test.describe('desktop header', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', DESKTOP_ONLY);
    await signInAsMockBuyer(page, { goTo: '/home' });
  });

  test('lays out brand, navigation, search, cart and user in that order', async ({ page }) => {
    const box = async (testId: string) => {
      const b = await page.getByTestId(testId).first().boundingBox();
      expect(b, `${testId} has no layout box`).not.toBeNull();
      return b!;
    };

    const brand = await box('brand-link');
    const nav = await box('desktop-nav');
    const search = await box('desktop-search');
    const cart = await box('cart-action');
    const user = await box('user-menu-trigger');

    // Relative order across the row, not exact pixels.
    expect(brand.x).toBeLessThan(nav.x);
    expect(nav.x).toBeLessThan(search.x);
    expect(search.x + search.width).toBeLessThanOrEqual(cart.x + 1);
    expect(cart.x).toBeLessThan(user.x);
  });

  test('gives the search box a genuinely usable width', async ({ page }) => {
    const search = await searchInput(page).boundingBox();

    // It takes the flexible middle rather than collapsing to an icon.
    expect(search!.width).toBeGreaterThan(200);
    await expect(searchInput(page)).toBeVisible();
  });

  test('shows the username, and keeps it from breaking the row', async ({ page }) => {
    await expect(page.getByTestId('user-menu-name')).toBeVisible();
    await expect(page.getByTestId('user-menu-name')).toHaveText('Mock Buyer');

    const name = await page.getByTestId('user-menu-name').boundingBox();
    const header = await page.getByTestId('secure-header').boundingBox();
    expect(name!.width).toBeLessThan(header!.width / 3);
    await expectNoHorizontalOverflow(page);
  });

  test('opens the user menu and navigates from it', async ({ page }) => {
    await page.getByTestId('user-menu-trigger').click();
    await expect(page.getByTestId('user-menu-panel')).toBeVisible();

    await page.locator('[data-testid="user-menu-link"][data-label="Orders"]').click();
    await expect(page).toHaveURL('/orders');
    await expect(page.getByRole('heading', { name: 'Your orders' })).toBeVisible();
  });

  test('keeps the cart reachable', async ({ page }) => {
    await page.getByTestId('cart-action').click();

    await expect(page).toHaveURL('/cart');
    await expect(page.getByRole('heading', { name: 'Your cart', exact: true })).toBeVisible();
  });
});

test.describe('compact header', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium-desktop', COMPACT_ONLY);
    await signInAsMockBuyer(page, { goTo: '/home' });
  });

  test('shows hamburger, brand, cart and a user icon - and no username', async ({ page }) => {
    await expect(page.getByTestId('nav-hamburger')).toBeVisible();
    await expect(page.getByTestId('brand-link')).toBeVisible();
    await expect(page.getByTestId('cart-action')).toBeVisible();
    await expect(page.getByTestId('user-menu-trigger')).toBeVisible();

    // Locked requirement: the icon alone. No `nile1483` beside an avatar.
    await expect(page.getByTestId('user-menu-name')).toBeHidden();
    await expect(page.getByTestId('desktop-nav')).toBeHidden();
  });

  test('puts search on its own second row, full width', async ({ page }) => {
    const brand = await page.getByTestId('brand-link').boundingBox();
    const search = await searchInput(page).boundingBox();
    const header = await page.getByTestId('secure-header').boundingBox();

    // Below the brand row, and spanning the header's own column.
    expect(search!.y).toBeGreaterThan(brand!.y + brand!.height - 1);
    expect(search!.width).toBeGreaterThan(header!.width * 0.7);
    await expectNoHorizontalOverflow(page);
  });

  test('opens the merchant drawer, expands a group and navigates', async ({ page }) => {
    await page.getByTestId('nav-hamburger').click();
    await expect(page.getByTestId('nav-drawer')).toBeVisible();

    await page.locator('[data-testid="drawer-group"][data-label="Tools"]').click();
    await page.locator('[data-testid="drawer-link"][data-label="Fasteners"]').click();

    await expect(page).toHaveURL('/catalog/fasteners');
    // A drawer left open over the page a buyer just chose is a bug.
    await expect(page.getByTestId('nav-drawer')).toHaveCount(0);
  });

  test('opens the user menu independently of the drawer', async ({ page }) => {
    await page.getByTestId('user-menu-trigger').click();

    await expect(page.getByTestId('user-menu-panel')).toBeVisible();
    await expect(page.getByTestId('nav-drawer')).toHaveCount(0);
  });

  test('never scrolls sideways', async ({ page }) => {
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('product typeahead', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/home' });
  });

  test('asks for nothing until the third character', async ({ page }) => {
    const input = searchInput(page);
    await input.click();
    await input.pressSequentially('bo', { delay: 60 });
    await page.waitForTimeout(600);

    // Two characters can only ever return nothing, so the request is never made.
    expect(await suggestionSearches(page)).toEqual([]);

    await input.pressSequentially('l', { delay: 60 });

    // Polled on the request log rather than on the panel: what this test asserts is the
    // request, so waiting for anything else is waiting for the wrong thing.
    await expect.poll(() => suggestionSearches(page)).toEqual(['bol']);
  });

  test('debounces rather than asking per keystroke', async ({ page }) => {
    const input = searchInput(page);
    await input.click();
    await input.pressSequentially('bolt', { delay: 20 });

    await expect.poll(() => suggestionSearches(page).then((s) => s.at(-1))).toBe('bolt');

    // Four keystrokes, at most two requests: the debounce is doing its job.
    const searches = await suggestionSearches(page);
    expect(searches.length).toBeLessThanOrEqual(2);
  });

  test('opens a product from a suggestion, and shows no price on the way', async ({ page }) => {
    const input = searchInput(page);
    await input.click();
    await input.fill('bolt');

    const panel = page.getByTestId('product-search-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('suggestion-name').first()).toContainText('Hex Bolt');
    await expect(panel.getByTestId('suggestion-code').first()).toContainText('YOB-BOLT');
    await expect(panel).not.toContainText('₹');

    await panel.getByTestId('product-suggestion').first().click();

    await expect(page).toHaveURL('/catalog/item/hex-bolt-m10-50');
    // The dropdown does not follow the buyer onto the page they chose.
    await expect(page.getByTestId('product-search-panel')).toHaveCount(0);
  });

  test('offers the product again as a recent result', async ({ page }) => {
    const input = searchInput(page);
    await input.click();
    await input.fill('bolt');
    await page.getByTestId('product-suggestion').first().click();
    await expect(page).toHaveURL('/catalog/item/hex-bolt-m10-50');

    await searchInput(page).click();

    await expect(page.getByTestId('recent-heading')).toBeVisible();
    await expect(page.getByTestId('suggestion-name').first()).toContainText('Hex Bolt');
  });

  test('uses only the suggestion endpoint to discover products', async ({ page }) => {
    const input = searchInput(page);
    await input.click();
    await input.fill('bolt');
    await expect(page.getByTestId('product-search-panel')).toBeVisible();

    const rpcs = await page.evaluate(() => {
      const log = (globalThis as Record<string, unknown>)['__yobMockRequests'];
      if (!Array.isArray(log)) {
        return [];
      }
      return (log as { rpcMethod: string }[]).map((r) => r.rpcMethod);
    });

    expect(rpcs.filter((rpc) => rpc.endsWith('catalog.get_items'))).toEqual([]);
    expect(rpcs.filter((rpc) => rpc.endsWith('catalog.get_item'))).toEqual([]);
    expect(rpcs.filter((rpc) => rpc.endsWith('resolve_variant'))).toEqual([]);
  });

  test('says so plainly when nothing matches', async ({ page }) => {
    const input = searchInput(page);
    await input.click();
    await input.fill('zzzzzz');

    await expect(page.getByTestId('product-search-empty')).toBeVisible();
  });

  test('survives a failing suggestion endpoint', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=product-suggestions-unavailable', {
      goTo: '/home',
    });

    const input = searchInput(page);
    await input.click();
    await input.fill('bolt');
    await expect(page.getByTestId('product-search-failed')).toBeVisible();

    // Nothing raw from the server reaches the buyer, and the header keeps working.
    await expect(page.getByTestId('product-search-failed')).not.toContainText('internal');
    await expect(page.getByTestId('cart-action')).toBeVisible();
    await page.getByTestId('user-menu-trigger').click();
    await expect(page.getByTestId('user-menu-panel')).toBeVisible();
  });
});

test.describe('Enter does nothing', () => {
  test('stays exactly where it was', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/home' });

    const input = searchInput(page);
    await input.click();
    await input.fill('bolt');
    await expect(page.getByTestId('product-search-panel')).toBeVisible();

    const before = page.url();
    await input.press('Enter');
    await page.waitForTimeout(400);

    // No results page, no `/search`, no opening the first result. This is the one
    // interaction the feature deliberately does not have.
    expect(page.url()).toBe(before);
    expect(page.url()).not.toContain('/catalog/item/');
    expect(page.url()).not.toContain('search=');
  });
});
