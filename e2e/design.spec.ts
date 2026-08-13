import { expect, test, type Locator, type Page } from '@playwright/test';

import { expectNoHorizontalOverflow } from './support/layout';

/**
 * Browser verification of the design primitives, at every configured viewport.
 *
 * The subject is `/__design`, a development-only gallery contributed by the
 * environment file. It does not exist in a production build.
 *
 * Behaviour and accessibility only - no class assertions, no screenshot snapshots.
 */

/**
 * Tab until `target` has focus.
 *
 * Programmatic `.focus()` does not put Chromium into `:focus-visible` for a button, so
 * a keyboard-focus test has to actually use the keyboard.
 */
async function tabTo(page: Page, target: Locator, maxPresses = 25): Promise<void> {
  await page.locator('body').click({ position: { x: 1, y: 1 } });

  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) {
      return;
    }
  }

  throw new Error(`could not reach the target with ${maxPresses} Tab presses`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/__design');
  await expect(page.getByRole('heading', { name: 'Design gallery', level: 1 })).toBeVisible();
});

test('the gallery has no horizontal overflow', async ({ page }) => {
  await expectNoHorizontalOverflow(page);
});

test.describe('button', () => {
  test('responds to a click', async ({ page }) => {
    const count = page.getByTestId('click-count');
    await expect(count).toHaveText('0');

    await page.getByTestId('button-default').click();

    await expect(count).toHaveText('1');
  });

  test('a disabled button does not respond', async ({ page }) => {
    const button = page.getByTestId('button-disabled');
    await expect(button).toBeDisabled();

    await button.click({ force: true });

    await expect(page.getByTestId('click-count')).toHaveText('0');
  });

  test('a loading button is disabled and announced as busy', async ({ page }) => {
    const button = page.getByTestId('button-loading');

    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-busy', 'true');

    await button.click({ force: true });
    await expect(page.getByTestId('click-count')).toHaveText('0');
  });

  test('shows a visible focus ring when reached by keyboard', async ({ page }) => {
    const button = page.getByTestId('button-default');
    await tabTo(page, button);

    const outline = await button.evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
    });

    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThan(0);
  });

  test('can be activated from the keyboard', async ({ page }) => {
    const button = page.getByTestId('button-default');
    await tabTo(page, button);

    await page.keyboard.press('Enter');

    await expect(page.getByTestId('click-count')).toHaveText('1');
  });
});

test.describe('field', () => {
  test('its label focuses the control', async ({ page }) => {
    const input = page.getByTestId('field-plain-input');

    // Proves the label/control association in the real DOM, not just in jsdom.
    await page.getByText('Email address', { exact: true }).click();

    await expect(input).toBeFocused();
  });

  test('exposes the label as the control accessible name', async ({ page }) => {
    // If the association broke, this locator would find nothing.
    await expect(page.getByLabel('Email address')).toBeVisible();
  });

  test('links hint text to the control', async ({ page }) => {
    const input = page.getByTestId('field-plain-input');
    const describedBy = await input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const hint = page.locator(`#${describedBy}`);
    await expect(hint).toHaveText('We only use this to contact you');
  });

  test('marks an invalid control and announces the message', async ({ page }) => {
    const input = page.getByTestId('field-error-input');
    await expect(input).toHaveAttribute('aria-invalid', 'true');

    const describedBy = await input.getAttribute('aria-describedby');
    const message = page.locator(`#${describedBy}`);
    await expect(message).toHaveText('Enter your password');
    await expect(message).toHaveRole('alert');
  });

  test('its control is reachable and usable by keyboard', async ({ page }) => {
    const input = page.getByTestId('field-plain-input');
    await tabTo(page, input);

    await page.keyboard.type('buyer@example.invalid');

    await expect(input).toHaveValue('buyer@example.invalid');
  });
});

test.describe('alert', () => {
  test('an error interrupts, other tones do not', async ({ page }) => {
    await expect(
      page.getByRole('alert').filter({ hasText: 'could not sign you in' }),
    ).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'changes were saved' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Prices include tax' })).toBeVisible();
  });
});

test.describe('spinner and empty state', () => {
  test('the spinner announces the wait', async ({ page }) => {
    await expect(page.getByRole('status').filter({ hasText: 'Loading' })).toBeAttached();
  });

  test('the empty state renders caller-supplied content', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'No orders yet' })).toBeVisible();
    await expect(page.getByText('Orders you place will appear here.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Browse the catalog' })).toBeVisible();
  });
});
