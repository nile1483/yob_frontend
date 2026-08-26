import { expect, test, type Locator, type Page } from '@playwright/test';

import { signInAsMockBuyer } from './support/auth';

const DARK_BAND = '/pages/dark-band';

/**
 * The `dark` band's foreground, measured rather than assumed (Phase 25J).
 *
 * A dark section sets a light foreground for the ordinary content sitting directly on
 * it. Some of what it contains, though, brings a **light surface of its own** - a badge,
 * an image frame, and in future a secondary button or an alert. Those must keep their own
 * foreground: flipping their text would put light text on a light card.
 *
 * So this measures computed colour, which is the only thing that actually decides whether
 * a buyer can read a price. jsdom computes none of it, which is why this lives here.
 */

/**
 * Relative luminance of a computed colour, 0 (black) to 255 (white).
 *
 * Read back through a canvas rather than parsed from the string. Tailwind v4 emits
 * `oklch()`, which Chromium reports verbatim, so scraping digits out of the computed
 * value measures the wrong thing entirely. Painting one pixel and sampling it is correct
 * for whatever colour syntax the stylesheet happens to use.
 */
async function luminance(target: Locator, property: 'color' | 'backgroundColor' = 'color') {
  return target.first().evaluate((el, prop) => {
    const value = getComputedStyle(el)[prop as 'color'];
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return { value, luminance: 0.2126 * r! + 0.7152 * g! + 0.0722 * b! };
  }, property);
}

/** A probe element, with the classes a self-surfaced component uses, inside a dark band. */
async function probe(page: Page, surface: string, text: string) {
  return page.evaluate(
    ([surfaceClass, textClass]) => {
      const band = document.querySelector('[data-section-style="dark"]');
      if (band === null) {
        return null;
      }
      const host = document.createElement('div');
      host.className = surfaceClass!;
      const span = document.createElement('span');
      span.className = textClass!;
      span.textContent = 'probe';
      host.appendChild(span);
      band.appendChild(host);

      const read = (el: Element) => {
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
      };
      const result = { onSurface: read(span), surfaceItself: read(host) };
      host.remove();
      return result;
    },
    [surface, text] as const,
  );
}

test.describe('a dark content band', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: DARK_BAND });
    await expect(page.locator('[data-section-style="dark"]').first()).toBeVisible();
  });

  test('paints a dark surface', async ({ page }) => {
    const band = await luminance(page.locator('[data-section-style="dark"]'), 'backgroundColor');
    expect(band.luminance, `band background is ${band.value}`).toBeLessThan(80);
  });

  /* -------------------------------------- content sitting directly on the band */

  test('makes ordinary prose legible', async ({ page }) => {
    const title = await luminance(page.getByTestId('rich-text-title'));
    const body = await luminance(page.getByTestId('rich-text-body'));

    // Both hard-code the light-theme slate ramp in their own component; the band flips
    // them because neither has a surface of its own.
    expect(title.luminance, `title is ${title.value}`).toBeGreaterThan(150);
    expect(body.luminance, `body is ${body.value}`).toBeGreaterThan(150);
  });

  test('makes a product card name and price legible', async ({ page }) => {
    const name = await luminance(page.getByTestId('item-link'));
    const rate = await luminance(page.getByTestId('item-rate'));

    // ItemCard is a bordered card with no background, so it sits on the band itself.
    expect(name.luminance, `item link is ${name.value}`).toBeGreaterThan(150);
    expect(rate.luminance, `item rate is ${rate.value}`).toBeGreaterThan(150);
  });

  test('makes a promo card title and carousel text legible', async ({ page }) => {
    const promo = await luminance(page.getByTestId('promo-card-title'));
    expect(promo.luminance, `promo title is ${promo.value}`).toBeGreaterThan(150);

    const slide = await luminance(page.getByTestId('carousel-title'));
    expect(slide.luminance, `carousel title is ${slide.value}`).toBeGreaterThan(150);

    const position = await luminance(page.getByTestId('carousel-position'));
    expect(position.luminance, `carousel position is ${position.value}`).toBeGreaterThan(120);
  });

  /* ------------------------------- components that bring their own light surface */

  test('leaves a badge to its own surface and its own foreground', async ({ page }) => {
    const badge = page.getByTestId('item-discount');
    await expect(badge.first()).toBeVisible();

    const background = await luminance(badge, 'backgroundColor');
    const text = await luminance(badge);

    // The badge paints its own light surface, so its dark text must survive the band.
    // Flipping it would be light-on-light - unreadable, and exactly the leak this guards.
    expect(background.luminance, `badge surface is ${background.value}`).toBeGreaterThan(150);
    expect(text.luminance, `badge text is ${text.value}`).toBeLessThan(120);
  });

  test('leaves the image frame its own surface', async ({ page }) => {
    const frame = await luminance(page.getByTestId('item-media'), 'backgroundColor');

    // `Media` paints `bg-slate-50` behind every product image. The band must not repaint
    // it, or a transparent PNG would sit on near-black.
    expect(frame.luminance, `media frame is ${frame.value}`).toBeGreaterThan(150);
  });

  test('leaves any self-surfaced component its own foreground', async ({ page }) => {
    // The general rule, probed with the class pairings this design system actually uses:
    // a secondary button, a neutral badge, an alert, an empty state. None renders inside
    // a content block today, and all of them would if a future block type used one.
    for (const [surface, text] of [
      ['bg-white', 'text-slate-900'],
      ['bg-slate-50', 'text-slate-900'],
      ['bg-slate-100', 'text-slate-700'],
    ] as const) {
      const result = await probe(page, surface, text);
      expect(result, 'no dark band found to probe').not.toBeNull();
      expect(
        result!.onSurface,
        `${text} inside ${surface} came out light (${result!.onSurface}) - the band leaked into a self-surfaced component`,
      ).toBeLessThan(120);
    }
  });

  test('flips text that has no surface of its own', async ({ page }) => {
    // The other half of the same rule: without a surface, the band owns the foreground.
    const result = await probe(page, 'p-2', 'text-slate-900');
    expect(result!.onSurface, 'unsurfaced text was not flipped').toBeGreaterThan(150);
  });
});
