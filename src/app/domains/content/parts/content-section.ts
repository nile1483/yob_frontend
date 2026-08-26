import { Component, computed, input } from '@angular/core';

import type { SectionStyle } from '../contracts/page.types';

/**
 * One merchant block's band: full width outside, the storefront's column inside.
 *
 * ```html
 * <section class="yob-page-section yob-section-muted">
 *   <div class="yob-content-container">…the block renderer, unchanged…</div>
 * </section>
 * ```
 *
 * ## Why this is one component rather than five
 *
 * Every block type needs the identical treatment, and none of them should know it is
 * happening. An image banner is about `<picture>` and heights; a product grid is about
 * cards. Neither is about backgrounds. Putting the wrapper here keeps all five renderers
 * focused on their own content and means a sixth block type gets banding for free.
 *
 * It also keeps the mapping in **one** place. `ContentBlocks` stamps this around each
 * block, so `/pages/:slug`, `/home`, the cart, the order list and every other placement
 * behave identically without a single host page mentioning a section style.
 *
 * ## Full width, and not `100vw`
 *
 * `width: 100%` of `main`. `100vw` includes the scrollbar gutter, so on any desktop with
 * a classic scrollbar it is a few pixels wider than the page and produces exactly the
 * horizontal overflow the layout suite fails on.
 *
 * ## The style is a lookup, never a class name
 *
 * The backend sends one of five approved words. It is looked up in a fixed table, so
 * nothing it could send becomes a class: an unrecognised value falls back to `default`
 * rather than reaching the DOM. The table is written out in full because Tailwind
 * compiles the classes it can see - an interpolated `yob-section-${style}` would name a
 * class that exists in the markup and nowhere in the stylesheet.
 *
 * ## Vertical rhythm
 *
 * Before this phase, `ContentBlocks` separated blocks with `gap-10`. Bands cannot use a
 * gap - it would show a stripe of page background between two adjacent surfaces - so the
 * spacing moved inside each section. `default` uses half of it top and bottom, which
 * reproduces the previous 40px between consecutive blocks exactly; a style with a
 * visible surface gets more, because a band needs room its transparent neighbour does
 * not.
 */
@Component({
  selector: 'yob-content-section',
  template: `
    <section
      class="yob-page-section"
      [class]="styleClass()"
      data-testid="content-section"
      [attr.data-section-style]="sectionStyle()"
    >
      <div class="yob-content-container">
        <ng-content />
      </div>
    </section>
  `,
})
export class ContentSection {
  readonly sectionStyle = input.required<SectionStyle>();

  protected readonly styleClass = computed(
    () => SECTION_STYLES[this.sectionStyle()] ?? SECTION_STYLES.default,
  );
}

/**
 * The five published styles, and nothing else.
 *
 * Keyed by the contract's own words, valued in classes this repository owns. `default`
 * carries no surface at all - it is the ordinary page background, which is what every
 * block predating the field projects as, and what keeps this phase from repainting the
 * existing storefront.
 */
const SECTION_STYLES: Readonly<Record<SectionStyle, string>> = {
  default: 'py-5',
  muted: 'yob-section-muted py-10',
  brand_soft: 'yob-section-brand-soft py-10',
  accent: 'yob-section-accent py-10',
  dark: 'yob-section-dark py-10',
};
