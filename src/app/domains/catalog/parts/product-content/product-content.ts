import { Component, computed, input } from '@angular/core';

import {
  isRenderableProductContentBlock,
  type ProductContentBlockDto,
  type ProductContentSectionDto,
} from '../../contracts/catalog.types';
import {
  ProductDownload,
  ProductImage,
  ProductKeyValue,
  ProductRichText,
  ProductTable,
  ProductVideo,
} from './product-content-blocks';

/** One section with only the blocks this release can actually draw. */
interface RenderableSection {
  readonly title: string;
  readonly blocks: readonly ProductContentBlockDto[];
}

/**
 * Merchant-authored product information, below the product itself (Phase 27D).
 *
 * ```html
 * <app-product-content [sections]="sections()" />
 * ```
 *
 * ## Sections, then blocks, both in the backend's order
 *
 * A section is a **grouping the merchant named** - "Description", "Specifications",
 * "Shipping" - and it is independent of what is inside it. Description may hold prose and
 * an image; Specifications may hold a key/value list and a table. Section semantics and
 * block type are two different axes, which is why the title lives on the section and
 * never implies a renderer.
 *
 * Nothing here sorts, groups or re-ranks: not the sections, not the blocks within one,
 * not the rows inside a block. Images are not floated to the top and downloads are not
 * pushed to the bottom. The arrays are the merchandising decision, already made.
 *
 * ## Vertical, never tabbed
 *
 * Every section renders, stacked, always visible. No tabs and no accordion - the contract
 * publishes no tab key or layout mode, and hiding half a datasheet behind a control the
 * merchant never asked for is how a buyer misses the shipping terms. Long is fine; a
 * product page is read by scrolling.
 *
 * ## Not the Phase 25 CMS renderer
 *
 * `ContentBlocks` and `ContentSection` serve merchant *pages* and route slots, and stamp
 * each block with the placement's `section_style` and `content_width`. Product content
 * carries neither, because the backend sends neither and this page's layout is
 * source-owned. Nothing here imports one, and a contract guard fails if it starts to.
 *
 * ## An unknown block is skipped, not fatal
 *
 * A backend that adds a seventh block type must not take a product page down. Unknown
 * types are filtered out and everything else still renders, so an old client degrades by
 * omission. A section left with nothing renderable is dropped **with its heading**: a
 * bare "Specifications" above empty space tells the buyer a section failed, which is
 * worse than not mentioning it.
 */
@Component({
  selector: 'app-product-content',
  imports: [
    ProductDownload,
    ProductImage,
    ProductKeyValue,
    ProductRichText,
    ProductTable,
    ProductVideo,
  ],
  template: `
    @for (section of renderable(); track $index) {
      <!-- Each section is its own band: full width outside, the storefront's one column
           inside - the same source-owned pair every application section on this page
           uses. Deliberately not yob-content-section, which is the CMS's and would apply
           a placement style product content does not have. -->
      <section
        class="yob-page-section product-content-section border-t border-slate-200 py-8"
        data-testid="product-content-section"
        [attr.data-section-title]="section.title"
      >
        <div class="yob-content-container">
          <h2 class="text-xl font-semibold tracking-tight text-slate-900" data-testid="product-content-title">
            {{ section.title }}
          </h2>

          <div class="mt-4 flex flex-col gap-6">
            @for (block of section.blocks; track $index) {
              <div data-testid="product-content-block" [attr.data-block-type]="block.type">
                @switch (block.type) {
                  @case ('rich_text') {
                    <app-product-rich-text [block]="block" />
                  }
                  @case ('key_value') {
                    <app-product-key-value [block]="block" />
                  }
                  @case ('table') {
                    <app-product-table [block]="block" />
                  }
                  @case ('image') {
                    <app-product-image [block]="block" />
                  }
                  @case ('download') {
                    <app-product-download [block]="block" />
                  }
                  @case ('video') {
                    <app-product-video [block]="block" />
                  }
                }
              </div>
            }
          </div>
        </div>
      </section>
    }
  `,
  host: { class: 'block w-full' },
})
export class ProductContent {
  readonly sections = input.required<readonly ProductContentSectionDto[]>();

  /**
   * The sections worth drawing, with the blocks this release understands.
   *
   * The contract says a published section always carries at least one block, so the
   * empty-section filter is defence rather than routine - it earns its place only when
   * an unknown type empties one. Filtering before the template also means the `@switch`
   * runs on an already-narrowed union instead of trusting whichever fields turned up.
   */
  protected readonly renderable = computed<readonly RenderableSection[]>(() =>
    this.sections()
      .map((section) => ({
        title: section.title,
        blocks: section.blocks.filter(isRenderableProductContentBlock),
      }))
      .filter((section) => section.blocks.length > 0),
  );
}
