import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';
import { expectNoHorizontalOverflow } from './support/layout';

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

    await expect(page.locator('select')).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Warehouse');
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

  test('swaps to the variant image, and keeps the family one when there is none', async ({
    page,
  }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });
    const familyImage = await page
      .getByTestId('item-image')
      .locator('img')
      .getAttribute('src');

    await chooseOrangeMedium(page);
    await expect(page.getByTestId('item-image').locator('img')).not.toHaveAttribute(
      'src',
      familyImage ?? '',
    );

    // The yellow variant has no photograph of its own; the family's stays.
    await option(page, 'Colour', 'Yellow').click();
    await option(page, 'Size', 'Large').click();
    await expect(page.getByTestId('item-rate')).toContainText('60');
    await expect(page.getByTestId('item-image').locator('img')).toHaveAttribute(
      'src',
      familyImage ?? '',
    );
  });

  test('resets the quantity when the resolved variant changes', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });
    await chooseOrangeMedium(page);

    await page.getByTestId('item-quantity').fill('4');
    await page.getByTestId('item-quantity').blur();
    await expect(page.getByTestId('item-quantity')).toHaveValue('4');

    await option(page, 'Colour', 'Yellow').click();
    await option(page, 'Size', 'Large').click();
    await expect(page.getByTestId('item-rate')).toContainText('60');

    // 4 Box must not become 4 Nos of a different product.
    await expect(page.getByTestId('item-quantity')).toHaveValue('1');
    await expect(page.getByTestId('item-quantity-uom')).toHaveText('Nos');
  });

  test('adds the resolved SKU to the cart, never the template', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });
    await chooseOrangeMedium(page);

    await page.getByTestId('item-quantity').fill('2');
    await page.getByTestId('item-quantity').blur();
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Cart' })
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
    await expect(page.getByTestId('cart-line-quantity')).toHaveText('2');
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
