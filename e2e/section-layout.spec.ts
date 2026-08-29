import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer } from './support/auth';
import { expectNoHorizontalOverflow } from './support/layout';

/**
 * Full-width bands with a fixed column inside, measured in a real browser (Phase 25J).
 *
 * The unit suite proves the DOM relationship; this proves the geometry that relationship
 * was for. A band has to be genuinely wider than its content on a desktop, genuinely
 * still full width on a phone, and never wide enough to scroll the page sideways.
 */

/**
 * A **contained** band and its column, as the browser actually laid them out.
 *
 * Scoped to `contained` since Phase 25L: a placement may now declare `full_width`, which
 * deliberately opens no column at all, and these assertions are about the column. The
 * full-width geometry is measured in `content-width.spec.ts`.
 */
async function band(page: Page, index = 0) {
  const section = page
    .locator('[data-testid="content-section"][data-content-width="contained"]')
    .nth(index);
  await expect(section).toBeVisible();

  const outer = await section.boundingBox();
  const inner = await section.locator('.yob-content-container').first().boundingBox();
  const main = await page.getByTestId('page-main').boundingBox();
  expect(outer).not.toBeNull();
  expect(inner).not.toBeNull();
  expect(main).not.toBeNull();

  return { outer: outer!, inner: inner!, main: main! };
}

test.describe('a content band', () => {
  test('spans the full width of main', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/home' });
    const { outer, main } = await band(page);

    // Same left edge and same width as main - the band is not inset by a column.
    expect(Math.abs(outer.x - main.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(outer.width - main.width)).toBeLessThanOrEqual(1);
  });

  test('keeps its content in the storefront column', async ({ page }, testInfo) => {
    await signInAsMockBuyer(page, { goTo: '/home' });
    const { outer, inner } = await band(page);

    // The column is centred inside the band.
    const leftGap = inner.x - outer.x;
    const rightGap = outer.x + outer.width - (inner.x + inner.width);
    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(1);

    // On a wide viewport the band must be visibly wider than its content, which is the
    // whole point. On a phone the column fills the width and only padding separates
    // them, so the assertion is that it never exceeds the band.
    if (testInfo.project.name === 'chromium-desktop') {
      expect(inner.width).toBeLessThan(outer.width);
    }
    expect(inner.width).toBeLessThanOrEqual(outer.width);
  });

  test('lines its column up with the page heading and the footer', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/pages/about-us' });

    const heading = await page.getByTestId('page-title').boundingBox();
    const column = await page
      .locator(
        '[data-testid="content-section"][data-content-width="contained"] [data-testid="page-block"]',
      )
      .first()
      .boundingBox();
    const footer = await page.getByRole('contentinfo').locator('div').first().boundingBox();

    expect(heading).not.toBeNull();
    expect(column).not.toBeNull();
    expect(footer).not.toBeNull();
    // One column, three places. This is the invariant Phase 17 established and this
    // phase had to carry through a full-width main.
    expect(Math.abs(column!.x - heading!.x)).toBeLessThanOrEqual(1);
    // The footer note is measured at its container, so its text edge is that box plus
    // the shared horizontal padding - the same padding the column above it uses.
    const padding = await page
      .locator('.yob-content-container')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    expect(Math.abs(column!.x - (footer!.x + padding))).toBeLessThanOrEqual(1);
  });

  test('gives consecutive blocks their own independent bands', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/pages/about-us' });

    const styles = await page
      .locator('[data-testid="content-section"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-section-style')));

    // The fixture places all five bands on one page, in order, each its own section.
    expect(styles).toEqual(['dark', 'muted', 'brand_soft', 'accent', 'default']);
  });

  test('paints a dark band with a legible foreground', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/home' });

    const dark = page.locator('[data-testid="content-section"][data-section-style="dark"]').first();
    await expect(dark).toBeVisible();

    const background = await dark.evaluate((el) => getComputedStyle(el).backgroundColor);
    // A real surface, not transparent.
    expect(background).not.toBe('rgba(0, 0, 0, 0)');

    // The foreground is asserted properly in `dark-section.spec.ts`, against a fixture
    // that actually puts text on a dark band. The conditional that used to stand here
    // was vacuous: `/home`'s dark band is an image banner with no text in it, so the
    // assertion never ran.
  });

  test('leaves a default band with no surface of its own', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/home' });

    const plain = page
      .locator('[data-testid="content-section"][data-section-style="default"]')
      .first();
    await expect(plain).toBeVisible();

    // `default` is the ordinary page background: whatever existed before this phase.
    const background = await plain.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background).toBe('rgba(0, 0, 0, 0)');
  });

  test('never scrolls the page sideways', async ({ page }) => {
    for (const url of ['/home', '/pages/about-us', '/cart', '/catalog/fasteners']) {
      await signInAsMockBuyer(page, { goTo: url, expectUrl: false });
      await expectNoHorizontalOverflow(page);
    }
  });
});

test.describe('the application keeps its own column', () => {
  const PAGES = [
    ['/catalog', 'catalog-section'],
    ['/cart', 'cart-section'],
    ['/orders', 'orders-section'],
    ['/account', 'account-section'],
  ] as const;

  for (const [url, hook] of PAGES) {
    test(`${url} content stays at the storefront width`, async ({ page }) => {
      await signInAsMockBuyer(page, { goTo: url });

      const section = page.locator(`section.${hook}`).first();
      await expect(section).toBeVisible();

      const outer = await section.boundingBox();
      const inner = await section.locator('.yob-content-container').first().boundingBox();
      const main = await page.getByTestId('page-main').boundingBox();

      // The band spans main; the functionality inside it does not.
      expect(Math.abs(outer!.width - main!.width)).toBeLessThanOrEqual(1);
      expect(inner!.width).toBeLessThanOrEqual(outer!.width);
      await expectNoHorizontalOverflow(page);
    });
  }

  test('the header and footer are untouched by the refactor', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog' });

    const headerColumn = await page
      .getByTestId('secure-header')
      .locator('.yob-content-container')
      .first()
      .boundingBox();
    const pageColumn = await page
      .locator('section.catalog-section .yob-content-container')
      .first()
      .boundingBox();

    // The header's column and the page's column are the same column - the invariant the
    // shared container exists to guarantee.
    //
    // Measured on the containers rather than on the brand text since Phase 26B: below
    // 1024px a hamburger precedes the brand, so the brand is legitimately no longer the
    // leftmost thing in the row. The columns still align, which is the actual promise.
    expect(Math.abs(headerColumn!.x - pageColumn!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(headerColumn!.width - pageColumn!.width)).toBeLessThanOrEqual(1);
  });
});
