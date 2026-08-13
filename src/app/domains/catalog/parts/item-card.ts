import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

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
  imports: [CurrencyPipe, RouterLink],
  host: { class: 'contents' },
  template: `
    <article
      class="relative flex h-full flex-col gap-3 rounded-lg border border-slate-200 p-4
             transition-colors focus-within:border-slate-400 hover:border-slate-400"
      data-testid="item-card"
    >
      @if (item().image; as image) {
        <img
          [src]="image"
          [alt]="item().item_name"
          class="aspect-square w-full rounded-md object-cover"
        />
      } @else {
        <div class="aspect-square w-full rounded-md bg-slate-100" aria-hidden="true"></div>
      }

      <h3 class="text-base font-medium break-words text-slate-900">
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

      <p class="text-xs text-slate-500 break-words">
        <span class="sr-only" i18n="@@catalog.item.code">Item code</span>
        {{ item().name }}
      </p>

      <div class="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span class="text-lg font-semibold text-slate-900" data-testid="item-rate">
          {{ item().rate | currency: currency }}
        </span>

        @if (hasDiscount()) {
          <s class="text-sm text-slate-500" data-testid="item-base-price">
            {{ item().base_price | currency: currency }}
          </s>
          <span
            class="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-900"
            data-testid="item-discount"
            i18n="@@catalog.item.discount"
          >
            {{ item().discount_percentage }}% off
          </span>
        }

        <span class="text-xs text-slate-500" data-testid="item-uom">
          <ng-container i18n="@@catalog.item.perUom">per</ng-container>
          {{ item().stock_uom }}
        </span>
      </div>

      @if (item().pricing_rule_label; as label) {
        <p class="text-xs text-slate-600" data-testid="item-pricing-rule">{{ label }}</p>
      }
    </article>
  `,
})
export class ItemCard {
  readonly item = input.required<CatalogItemDto>();

  protected readonly currency = inject(CATALOG_CURRENCY);

  /**
   * Whether to show the struck-through original price.
   *
   * Driven by the backend's own numbers: a discount exists when it says the rate is
   * below the base price. Guarding on `> 0` as well avoids advertising a "0% off"
   * badge when a pricing rule matched but changed nothing.
   */
  protected readonly hasDiscount = computed(
    () => this.item().rate < this.item().base_price && this.item().discount_percentage > 0,
  );
}
