import { expect, test, type Locator, type Page } from '@playwright/test';

import { signInAsMockBuyer } from './support/auth';
import { expectNoHorizontalOverflow } from './support/layout';

const MIXED = '/pages/mixed-width';

/**
 * Contained versus full-width blocks, measured in a real browser (Phase 25L).
 *
 * The unit suite proves the DOM shape; this proves the geometry that shape was for. A
 * full-width block has to genuinely reach the edges of `main`, a contained one has to
 * genuinely stop at the storefront column and line up with the page heading above it,
 * and neither may scroll the page sideways at any viewport.
 *
 * Structural relationships throughout, with a rounding tolerance - not exact pixels.
 */

const TOLERANCE = 2;

async function boxOf(target: Locator) {
  const box = await target.first().boundingBox();
  expect(box, 'element has no layout box').not.toBeNull();
  return box!;
}

/** One band on the mixed page, addressed by the containment it declares. */
function band(page: Page, width: 'contained' | 'full_width', index = 0) {
  return page.locator(`[data-testid="content-section"][data-content-width="${width}"]`).nth(index);
}

test.describe('a full-width block', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: MIXED });
    await expect(page.getByTestId('block-banner-carousel')).toBeVisible();
  });

  test('reaches the full width of main', async ({ page }) => {
    const main = await boxOf(page.getByTestId('page-main'));
    const section = await boxOf(band(page, 'full_width'));
    const hero = await boxOf(page.getByTestId('block-banner-carousel'));

    // Band spans main, and the hero spans the band - no column between them.
    expect(Math.abs(section.width - main.width)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(hero.width - section.width)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(hero.x - main.x)).toBeLessThanOrEqual(TOLERANCE);
  });

  test('opens no content column at all', async ({ page }) => {
    const section = band(page, 'full_width');

    await expect(section.locator('.yob-content-container')).toHaveCount(0);
  });

  test('still renders its block, which is the projection regression', async ({ page }) => {
    // A second `<ng-content />` per branch would leave this band empty.
    await expect(band(page, 'full_width').locator('[data-testid="page-block"]')).toHaveCount(1);
    await expect(page.getByTestId('carousel-title')).toContainText('Hero slide');
  });

  test('works for a promo grid too, not just a banner', async ({ page }) => {
    const promoBand = band(page, 'full_width', 1);
    const main = await boxOf(page.getByTestId('page-main'));
    const promo = await boxOf(promoBand.locator('[data-testid="page-block"]'));

    // `full_width` is a generic placement primitive.
    expect(Math.abs(promo.width - main.width)).toBeLessThanOrEqual(TOLERANCE);
    await expect(promoBand.getByTestId('promo-card-title')).toContainText('Edge to edge');
  });
});

test.describe('a contained block', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: MIXED });
    await expect(page.getByTestId('block-rich-text')).toBeVisible();
  });

  test('keeps its band full width and its content in the column', async ({ page, page: p }) => {
    void p;
    const main = await boxOf(page.getByTestId('page-main'));
    const section = await boxOf(band(page, 'contained'));
    const column = await boxOf(band(page, 'contained').locator('.yob-content-container'));

    expect(Math.abs(section.width - main.width)).toBeLessThanOrEqual(TOLERANCE);
    expect(column.width).toBeLessThanOrEqual(section.width);
  });

  test('is narrower than its band on a wide viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'a phone column fills the width');

    const section = await boxOf(band(page, 'contained'));
    const block = await boxOf(band(page, 'contained').locator('[data-testid="page-block"]'));

    expect(block.width).toBeLessThan(section.width);
  });

  test('lines up with the page heading, as it always did', async ({ page }) => {
    const heading = await boxOf(page.getByTestId('page-title'));
    const block = await boxOf(band(page, 'contained').locator('[data-testid="page-block"]'));

    // The Phase 25J column invariant, unchanged by this phase.
    expect(Math.abs(block.x - heading.x)).toBeLessThanOrEqual(TOLERANCE);
  });

  test('holds a product grid at the storefront width', async ({ page }) => {
    const gridBand = band(page, 'contained', 1);
    await expect(gridBand.getByTestId('block-product-grid')).toBeVisible();

    const main = await boxOf(page.getByTestId('page-main'));
    const grid = await boxOf(gridBand.locator('[data-testid="page-block"]'));

    // Cards keep the catalogue's own data; only the available width is at stake here.
    await expect(gridBand.getByTestId('item-rate').first()).toBeVisible();
    if (main.width > 900) {
      expect(grid.width).toBeLessThan(main.width);
    }
  });
});

test.describe('the mixed page as a whole', () => {
  test('gives each block its own independent containment', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: MIXED });
    await expect(page.getByTestId('block-promo-grid')).toBeVisible();

    const widths = await page
      .locator('[data-testid="content-section"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-content-width')));

    // One page, four bands, four independent decisions - not one width for the page.
    expect(widths).toEqual(['full_width', 'contained', 'contained', 'full_width']);
  });

  test('never scrolls sideways at any viewport', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: MIXED });
    await expect(page.getByTestId('block-promo-grid')).toBeVisible();

    // The reason `100vw` is banned: it ignores the scrollbar gutter.
    await expectNoHorizontalOverflow(page);
  });

  test('fits every band inside main on a phone', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: MIXED });
    await expect(page.getByTestId('block-promo-grid')).toBeVisible();

    const main = await boxOf(page.getByTestId('page-main'));
    const sections = await page
      .locator('[data-testid="content-section"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().width));

    for (const width of sections) {
      expect(width).toBeLessThanOrEqual(main.width + TOLERANCE);
    }
  });

  test('adds no catalogue request for the grid it contains', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: MIXED });
    await expect(page.getByTestId('block-product-grid')).toBeVisible();

    const calls = await page.evaluate(() => {
      const log = (globalThis as Record<string, unknown>)['__yobMockRequests'];
      if (!Array.isArray(log)) {
        return [];
      }
      return (log as { rpcMethod: string }[])
        .map((r) => r.rpcMethod)
        .filter((rpc) => rpc.startsWith('yob_storefront.api.catalog.'));
    });

    // Width is presentation metadata. It buys no data and costs no request.
    expect(calls).toEqual([]);
  });
});

test.describe('dark and full width together', () => {
  test('keeps unsurfaced text readable with no column', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/pages/dark-band' });

    const band = page.locator(
      '[data-testid="content-section"][data-section-style="dark"][data-content-width="full_width"]',
    );
    await expect(band.first()).toBeVisible();

    // The Phase 25J foreground rules key off the band, not off the column, so removing
    // the column must not reintroduce dark-on-dark.
    const title = band.locator('[data-testid="rich-text-title"]').first();
    const light = await title.evaluate((el) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = getComputedStyle(el).color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    });

    expect(light, 'dark full-width band text is not light').toBeGreaterThan(150);
    await expect(band.locator('.yob-content-container')).toHaveCount(0);
  });
});
