import { CurrencyPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Button } from '../../../design/button/button';
import { Media } from '../../../design/media/media';

import type { CartLineDto } from '../contracts/cart.types';

/**
 * One cart line.
 *
 * Displays backend figures and nothing else - `amount` and `total_amount` are the
 * server's, never `rate * quantity`. A cart-specific part, because it understands the
 * cart contract; it is not the catalog item card wearing a different hat.
 */
@Component({
  selector: 'app-cart-line',
  imports: [Button, CurrencyPipe, Media, RouterLink],
  host: { class: 'contents' },
  template: `
    <!-- Image beside the text at every width. Fully stacked, a phone gave each line
         about 230px and left the thumbnail orphaned on a row of its own with dead space
         beside it; only the price and Remove need to drop below. -->
    <article
      class="flex gap-3 border-b border-slate-200 py-4 sm:gap-4"
      data-testid="cart-line"
    >
      <!-- Product-shaped, not square: a 2:3 photograph contained in a square box shrank
           to a narrow strip with grey either side, and the thumbnail stopped resembling
           the card the buyer added it from. -->
      <app-media
        class="w-16 shrink-0 overflow-hidden rounded-md sm:w-20"
        [src]="line().image"
        alt=""
        ratio="product"
        sizes=""
        testId="cart-line-media"
      />

      <div class="min-w-0 flex-1">
        <h3 class="font-medium break-words text-slate-900">
          @if (line().item_slug; as slug) {
            <a [routerLink]="['/catalog', 'item', slug]" data-testid="cart-line-link">{{
              line().item_name
            }}</a>
          } @else {
            {{ line().item_name }}
          }
        </h3>
        <p class="mt-0.5 text-xs text-slate-500 break-words" data-testid="cart-line-code">
          {{ line().item_code }}
        </p>

        <p class="mt-1 text-sm text-slate-600">
          <span data-testid="cart-line-quantity">{{ line().quantity }}</span>
          {{ line().uom }}
          <span class="sr-only" i18n="@@cart.line.at">at</span>
          <span aria-hidden="true">&times;</span>
          <span data-testid="cart-line-rate">{{ line().rate | currency: currency() }}</span>
        </p>

        @if (hasDiscount()) {
          <p class="mt-1 text-xs text-green-900" data-testid="cart-line-discount">
            <ng-container i18n="@@cart.line.wasPriced">Was</ng-container>
            {{ line().base_price | currency: currency() }}
            @if (line().pricing_rule_label; as label) {
              <span data-testid="cart-line-rule">&middot; {{ label }}</span>
            }
          </p>
        }
      </div>

      <div class="flex shrink-0 flex-col items-end gap-2">
        <p class="font-semibold text-slate-900" data-testid="cart-line-amount">
          {{ line().amount | currency: currency() }}
        </p>
        @if (line().tax_amount !== 0) {
          <p class="text-xs text-slate-500" data-testid="cart-line-tax">
            <ng-container i18n="@@cart.line.tax">incl. tax</ng-container>
            {{ line().tax_amount | currency: currency() }}
          </p>
        }

        <!-- Quiet, and deliberately not the same weight as Proceed to checkout. Remove
             is a recovery action a buyer occasionally wants, not something the page
             should be steering them towards. Text rather than an outlined button also
             gives a long product name back about 25px of a 390px line. -->
        <button
          yob-button
          variant="quiet-destructive"
          size="sm"
          type="button"
          [loading]="removing()"
          [attr.aria-label]="removeLabel()"
          (click)="remove.emit(line().item_code)"
          data-testid="cart-line-remove"
          i18n="@@cart.line.remove"
        >
          Remove
        </button>
      </div>
    </article>
  `,
})
export class CartLine {
  readonly line = input.required<CartLineDto>();
  readonly currency = input.required<string>();
  readonly removing = input(false);

  /**
   * Emits the `item_code`, which is what the current backend's removal endpoint takes.
   *
   * The part stays presentational: the page owns the store call. It emits rather than
   * removing, so a domain part never reaches into shared state.
   */
  readonly remove = output<string>();

  /**
   * A row-specific accessible name.
   *
   * Every row's visible label is just "Remove", so without this a screen-reader user
   * hears a list of identical buttons with no way to tell which is which.
   */
  protected readonly removeLabel = computed(
    () =>
      $localize`:@@cart.line.remove.label:Remove ${this.line().item_name}:itemName: from your cart`,
  );

  /** Comparison of two backend values - never a derived discount. */
  protected readonly hasDiscount = computed(
    () => this.line().rate < this.line().base_price && this.line().discount_percentage > 0,
  );
}
