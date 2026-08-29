import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer } from './support/auth';
import { expectNoHorizontalOverflow } from './support/layout';

/** Three sections, all six block types, mixed order. See `CONTENT_BY_SLUG`. */
const BOLT = '/catalog/item/hex-bolt-m10-50';
/** One download with a blank label and description - the fallback path. */
const NUT = '/catalog/item/hex-nut-m10';
/** No content configured at all. */
const WASHER = '/catalog/item/flat-washer-m10';
const FAMILY = '/catalog/item/hi-vis-safety-vest';

function sections(page: Page) {
  return page.getByTestId('product-content-section');
}

function blocks(page: Page) {
  return page.getByTestId('product-content-block');
}

/**
 * Every RPC the app has made so far, read from the mock's own log.
 *
 * `page.on('request')` is the wrong instrument here and would pass vacuously: the mock
 * answers **inside** `HttpClient`, so an API call never reaches the network and the
 * browser never emits a request event for one. The log records each call at the mock's
 * server boundary, which is the thing being counted.
 */
async function rpcCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const log = (globalThis as Record<string, unknown>)['__yobMockRequests'] as
      | { rpcMethod: string }[]
      | undefined;
    return (log ?? []).map((record) => record.rpcMethod);
  });
}

/** One attribute value button, by attribute and value. */
function option(page: Page, attribute: string, value: string) {
  return page.locator(
    `[data-testid="item-attribute-value"][data-attribute="${attribute}"][data-value="${value}"]`,
  );
}

/**
 * Product detail content in a real browser (Phase 27D).
 *
 * The unit suite proves the rules. Three things are only observable here: that a wide
 * table scrolls inside its box rather than widening the document, that rendering all six
 * block types costs no API call, and that no iframe or provider script is created by a
 * video block whatever the merchant put in it.
 */
test.describe('product detail content', () => {
  test('renders every section and block in the merchant order', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    await expect(sections(page)).toHaveCount(3);
    await expect(sections(page).nth(0)).toHaveAttribute('data-section-title', 'Description');
    await expect(sections(page).nth(1)).toHaveAttribute('data-section-title', 'Specifications');
    await expect(sections(page).nth(2)).toHaveAttribute('data-section-title', 'Resources');

    // Mixed types, in the exact order configured - nothing grouped images together or
    // pushed the downloads to the end.
    const types = await blocks(page).evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-block-type')),
    );
    expect(types).toEqual([
      'rich_text',
      'image',
      'key_value',
      'table',
      'download',
      'video',
      'video',
    ]);
  });

  test('shows each section title as a real heading', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    for (const title of ['Description', 'Specifications', 'Resources']) {
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    }
  });

  test('renders the six block types with their content', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    // rich_text, with its markup intact
    await expect(page.getByTestId('product-block-rich-text')).toContainText('hex bolt');
    await expect(page.getByTestId('product-block-rich-text').locator('strong')).toHaveCount(1);
    await expect(page.getByTestId('product-block-rich-text').locator('li')).toHaveCount(2);

    // image, with its caption
    await expect(page.getByTestId('product-content-image')).toBeVisible();
    await expect(page.getByTestId('product-image-caption')).toHaveText('Dimensions in millimetres');

    // key_value
    await expect(page.getByTestId('product-spec-row')).toHaveCount(4);
    await expect(page.getByTestId('product-block-key-value')).toContainText('Grade 8.8 carbon steel');

    // table
    await expect(page.getByTestId('product-table-header')).toHaveCount(6);
    await expect(page.getByTestId('product-table-row')).toHaveCount(3);

    // download
    await expect(page.getByTestId('product-block-download')).toContainText('Installation Manual');
    await expect(page.getByTestId('product-block-download')).toHaveAttribute(
      'href',
      '/mock-media/product-datasheet.pdf',
    );

    // video: one player, one link
    await expect(page.getByTestId('product-block-video')).toHaveCount(1);
    await expect(page.getByTestId('product-block-video-link')).toHaveCount(1);
  });

  test('sits after the buying area and before below_product', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    const order = await page.evaluate(() => {
      const position = (selector: string) => {
        const node = document.querySelector(selector);
        if (node === null) {
          return -1;
        }
        return Array.from(document.querySelectorAll('*')).indexOf(node);
      };
      return {
        gallery: position('[data-testid="product-gallery"]'),
        addToCart: position('[data-testid="add-to-cart"]'),
        content: position('[data-testid="product-content-section"]'),
      };
    });

    expect(order.gallery).toBeGreaterThan(-1);
    expect(order.content).toBeGreaterThan(order.gallery);
    expect(order.content).toBeGreaterThan(order.addToCart);
  });

  test('renders nothing for a product with no content', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: WASHER });

    await expect(sections(page)).toHaveCount(0);
    // The rest of the page is untouched.
    await expect(page.getByTestId('item-title')).toBeVisible();
  });

  test('falls back to the file name for an unlabelled download', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: NUT });

    await expect(page.getByTestId('product-block-download')).toContainText(
      'product-datasheet.pdf',
    );
    await expect(page.getByTestId('product-download-description')).toHaveCount(0);
  });

  test('costs no API request to render', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });
    await expect(sections(page)).toHaveCount(3);

    // Application RPCs only - image, video-poster and PDF fetches are the browser
    // loading assets, which is a different thing from the SPA asking the backend a
    // question, and are deliberately not counted.
    const before = await rpcCalls(page);

    await page.getByTestId('product-block-table').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('product-table-row')).toHaveCount(3);
    await page.getByTestId('product-block-download').scrollIntoViewIfNeeded();

    expect(await rpcCalls(page)).toEqual(before);

    // ...and no endpoint for merchandising was ever called, at any point in the page's
    // life. `cms.get_route_content` is deliberately NOT in this list: it is the Phase 25
    // route-slot request the product page has always made for above_product /
    // below_product, and it long predates this feature.
    for (const forbidden of [
      'get_product_content',
      'get_sections',
      'get_gallery',
      'get_product_merchandising',
      'cms.get_page',
    ]) {
      expect(before, `product content called ${forbidden}`).not.toContain(
        `yob_storefront.api.${forbidden}`,
      );
    }
    // One product read, not two.
    expect(before.filter((m) => m.endsWith('catalog.get_item'))).toHaveLength(1);
  });

  test('creates no iframe and no provider embed', async ({ page }) => {
    const providerHosts: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (/youtube|ytimg|vimeo|player\./.test(url)) {
        providerHosts.push(url);
      }
    });

    await signInAsMockBuyer(page, { goTo: BOLT });
    await expect(sections(page)).toHaveCount(3);

    // The whole page, not just the video block: an embed anywhere would be the failure.
    expect(await page.locator('iframe').count()).toBe(0);
    expect(providerHosts).toEqual([]);
  });

  test('plays a direct file and links everything else', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    const video = page.getByTestId('product-block-video');
    await expect(video).toHaveAttribute('src', 'https://cdn.example.test/demo.mp4?version=1');
    await expect(video).toHaveAttribute('preload', 'metadata');
    await expect(video).toHaveJSProperty('autoplay', false);
    await expect(video).toHaveJSProperty('controls', true);

    const link = page.getByTestId('product-block-video-link');
    await expect(link).toHaveAttribute('href', /youtube\.com/);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAccessibleName('Watch video');
  });

  test('a wide table scrolls inside its box, not the page', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    const wrapper = page.getByTestId('product-block-table');
    await wrapper.scrollIntoViewIfNeeded();

    const geometry = await wrapper.evaluate((node) => ({
      overflowX: getComputedStyle(node).overflowX,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
    expect(geometry.overflowX).toBe('auto');

    // The page itself stays put at every viewport the suite runs.
    await expectNoHorizontalOverflow(page);

    // Where the table genuinely overflows its box, it can be scrolled.
    if (geometry.scrollWidth > geometry.clientWidth) {
      await wrapper.evaluate((node) => node.scrollTo({ left: 200 }));
      expect(await wrapper.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      await expectNoHorizontalOverflow(page);
    }
  });

  test('uses accessible structures a screen reader can navigate', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    // Specification pairs are a description list, not two columns of loose text.
    await expect(page.getByTestId('product-block-key-value').locator('dt')).toHaveCount(4);
    await expect(page.getByTestId('product-block-key-value').locator('dd')).toHaveCount(4);

    // The table's headers are headers.
    await expect(page.getByTestId('product-block-table').locator('th[scope="col"]')).toHaveCount(6);

    // The download is a link, and the image is described.
    await expect(page.getByTestId('product-block-download')).toHaveRole('link');
    await expect(page.getByTestId('product-content-image')).toHaveAttribute(
      'alt',
      'Dimension drawing showing head width and shank length',
    );
  });

  test('shows every section at once, with no tab or accordion control', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: BOLT });

    await expect(sections(page)).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await expect(sections(page).nth(index)).toBeVisible();
    }
    expect(await page.locator('[role="tablist"], [role="tab"], details').count()).toBe(0);
  });
});

test.describe('product content and variant families', () => {
  test('template content and gallery both survive variant resolution', async ({ page }) => {
    // Phase 27C and 27D ownership, tied together in one flow: merchandising belongs to
    // the template, transactional facts belong to the resolved SKU.
    await signInAsMockBuyer(page, { goTo: FAMILY });

    // Pick a non-primary gallery image first.
    const thumbs = page.getByTestId('product-gallery-thumb');
    await expect(thumbs).toHaveCount(3);
    await thumbs.nth(2).click();
    const chosenImage = await page.getByTestId('item-image').locator('img').getAttribute('src');

    await expect(sections(page)).toHaveCount(2);
    const contentBefore = await page
      .getByTestId('product-content-section')
      .nth(1)
      .innerHTML();
    expect(contentBefore).toContain('EN ISO 20471');

    const before = await rpcCalls(page);

    await option(page, 'Colour', 'Orange').click();
    await option(page, 'Size', 'Medium').click();
    await expect(page.getByTestId('item-rate')).toBeVisible();

    // The buying facts changed...
    await expect(page.locator('body')).toContainText('YOB-VEST-ORG-M');
    await expect(page.getByTestId('item-uom')).toContainText('Box');

    // ...the gallery selection did not...
    await expect(page.getByTestId('item-image').locator('img')).toHaveAttribute(
      'src',
      chosenImage ?? '',
    );
    await expect(thumbs.nth(2)).toHaveAttribute('aria-pressed', 'true');

    // ...and neither did a word of the content.
    await expect(sections(page)).toHaveCount(2);
    expect(await page.getByTestId('product-content-section').nth(1).innerHTML()).toBe(
      contentBefore,
    );

    // Exactly one call was made since the selection began, and it was the resolver.
    // No second get_item, and no content or gallery endpoint of any kind.
    const added = (await rpcCalls(page)).slice(before.length);
    expect(added).toEqual(['yob_storefront.api.catalog.resolve_variant']);
  });
});
