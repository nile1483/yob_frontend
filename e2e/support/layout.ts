import { expect, type Page } from '@playwright/test';

/**
 * Assert the page does not scroll sideways.
 *
 * Horizontal overflow is the failure mode that actually breaks a storefront on a
 * phone: content becomes unreachable and every tap-target shifts. Comparing
 * `scrollWidth` against the viewport catches it wherever it comes from - a fixed
 * width, an unwrapped flex row, a long unbroken string - without caring which.
 *
 * One pixel of slack absorbs sub-pixel rounding at fractional device scales.
 */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(
    scrollWidth,
    `page scrolls horizontally: content ${scrollWidth}px in a ${clientWidth}px viewport`,
  ).toBeLessThanOrEqual(clientWidth + 1);
}

/**
 * Assert the shell's landmarks are present and inside the viewport.
 *
 * "Structurally usable" means the header is reachable, the routed content is visible,
 * and nothing has been pushed off-screen horizontally. It deliberately says nothing
 * about appearance - the design is placeholder-level and will change.
 */
export async function expectShellUsable(page: Page): Promise<void> {
  const header = page.getByRole('banner');
  const main = page.getByRole('main');

  await expect(header).toBeVisible();
  await expect(main).toBeVisible();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  for (const [name, locator] of [
    ['header', header],
    ['main', main],
  ] as const) {
    const box = await locator.boundingBox();
    expect(box, `${name} has no layout box`).not.toBeNull();
    if (box && viewport) {
      expect(box.x, `${name} starts left of the viewport`).toBeGreaterThanOrEqual(-1);
      expect(
        box.x + box.width,
        `${name} extends past the right edge of the viewport`,
      ).toBeLessThanOrEqual(viewport.width + 1);
    }
  }

  await expectNoHorizontalOverflow(page);
}
