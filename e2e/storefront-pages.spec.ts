import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer } from './support/auth';
import { expectNoHorizontalOverflow } from './support/layout';

const ABOUT = '/pages/about-us';

function block(page: Page, type: string) {
  return page.locator(`[data-testid="page-block"][data-block-type="${type}"]`);
}

/**
 * Merchant pages in a real browser (Phase 25E).
 *
 * One page carries all five block types, so a single navigation exercises ordering, every
 * renderer and the shared destination handling at the three viewports the suite runs at.
 */
test.describe('storefront page', () => {
  test('is reached from the configured navigation', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog' });

    // Phase 25D builds `/pages/<target>` because the backend stores no route; this is the
    // other half of that agreement. Scoped to the *visible* nav: the shell renders the
    // component twice, and at a phone width the wide one is hidden.
    const link = page
      .getByRole('navigation', { name: 'Primary' })
      .filter({ visible: true })
      .first()
      .locator('[data-testid="nav-link"][data-label="About Us"]');
    await expect(link).toHaveAttribute('href', '/pages/about-us');

    await link.click();
    await expect(page).toHaveURL(ABOUT);
    await expect(page.getByTestId('page-title')).toContainText('About Us');
  });

  test('renders every block in the merchant order', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: ABOUT });

    await expect(page.getByTestId('page-block')).toHaveCount(5);
    const order = await page
      .getByTestId('page-block')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-block-type')));
    expect(order).toEqual([
      'image_banner',
      'rich_text',
      'banner_carousel',
      'product_grid',
      'promo_grid',
    ]);
  });

  test('shows the image banner with its alt text and its link', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: ABOUT });

    const banner = block(page, 'image_banner');
    await expect(banner.getByTestId('content-image')).toHaveAttribute('alt', 'Our warehouse');
    await expect(banner.getByTestId('destination-link')).toHaveAttribute(
      'href',
      '/catalog/fasteners',
    );

    await banner.getByTestId('destination-link').click();
    await expect(page).toHaveURL('/catalog/fasteners');
  });

  test('renders rich text without executing anything in it', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: ABOUT });

    const rich = block(page, 'rich_text');
    await expect(rich.getByTestId('rich-text-title')).toContainText('Who we are');
    await expect(rich.getByTestId('rich-text-body')).toContainText('industrial buyers');
    await expect(rich.locator('strong')).toBeVisible();

    // The fixture's markup carries a script and an onerror handler. Neither runs.
    expect(await page.evaluate(() => (globalThis as Record<string, unknown>)['__yobXss'])).toBeUndefined();
    await expect(rich.locator('script')).toHaveCount(0);
  });

  test('moves through the carousel and honours its destinations', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: ABOUT });

    const carousel = block(page, 'banner_carousel');
    await expect(carousel.getByTestId('carousel-slide')).toHaveAttribute('data-title', 'Winter safety');

    await carousel.getByTestId('carousel-next').click();
    await expect(carousel.getByTestId('carousel-slide')).toHaveAttribute(
      'data-title',
      'Supplier of the year',
    );

    // An external slide: backend URL, new tab, and a safe rel.
    const external = carousel.getByTestId('destination-link');
    await expect(external).toHaveAttribute('href', 'https://awards.example.invalid/2026');
    await expect(external).toHaveAttribute('target', '_blank');
    await expect(external).toHaveAttribute('rel', /noopener/);

    // The third slide has no destination, so it is rendered but not a link.
    await carousel.getByTestId('carousel-next').click();
    await expect(carousel.getByTestId('carousel-slide')).toHaveAttribute('data-title', 'Coming soon');
    await expect(carousel.getByTestId('destination-link')).toHaveCount(0);
    await expect(carousel.getByTestId('destination-inert')).toHaveCount(1);

    await carousel.getByTestId('carousel-previous').click();
    await expect(carousel.getByTestId('carousel-slide')).toHaveAttribute(
      'data-title',
      'Supplier of the year',
    );
  });

  test('shows Product Grid rows exactly as the catalogue does', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: ABOUT });

    const grid = block(page, 'product_grid');
    const simple = grid.getByTestId('item-card').filter({ hasText: 'Goggles' });
    const family = grid.getByTestId('item-card').filter({ hasText: 'Hi-Vis' });

    // Simple item: the backend's price and its selling UOM.
    await expect(simple.getByTestId('item-rate')).toContainText('240');
    await expect(simple.getByTestId('item-uom')).toBeVisible();

    // Variant family: Select options, and no money at all.
    await expect(family.getByTestId('item-select-options')).toBeVisible();
    await expect(family.getByTestId('item-rate')).toHaveCount(0);
    await expect(family).not.toContainText('₹');
  });

  test('navigates from a promo card, including to another page', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: ABOUT });

    const promo = block(page, 'promo_grid');
    await expect(promo.getByTestId('promo-card')).toHaveCount(3);

    // An external promo card, opening in a new tab.
    const external = promo.getByTestId('destination-link').nth(1);
    await expect(external).toHaveAttribute('href', 'https://accounts.example.invalid/apply');
    await expect(external).toHaveAttribute('target', '_blank');

    // And one pointing at another storefront page, whose route the client builds.
    const toPage = promo.getByTestId('destination-link').first();
    await expect(toPage).toHaveAttribute('href', '/pages/support');
    await toPage.click();

    await expect(page).toHaveURL('/pages/support');
    await expect(page.getByTestId('page-title')).toContainText('Support');
  });

  test('replaces the page on a slug change, keeping nothing from the last one', async ({
    page,
  }) => {
    await signInAsMockBuyer(page, { goTo: ABOUT });
    await expect(page.getByTestId('page-block')).toHaveCount(5);

    await block(page, 'promo_grid').getByTestId('destination-link').first().click();

    await expect(page).toHaveURL('/pages/support');
    await expect(page.getByTestId('page-block')).toHaveCount(1);
    await expect(page.locator('body')).not.toContainText('Who we are');
    await expect(page.getByTestId('storefront-page')).toHaveAttribute('data-slug', 'support');
  });

  test('shows a safe not-found state for an unpublished page', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/pages/no-such-page', expectUrl: false });

    await expect(page.getByTestId('page-not-found')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('page_not_found');
  });

  test('renders a page carrying an unknown block type', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/pages/future' });

    // A newer backend must not take an older client's page down.
    await expect(page.getByTestId('storefront-page')).toBeVisible();
    await expect(page.getByTestId('page-block')).toHaveCount(1);
    await expect(page.locator('body')).toContainText('Still here');
  });

  test('fits the viewport it is rendered at', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: ABOUT });

    await expectNoHorizontalOverflow(page);
    await expect(page.getByTestId('content-image').first()).toBeVisible();
  });
});
