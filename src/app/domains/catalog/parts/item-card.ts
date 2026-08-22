import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Badge } from '../../../design/badge/badge';
import { Media, type MediaRatio } from '../../../design/media/media';
import { CATALOG_CURRENCY } from '../catalog.currency';
import type { CatalogItemDto } from '../contracts/catalog.types';

/**
 * A catalog item tile.
 *
 * ## Prices are displayed, never derived
 *
 * Every figure shown comes straight from the backend, which owns pricing rules,
 * discounts and tax. This component performs exactly one piece of arithmetic-adjacent
 * logic - comparing `rate` with `base_price` to decide whether a discount is worth
 * showing - and even that is a comparison of two backend values, not a calculation.
 * `base_price - rate` is never computed here; `discount_percentage` and
 * `discount_amount` already exist for that.
 *
 * ## Why this lives in the catalog domain
 *
 * It knows what an item is, what a UOM means and how YOB expresses a discount. That is
 * business knowledge, so it is a domain part. `design/` stays generic.
 */
@Component({
  selector: 'app-item-card',
  imports: [Badge, CurrencyPipe, Media, RouterLink],
  host: { class: 'contents' },
  template: `
    <article
      class="group relative flex h-full w-full flex-col rounded-lg border border-slate-200
             transition-shadow focus-within:shadow-md hover:shadow-md"
      data-testid="item-card"
    >
      <!-- Empty alt: the product name is the very next element, so naming the image
           too would announce the same product twice. -->
      <app-media
        class="overflow-hidden rounded-t-lg"
        [src]="item().image"
        alt=""
        [ratio]="ratio()"
        testId="item-media"
      />

      <div class="flex flex-1 flex-col gap-1 p-4">
        <h3 class="text-sm leading-snug font-medium break-words text-slate-900">
        <!-- Stretched link: the anchor is the only interactive element, but its
             ::after covers the card so the whole tile is clickable. A future
             add-to-cart button must sit above it with relative z-10. -->
          <a
            [routerLink]="['/catalog', 'item', item().slug]"
            class="after:absolute after:inset-0 after:content-['']"
            data-testid="item-link"
            >{{ item().item_name }}</a
          >
        </h3>

        <p class="text-xs break-words text-slate-500">
          <span class="sr-only" i18n="@@catalog.item.code">Item code</span>
          {{ item().name }}
        </p>

        <!-- mt-auto pins this block to the bottom, so prices line up across a row
             however many lines each product name takes. The pricing-rule label sits
             *above* the price rather than below it: as a trailing line it was optional,
             which pushed the price down on any card that happened not to have one. -->
        <div class="mt-auto pt-3">
          <!-- A family: its children can differ in price, so there is no single figure to
               show and none is invented. Not "from ₹x" either - that is a cheapest-variant
               calculation, and pricing is the backend's. The card says what to do next and
               the family page does the rest. -->
          @if (selectOptions()) {
            <p class="text-sm font-medium text-slate-900" data-testid="item-select-options">
              <ng-container i18n="@@catalog.item.selectOptions">Select options</ng-container>
            </p>
            <p class="mt-1 text-xs text-slate-500" data-testid="item-variants-hint">
              <ng-container i18n="@@catalog.item.variantsAvailable"
                >Sizes and colours available</ng-container
              >
            </p>
          } @else {
          @if (item().pricing_rule_label; as label) {
            <p class="mb-1 text-xs text-slate-600" data-testid="item-pricing-rule">{{ label }}</p>
          }

          <div class="flex flex-wrap items-baseline gap-x-2">
            <span class="text-lg font-semibold text-slate-900" data-testid="item-rate">
              {{ item().rate | currency: currency }}
            </span>

            @if (hasDiscount()) {
              <s class="text-sm text-slate-400" data-testid="item-base-price">
                {{ item().base_price | currency: currency }}
              </s>
            }
          </div>

          <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <!-- The **selling** UOM, which is the unit this price is for.
                 Deliberately not stock_uom: since backend Phase 23B-5U get_items
                 supplies both, and they differ whenever ERPNext sells in one unit and
                 stocks in another - a ₹1000 Box captioned "per Nos" is simply wrong.
                 conversion_factor arrives too and is not used: nothing here converts a
                 price between units. -->
            <span class="text-xs text-slate-500" data-testid="item-uom">
              <ng-container i18n="@@catalog.item.perUom">per</ng-container>
              {{ item().uom }}
            </span>

            @if (hasDiscount()) {
              <app-badge tone="success" data-testid="item-discount" i18n="@@catalog.item.discount">
                {{ item().discount_percentage }}% off
              </app-badge>
            }
          </div>
          }
        </div>
      </div>
    </article>
  `,
})
export class ItemCard {
  readonly item = input.required<CatalogItemDto>();

  /**
   * The shape of the card's picture. **Presentation only.**
   *
   * A content Product Grid lets a merchant choose square or portrait cards, and this is
   * the whole of that difference: the same component, the same data and the same pricing
   * rules, in a different frame. A second card implementation for content pages would be
   * a second place for price and selling-UOM behaviour to drift from the catalogue's.
   */
  readonly ratio = input<MediaRatio>('product');

  protected readonly currency = inject(CATALOG_CURRENCY);

  /**
   * Whether this row stands for a family rather than a priced item.
   *
   * Read from the backend's `price_state` and nothing else - not from a zero rate, which
   * a genuinely free item could also have. An absent or unknown value keeps the ordinary
   * priced card, so a backend that has not been upgraded behaves exactly as before.
   */
  protected readonly selectOptions = computed(() => this.item().price_state === 'select_options');

  /**
   * Whether to show the struck-through original price.
   *
   * Driven by the backend's own numbers: a discount exists when it says the rate is
   * below the base price. Guarding on `> 0` as well avoids advertising a "0% off"
   * badge when a pricing rule matched but changed nothing.
   */
  protected readonly hasDiscount = computed(() => {
    const { rate, base_price: basePrice, discount_percentage: discount } = this.item();

    // Every money field is null on a family card (API 3.3.0). A null is not a zero and
    // not a comparison: with no price there is no discount to advertise.
    if (rate === null || basePrice === null || discount === null) {
      return false;
    }
    return rate < basePrice && discount > 0;
  });
}
