import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';
import { expectNoHorizontalOverflow } from './support/layout';
import { cartLink } from './support/header';

const FAMILY = '/catalog/item/hi-vis-safety-vest';
const UNSUPPORTED_FAMILY = '/catalog/item/contractor-tool-kit';
const TEMPLATE_CODE = 'YOB-VEST';
const ORANGE_MEDIUM = 'YOB-VEST-ORG-M';

/** One attribute value button, by attribute and value. */
function option(page: Page, attribute: string, value: string) {
  return page.locator(
    `[data-testid="item-attribute-value"][data-attribute="${attribute}"][data-value="${value}"]`,
  );
}

/** Choose the combination that actually exists. */
async function chooseOrangeMedium(page: Page): Promise<void> {
  await option(page, 'Colour', 'Orange').click();
  await option(page, 'Size', 'Medium').click();
  await expect(page.getByTestId('item-rate')).toBeVisible();
}

/**
 * Variant family selection in a real browser (Phase 24C).
 *
 * The buyer picks attributes and the backend picks the SKU. Everything below is either
 * "the matrix decides what is offerable" or "the resolver decides what is bought".
 */
test.describe('variant family page', () => {
  test('a family is one listing card with no price, and it opens the family page', async ({
    page,
  }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/safety-equipment' });

    const family = page.getByTestId('item-card').filter({ hasText: 'Hi-Vis' });
    await expect(family.getByTestId('item-select-options')).toContainText('Select options');
    await expect(family.getByTestId('item-rate')).toHaveCount(0);
    await expect(family).not.toContainText('₹');

    // The children are not listed as their own cards.
    await expect(page.getByTestId('item-card')).toHaveCount(2);
    await expect(page.locator('body')).not.toContainText(ORANGE_MEDIUM);

    await family.getByTestId('item-link').click();
    await expect(page).toHaveURL(FAMILY);
  });

  test('a simple card in the same listing still shows its authoritative price', async ({
    page,
  }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/safety-equipment' });

    const simple = page.getByTestId('item-card').filter({ hasText: 'Goggles' });
    await expect(simple.getByTestId('item-rate')).toContainText('240');
    await expect(simple.getByTestId('item-select-options')).toHaveCount(0);
  });

  test('renders the attributes and values in the backend order', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });

    await expect(page.getByTestId('item-attribute-name')).toHaveText(['Colour', 'Size']);
    await expect(page.getByTestId('item-attribute-value')).toHaveText([
      'Orange',
      'Yellow',
      'Medium',
      'Large',
    ]);
  });

  test('offers nothing to buy until a variant is resolved', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });

    await expect(page.getByTestId('item-variant-prompt')).toBeVisible();
    await expect(page.getByTestId('item-rate')).toHaveCount(0);
    await expect(page.getByTestId('item-quantity')).toHaveCount(0);
    await expect(page.getByTestId('add-to-cart')).toHaveCount(0);
  });

  test('disables a combination that does not exist, without hiding it', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });
    await option(page, 'Colour', 'Orange').click();

    // Orange/Medium is real. Orange/Large is not, though Orange and Large both exist.
    await expect(option(page, 'Size', 'Medium')).toBeEnabled();
    await expect(option(page, 'Size', 'Large')).toBeVisible();
    await expect(option(page, 'Size', 'Large')).toBeDisabled();
  });

  test('constrains colours from a chosen size too', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });
    await option(page, 'Size', 'Large').click();

    await expect(option(page, 'Colour', 'Yellow')).toBeEnabled();
    await expect(option(page, 'Colour', 'Orange')).toBeDisabled();
  });

  test('offers no unit or warehouse control anywhere on the page', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });
    await chooseOrangeMedium(page);

    // Scoped to the routed page since Phase 26B: the header's product typeahead is a
    // combobox by ARIA convention, and it is not a unit selector. What this asserts is
    // that the *product* offers no unit or warehouse choice.
    const content = page.getByTestId('page-main');
    await expect(content.locator('select')).toHaveCount(0);
    await expect(content.getByRole('combobox')).toHaveCount(0);
    await expect(content).not.toContainText('Warehouse');
  });

  test('shows the resolved variant, priced in its own units', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });
    await chooseOrangeMedium(page);

    await expect(page.getByTestId('item-rate')).toContainText('1,000');
    await expect(page.getByTestId('item-uom')).toContainText('Box');
    await expect(page.getByTestId('item-availability')).toContainText('125');
    await expect(page.getByTestId('item-availability-uom')).toHaveText('Nos');
    await expect(page.getByTestId('item-quantity')).toHaveAccessibleName(/Box/);
    await expect(page.locator('body')).toContainText(ORANGE_MEDIUM);

    // Still the family URL - no variant deep link is constructed.
    await expect(page).toHaveURL(FAMILY);
  });

  test('the template gallery survives variant resolution, selection included', async ({
    page,
  }) => {
    // ## The Phase 27C ownership test
    //
    // This test used to assert the opposite - that resolving a variant SWAPPED the image.
    // That was correct when a product had one picture; it is wrong now. Merchandising
    // belongs to the public storefront entity, which for a family is the template, and
    // 3.9.1 removed gallery and content from the resolver's payload entirely.
    //
    // So the buyer picks the second template image, resolves a variant whose own
    // photograph is a file that appears in no gallery row, and everything transactional
    // changes while the column they are looking at does not.
    await signInAsMockBuyer(page, { goTo: FAMILY });

    const thumbs = page.getByTestId('product-gallery-thumb');
    await expect(thumbs).toHaveCount(3);

    await thumbs.nth(1).click();
    const chosen = await page.getByTestId('item-image').locator('img').getAttribute('src');
    expect(chosen).not.toBeNull();

    await chooseOrangeMedium(page);

    // The buying area moved to the resolved SKU...
    await expect(page.locator('body')).toContainText(ORANGE_MEDIUM);
    await expect(page.getByTestId('item-uom')).toContainText('Box');

    // ...and the merchandising column did not.
    await expect(page.getByTestId('item-image').locator('img')).toHaveAttribute('src', chosen!);
    await expect(page.getByTestId('item-image').locator('img')).not.toHaveAttribute(
      'src',
      /variant-orange-medium/,
    );
    await expect(thumbs).toHaveCount(3);
    await expect(thumbs.nth(1)).toHaveAttribute('aria-pressed', 'true');

    // The variant's own file never enters the strip.
    for (const src of await thumbs.locator('img').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('src') ?? ''),
    )) {
      expect(src).not.toContain('variant-orange-medium');
    }
  });

  test('the yellow variant, which has no image of its own, changes nothing either', async ({
    page,
  }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });
    const opening = await page.getByTestId('item-image').locator('img').getAttribute('src');

    await option(page, 'Colour', 'Yellow').click();
    await option(page, 'Size', 'Large').click();
    await expect(page.getByTestId('item-rate')).toContainText('60');

    await expect(page.getByTestId('item-image').locator('img')).toHaveAttribute(
      'src',
      opening ?? '',
    );
  });

  test('resets the quantity when the resolved variant changes', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });
    await chooseOrangeMedium(page);

    // Orange/Medium carries Phase 29B guidance - MOQ 10, step 6 - so it opens on 10 and
    // 22 is on its sequence.
    await expect(page.getByTestId('item-quantity')).toHaveValue('10');
    await page.getByTestId('item-quantity').fill('22');
    await page.getByTestId('item-quantity').blur();
    await expect(page.getByTestId('item-quantity')).toHaveValue('22');

    await option(page, 'Colour', 'Yellow').click();
    await option(page, 'Size', 'Large').click();
    await expect(page.getByTestId('item-rate')).toContainText('60');

    // 22 Box must not become 22 Nos of a different product. Yellow/Large's Item Price
    // has a Pricing Rule, so its guidance is disallowed and the box returns to the
    // ordinary default - never to Orange/Medium's sequence.
    await expect(page.getByTestId('item-quantity')).toHaveValue('1');
    await expect(page.getByTestId('item-quantity-uom')).toHaveText('Nos');
    await expect(page.getByTestId('item-quantity')).not.toHaveAttribute('min', /.+/);
  });

  test('adds the resolved SKU to the cart, never the template', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });
    await chooseOrangeMedium(page);

    // On this variant's guided sequence (10, 16, 22), so it commits unchanged.
    await page.getByTestId('item-quantity').fill('16');
    await page.getByTestId('item-quantity').blur();
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();

    await cartLink(page)
      .click();

    // The cart holds the variant the backend named, in the unit it sells in. An exact
    // match, not a substring one: a resolved SKU may well begin with the template code -
    // that is ERPNext's naming, and asserting anything about its shape here would be the
    // test doing what the application is forbidden to do. What matters is that the code
    // in the cart is the resolver's answer and not the template itself.
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.getByTestId('cart-line-code')).toHaveText(ORANGE_MEDIUM);
    expect(ORANGE_MEDIUM).not.toBe(TEMPLATE_CODE);
    await expect(page.getByTestId('cart-line-uom')).toHaveText('Box');
    await expect(page.getByTestId('cart-line-quantity')).toHaveText('16');
  });

  test('has no horizontal overflow while choosing', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });
    await expectNoHorizontalOverflow(page);

    await chooseOrangeMedium(page);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('when the backend refuses a variant', () => {
  test('a combination the matrix offered but the server rejects cannot be bought', async ({
    page,
  }) => {
    await signInWithMockFlags(page, 'mockScenario=variant-unavailable', { goTo: FAMILY });

    await option(page, 'Colour', 'Orange').click();
    await option(page, 'Size', 'Medium').click();

    await expect(page.getByTestId('item-variant-error')).toContainText('not available');
    await expect(page.getByTestId('add-to-cart')).toHaveCount(0);
    await expect(page.getByTestId('item-rate')).toHaveCount(0);
  });

  test('an unsupported family says so and offers no controls', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: UNSUPPORTED_FAMILY });

    await expect(page.getByTestId('item-family-unavailable')).toBeVisible();
    await expect(page.getByTestId('item-attributes')).toHaveCount(0);
    await expect(page.getByTestId('add-to-cart')).toHaveCount(0);
  });

  test('a family the resolver refuses outright is handled safely', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=variant-family-unsupported', { goTo: FAMILY });

    await option(page, 'Colour', 'Orange').click();
    await option(page, 'Size', 'Medium').click();

    await expect(page.getByTestId('item-variant-error')).toContainText(
      'cannot be configured online',
    );
    await expect(page.getByTestId('add-to-cart')).toHaveCount(0);
  });
});
