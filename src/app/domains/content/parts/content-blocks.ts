import { Component, computed, input } from '@angular/core';

import { isRenderableBlock, type AnyContentBlockDto } from '../contracts/page.types';
import { BannerCarouselBlock } from './banner-carousel-block';
import { ContentSection } from './content-section';
import { ImageBannerBlock } from './image-banner-block';
import { ProductGridBlock } from './product-grid-block';
import { PromoGridBlock } from './promo-grid-block';
import { RichTextBlock } from './rich-text-block';

/**
 * An ordered list of merchant blocks, drawn.
 *
 * ## The only place a block type is dispatched
 *
 * Phase 25E put this `@switch` inside `StorefrontPage`, because a page was the only
 * thing that had blocks. Phase 25H gives the same blocks to slots inside application
 * routes, and copying the dispatch would mean that adding a sixth block type later
 * required editing the cart, the account page, the order list and every other host.
 *
 * So the dispatch lives here, once. `StorefrontPage` and `ContentSlot` both render this
 * and neither knows which block types exist. A host page knows even less: it declares a
 * position and never learns that carousels are a thing.
 *
 * ## Backend order, and nothing else
 *
 * Order is a merchandising decision that has already been made - by `sequence` on a
 * placement, or by position on a page. Nothing here sorts, groups or re-ranks; it walks
 * the array.
 *
 * ## An unknown block type is skipped, not fatal
 *
 * A backend that adds a block type this release cannot draw must not take a page or a
 * cart down. Unknown types are filtered out by {@link isRenderableBlock} and everything
 * else still renders, so an old client degrades by omission. The `@switch` then runs on
 * an already-narrowed union rather than trusting whichever fields happen to be present.
 */
@Component({
  selector: 'app-content-blocks',
  imports: [
    BannerCarouselBlock,
    ContentSection,
    ImageBannerBlock,
    ProductGridBlock,
    PromoGridBlock,
    RichTextBlock,
  ],
  template: `
    @for (block of renderable(); track $index) {
      <!-- Each block is its own band. Consecutive blocks are therefore separate
           full-width sections rather than one wrapper around the list, which is what
           lets a merchant put a dark hero directly above a muted grid. -->
      <yob-content-section
        [sectionStyle]="block.section_style"
        [contentWidth]="block.content_width"
      >
        <div data-testid="page-block" [attr.data-block-type]="block.type">
          @switch (block.type) {
            @case ('image_banner') {
              <app-image-banner-block [block]="block" />
            }
            @case ('rich_text') {
              <app-rich-text-block [block]="block" />
            }
            @case ('banner_carousel') {
              <app-banner-carousel-block [block]="block" />
            }
            @case ('product_grid') {
              <app-product-grid-block [block]="block" />
            }
            @case ('promo_grid') {
              <app-promo-grid-block [block]="block" />
            }
          }
        </div>
      </yob-content-section>
    }
  `,
  // No gap and no column here any more. Spacing moved into the section, because a gap
  // between two bands would show a stripe of page background between their surfaces;
  // the width moved into the section for the same reason - a list that constrained its
  // children could never let one of them paint full width.
  host: { class: 'block w-full' },
})
export class ContentBlocks {
  readonly blocks = input.required<readonly AnyContentBlockDto[]>();

  /** Only what this release can draw, in the order it arrived. */
  protected readonly renderable = computed(() => this.blocks().filter(isRenderableBlock));
}
