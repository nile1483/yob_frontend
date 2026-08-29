import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer } from './support/auth';
import { expectNoHorizontalOverflow } from './support/layout';

/** Four gallery rows, primary second. See `GALLERY_BY_SLUG` in the catalog fixture. */
const BOLT = '/catalog/item/hex-bolt-m10-50';
/** Eight rows, no primary - the scrolling strip. */
const NUT = '/catalog/item/hex-nut-m10';
/** One row only, so no strip is drawn. */
const ANCHOR = '/catalog/item/through-bolt-anchor-m12-120';
/** No gallery and no base image at all - the placeholder path. */
const WASHER = '/catalog/item/flat-washer-m10';

function thumbs(page: Page) {
  return page.getByTestId('product-gallery-thumb');
}

function mainImage(page: Page) {
  return page.getByTestId('item-image').locator('img');
}

/**
 * Every RPC the app has made so far, read from the mock's own log.
 *
 * The mock answers inside `HttpClient`, so nothing reaches the network; the log records
 * each call at the mock's server boundary, which is what "did the gallery ask the
 * backend anything?" actually means.
 */
async function rpcCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const log = (globalThis as Record<string, unknown>)['__yobMockRequests'] as
      | { rpcMethod: string }[]
      | undefined;
    return (log ?? []).map((record) => record.rpcMethod);
  });
}

/**
 * The product gallery in a real browser (Phase 27C).
 *
 * The unit suite proves the rules; this proves they survive a real layout, a real click
 * and a real network. Three things are only observable here: that the strip scrolls
 * inside its own box rather than widening the document, that changing a thumbnail costs
 * no request, and that the page's URL does not move when it does.
 */
test.describe('product gallery', () => {
  test('renders the merchant order and opens on the primary', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    await expect(thumbs(page)).toHaveCount(4);

    // Backend order is Side / Front / Back / Detail with Front primary. The strip keeps
    // that order and the preview opens on the second row - primacy is not position.
    await expect(thumbs(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(thumbs(page).nth(0)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('product-gallery-caption')).toHaveText('Front view');
  });

  test('does not fold the base item image into the gallery', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    // The bolt has a base `image` as well as four gallery rows. Four thumbnails, not
    // five: the base image is a fallback, never a row.
    await expect(thumbs(page)).toHaveCount(4);
  });

  test('changing a thumbnail changes the image and caption, and nothing else', async ({
    page,
  }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    const before = await mainImage(page).getAttribute('src');
    const url = page.url();

    // Read from the mock's own log, not from `page.on('request')`. The mock answers
    // INSIDE HttpClient, so an API call never reaches the network and a browser request
    // event never fires for one - counting those would pass no matter what the gallery
    // did.
    const rpcBefore = await rpcCalls(page);

    await thumbs(page).nth(0).click();

    await expect(mainImage(page)).not.toHaveAttribute('src', before ?? '');
    await expect(page.getByTestId('product-gallery-caption')).toHaveText('Side view');
    await expect(thumbs(page).nth(0)).toHaveAttribute('aria-pressed', 'true');

    await thumbs(page).nth(2).click();
    await expect(page.getByTestId('product-gallery-caption')).toHaveText('Thread detail');

    // No navigation, and no backend call of any kind. The gallery arrived with get_item.
    expect(page.url()).toBe(url);
    expect(await rpcCalls(page)).toEqual(rpcBefore);
  });

  test('omits the caption row for an image that has none', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    // The fourth row has neither alt text nor caption.
    await thumbs(page).nth(3).click();

    await expect(page.getByTestId('product-gallery-caption')).toHaveCount(0);
    // Blank alt falls back to the product's name, never to a code.
    await expect(mainImage(page)).toHaveAttribute('alt', 'Hex Bolt M10 x 50mm');
  });

  test('draws no strip for a single configured image', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: ANCHOR });

    await expect(page.getByTestId('item-image')).toBeVisible();
    await expect(page.getByTestId('product-gallery-thumbs')).toHaveCount(0);
  });

  test('falls back to the shared placeholder with no gallery and no image', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: WASHER });

    await expect(page.getByTestId('item-image-placeholder')).toBeVisible();
    await expect(page.getByTestId('product-gallery-thumbs')).toHaveCount(0);
  });

  test('keeps eight thumbnails reachable without widening the page', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: NUT });

    await expect(thumbs(page)).toHaveCount(8);

    // The strip scrolls inside its own box. That is what keeps the document from
    // gaining a horizontal scrollbar, which is asserted separately below.
    const strip = page.getByTestId('product-gallery-thumbs');
    const overflow = await strip.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      overflowX: getComputedStyle(node).overflowX,
    }));
    expect(overflow.overflowX).toBe('auto');

    await expectNoHorizontalOverflow(page);

    // The last one is genuinely selectable, whether or not it started in view.
    await thumbs(page).nth(7).scrollIntoViewIfNeeded();
    await thumbs(page).nth(7).click();
    await expect(thumbs(page).nth(7)).toHaveAttribute('aria-pressed', 'true');

    // No primary anywhere in this gallery, so it opened on the first row.
    expect(overflow.scrollWidth).toBeGreaterThan(0);
  });

  test('the large image stays inside the product column', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    const image = await page.getByTestId('item-image').boundingBox();
    const container = await page.locator('.yob-content-container').first().boundingBox();

    expect(image).not.toBeNull();
    expect(container).not.toBeNull();
    expect(image!.x).toBeGreaterThanOrEqual(container!.x - 1);
    expect(image!.x + image!.width).toBeLessThanOrEqual(container!.x + container!.width + 1);
  });

  test('a new product starts from its own opening image', async ({ page }) => {
    // Navigated client-side throughout. A `page.goto` between products would be a fresh
    // document - it would restart the app and drop the mock session, and it would also
    // prove nothing: the reset must happen because the routed product changed, not
    // because the page reloaded.
    await signInAsMockBuyer(page, { goTo: '/catalog/fasteners' });
    await page.getByRole('link', { name: 'Hex Bolt M10 x 50mm' }).click();
    await expect(page).toHaveURL(BOLT);

    // Choose something that is neither the primary nor the first.
    await thumbs(page).nth(2).click();
    await expect(thumbs(page).nth(2)).toHaveAttribute('aria-pressed', 'true');

    await page.goBack();
    await page.getByRole('link', { name: 'Hex Nut M10' }).click();
    await expect(page).toHaveURL(NUT);

    // The nut has eight rows and no primary at all, so it opens on its first - not on
    // the position left behind on the bolt.
    await expect(thumbs(page)).toHaveCount(8);
    await expect(thumbs(page).nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(thumbs(page).nth(2)).toHaveAttribute('aria-pressed', 'false');

    // ...and returning to the bolt opens on the bolt's own primary.
    await page.goBack();
    await page.getByRole('link', { name: 'Hex Bolt M10 x 50mm' }).click();
    await expect(page).toHaveURL(BOLT);
    await expect(thumbs(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
  });

  test('every thumbnail is a real, keyboard-reachable button', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    for (const handle of await thumbs(page).all()) {
      expect(await handle.evaluate((node) => node.tagName)).toBe('BUTTON');
    }

    // Named by position, total and what the picture shows.
    await expect(thumbs(page).nth(0)).toHaveAttribute('aria-label', /1.*4.*side/i);

    await thumbs(page).nth(0).focus();
    await page.keyboard.press('Enter');
    await expect(thumbs(page).nth(0)).toHaveAttribute('aria-pressed', 'true');
  });

  test('works at a compact viewport without overflowing', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: NUT });

    await expect(thumbs(page)).toHaveCount(8);
    await expectNoHorizontalOverflow(page);

    // Touch-friendly: the strip's buttons are not hairlines on a phone.
    const box = await thumbs(page).nth(0).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(40);
    expect(box!.height).toBeGreaterThanOrEqual(40);
  });
});
