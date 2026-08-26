import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';

import type { ContentWidth, SectionStyle } from '../contracts/page.types';

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
 * ## Contained or full width, and only that
 *
 * `content_width` decides one thing: whether the block sits in the shared column or gets
 * the section's whole width. The band, its surface and its spacing are identical either
 * way, and the style is never derived from the width - all ten combinations are valid.
 *
 * Full width needs no trick. `main` has been full width since Phase 25J, so **not**
 * opening the column is the entire implementation: no viewport-width unit, no
 * viewport-width utility class, no negative-margin breakout, no viewport arithmetic.
 *
 * (Those two are described rather than spelled on purpose. Tailwind scans source files
 * for class-like strings and does not know prose from markup, so naming the utility in
 * this comment made it emit a real rule for it into the production bundle.)
 *
 * ## One `<ng-content>`, stamped twice
 *
 * Angular projects a given `<ng-content />` slot **once**. Writing it in both branches
 * leaves whichever branch renders second empty - a banner inside a section with no
 * banner in it. Phase 25E hit exactly this bug in `DestinationLink`, so the content is
 * captured in a template here and stamped through `ngTemplateOutlet`, which is the
 * supported way to reuse it.
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
  imports: [NgTemplateOutlet],
  template: `
    <!-- Declared once. See the note above: a second <ng-content /> in the other branch
         would render empty. -->
    <ng-template #block><ng-content /></ng-template>

    <section
      class="yob-page-section"
      [class]="styleClass()"
      data-testid="content-section"
      [attr.data-section-style]="sectionStyle()"
      [attr.data-content-width]="contentWidth()"
    >
      @if (isContained()) {
        <div class="yob-content-container">
          <ng-container [ngTemplateOutlet]="block" />
        </div>
      } @else {
        <ng-container [ngTemplateOutlet]="block" />
      }
    </section>
  `,
})
export class ContentSection {
  readonly sectionStyle = input.required<SectionStyle>();

  /**
   * Defaulted rather than required, so a caller that has not been taught about width
   * yet keeps the behaviour every placement had before this field existed.
   */
  readonly contentWidth = input<ContentWidth>('contained');

  protected readonly styleClass = computed(
    () => SECTION_STYLES[this.sectionStyle()] ?? SECTION_STYLES.default,
  );

  /**
   * Whether to open the shared column.
   *
   * Written as "is it full width?" inverted, deliberately: **anything** that is not the
   * one published full-width word is contained. A value this release does not recognise
   * must fall back to the safe, unchanged behaviour - never to letting merchant content
   * escape the column.
   */
  protected readonly isContained = computed(() => !isFullWidth(this.contentWidth()));
}

/** The one place a width value is interpreted. Never a class name, never interpolated. */
export function isFullWidth(width: ContentWidth | null | undefined): boolean {
  return width === 'full_width';
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
