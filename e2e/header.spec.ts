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

test.describe('the overlay layers', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/home' });
  });

  test('the drawer is a viewport overlay, not a header dropdown', async ({ page }, info) => {
    test.skip(info.project.name === 'chromium-desktop', COMPACT_ONLY);

    await page.getByTestId('nav-hamburger').click();
    await expect(page.getByTestId('nav-drawer')).toBeVisible();

    const measured = await page.evaluate(() => {
      const drawer = document.querySelector('[data-testid="nav-drawer"]') as HTMLElement;
      const backdrop = document.querySelector(
        '[data-testid="nav-drawer-backdrop"]',
      ) as HTMLElement;
      const style = getComputedStyle(drawer);
      return {
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        drawer: drawer.getBoundingClientRect().toJSON(),
        backdrop: backdrop.getBoundingClientRect().toJSON(),
        position: style.position,
        background: style.backgroundColor,
      };
    });

    // The regression: `backdrop-filter` on the header made it the containing block for
    // fixed descendants, so this box was the height of the header (116px in an 844px
    // viewport) and the page showed through beneath it.
    expect(measured.position).toBe('fixed');
    expect(measured.drawer.height).toBeCloseTo(measured.viewportHeight, 0);
    expect(measured.drawer.top).toBeCloseTo(0, 0);

    // The backdrop covers the whole viewport, not just the header band.
    expect(measured.backdrop.height).toBeCloseTo(measured.viewportHeight, 0);
    expect(measured.backdrop.width).toBeCloseTo(measured.viewportWidth, 0);

    // Opaque, so nothing reads through it.
    expect(measured.background).toBe('rgb(255, 255, 255)');
    await expectNoHorizontalOverflow(page);
  });

  test('no page content can paint above the open drawer', async ({ page }, info) => {
    test.skip(info.project.name === 'chromium-desktop', COMPACT_ONLY);

    await page.getByTestId('nav-hamburger').click();
    await expect(page.getByTestId('nav-drawer')).toBeVisible();

    // Deep down the panel, well past the header band and over the hero content block.
    const topmost = await page.evaluate(() => {
      const el = document.elementFromPoint(60, Math.round(window.innerHeight * 0.85));
      return el?.closest('[data-testid="nav-drawer"]') !== null;
    });

    expect(topmost, 'page content painted above the drawer').toBe(true);
  });

  test('the header keeps no property that would trap a fixed overlay', async ({ page }) => {
    const style = await page.evaluate(() => {
      const header = document.querySelector('header') as HTMLElement;
      const s = getComputedStyle(header);
      return { backdropFilter: s.backdropFilter, filter: s.filter, transform: s.transform };
    });

    // Any of these makes the header the containing block for its fixed descendants, which
    // is what broke the drawer. Reintroducing one means moving the overlay out first.
    expect(style.backdropFilter).toBe('none');
    expect(style.filter).toBe('none');
    expect(style.transform).toBe('none');
  });

  test('the search panel paints above a content block, and takes the click', async ({ page }) => {
    // `/home` opens with a full-width image banner directly beneath the header, which is
    // exactly what was painting over the dropdown.
    await expect(page.getByTestId('block-image-banner')).toBeVisible();

    const input = searchInput(page);
    await input.click();
    // Every fixture product carries a `YOB-` code, so this fills the panel rather than
    // returning one short row that would sit clear of the banner and prove nothing.
    await input.fill('yob');
    const panel = page.getByTestId('product-search-panel');
    await expect(panel.getByTestId('product-suggestion').nth(3)).toBeVisible();

    const overlap = await page.evaluate(() => {
      const panelEl = document.querySelector('[data-testid="product-search-panel"]')!;
      const block = document.querySelector('[data-testid="block-image-banner"]')!;
      const p = panelEl.getBoundingClientRect();
      const b = block.getBoundingClientRect();
      const overlaps = p.bottom > b.top && p.top < b.bottom && p.right > b.left && p.left < b.right;

      // A point inside BOTH rectangles - the area the banner used to win.
      const x = Math.round(Math.max(p.left, b.left) + 8);
      const y = Math.round(Math.max(p.top, b.top) + 8);
      const hit = document.elementFromPoint(x, y);
      return {
        overlaps,
        panelWins: hit?.closest('[data-testid="product-search-panel"]') !== null,
        hit: hit?.tagName ?? 'none',
      };
    });

    expect(overlap.overlaps, 'the panel and the banner do not overlap - test proves nothing').toBe(
      true,
    );
    // Geometry alone is not enough: the panel must actually receive the pointer.
    expect(overlap.panelWins, `the content block intercepted the pointer (${overlap.hit})`).toBe(
      true,
    );

    // And a real interaction in that area still works.
    await panel.getByTestId('product-suggestion').first().click();
    await expect(page).toHaveURL('/catalog/item/hex-bolt-m10-50');
  });

  test('the search panel is not clipped by the header', async ({ page }) => {
    const input = searchInput(page);
    await input.click();
    await input.fill('bolt');
    await expect(page.getByTestId('product-search-panel')).toBeVisible();

    const measured = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="product-search-panel"]')!;
      const header = document.querySelector('header')!;
      return {
        panel: panel.getBoundingClientRect().toJSON(),
        header: header.getBoundingClientRect().toJSON(),
        headerOverflow: getComputedStyle(header).overflow,
      };
    });

    // The panel hangs below the header, which only works while nothing clips it.
    expect(measured.panel.bottom).toBeGreaterThan(measured.header.bottom);
    expect(measured.headerOverflow).toBe('visible');
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('removing a recent product', () => {
  async function rememberBolt(page: Page) {
    const input = searchInput(page);
    await input.click();
    await input.fill('bolt');
    await page.getByTestId('product-suggestion').first().click();
    await expect(page).toHaveURL('/catalog/item/hex-bolt-m10-50');
  }

  test('removes it, stays put, and it does not come back', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/home' });
    await rememberBolt(page);

    await searchInput(page).click();
    await expect(page.getByTestId('recent-heading')).toBeVisible();
    await expect(page.getByTestId('recent-remove')).toHaveCount(1);

    const before = page.url();
    await page.getByTestId('recent-remove').first().click();

    // Gone from the list, and emphatically not a navigation.
    await expect(page.getByTestId('product-suggestion')).toHaveCount(0);
    expect(page.url()).toBe(before);

    // The panel had nothing left to show, so it closed rather than leaving an empty box.
    await expect(page.getByTestId('recent-heading')).toHaveCount(0);

    // Still absent when the buyer comes back to the box.
    await searchInput(page).click();
    await expect(page.getByTestId('recent-heading')).toHaveCount(0);
  });

  test('is offered on recent rows only, never on live suggestions', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/home' });
    await rememberBolt(page);

    const input = searchInput(page);
    await input.click();
    await expect(page.getByTestId('recent-remove')).toHaveCount(1);

    await input.fill('nut');
    await expect(page.getByTestId('suggestion-name').first()).toContainText('Nut');
    // A server suggestion is not the buyer's list; there is nothing there to remove.
    await expect(page.getByTestId('recent-remove')).toHaveCount(0);
  });
});
