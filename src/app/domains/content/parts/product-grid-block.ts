import { Component, computed, input } from '@angular/core';

import { ItemCard } from '../../catalog/parts/item-card';
import type { ProductGridBlockDto } from '../contracts/page.types';

/**
 * Products the backend selected and priced.
 *
 * ## It reuses the catalogue's own card, and that is the point
 *
 * The rows are `ListingCard`s from the same service `get_items` uses, so they render
 * through the same {@link ItemCard} the category listing uses. A second product card for
 * content pages would be a second place for price, selling UOM, discount and the
 * `select_options` family rule to drift - and drift is exactly what a buyer would notice
 * as the same product costing two different things on two pages.
 *
 * So there is **no pricing here at all**: no rate is computed, no discount derived, no
 * UOM converted, no stock inferred, no child variant chosen to give a family a price, and
 * no per-card request of any kind. Everything on screen arrived with the page.
 *
 * ## Card type is presentation
 *
 * `square` and `portrait` change the image frame and the column rhythm. They do not
 * change what a card *is*: both render the same component with the same data and the same
 * rules, because the difference a merchant is choosing is a shape.
 *
 * ## An empty grid is not an error
 *
 * `category: null` with `items: []` means the configured category became unusable. The
 * backend deliberately does not substitute other products, and neither does this: the
 * block renders nothing rather than merchandising something nobody chose.
 */
@Component({
  selector: 'app-product-grid-block',
  imports: [ItemCard],
  template: `
    @if (block().items.length > 0) {
      <section
        data-testid="block-product-grid"
        [attr.data-block-name]="block().block_name"
        [attr.data-card-type]="block().card_type"
        [attr.data-category]="block().category"
      >
        <ul class="grid grid-cols-2 gap-3 sm:gap-4" [class]="columnsClass()" data-testid="product-grid">
          @for (item of block().items; track item.name) {
            <li>
              <!-- The catalogue's card, unchanged: same price, same selling UOM, same
                   select-options treatment for a variant family. -->
              <app-item-card [item]="item" [ratio]="imageRatio()" />
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class ProductGridBlock {
  readonly block = input.required<ProductGridBlockDto>();

  /** Portrait cards are taller, so fewer sit comfortably across a wide row. */
  protected readonly columnsClass = computed(() =>
    this.block().card_type === 'portrait'
      ? 'lg:grid-cols-3 xl:grid-cols-4'
      : 'lg:grid-cols-4 xl:grid-cols-5',
  );

  /** The only thing `card_type` changes about a card: the shape of its picture. */
  protected readonly imageRatio = computed(() =>
    this.block().card_type === 'portrait' ? ('product' as const) : ('square' as const),
  );
}
