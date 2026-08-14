import { CurrencyPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Button } from '../../../design/button/button';

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
  imports: [Button, CurrencyPipe, RouterLink],
  host: { class: 'contents' },
  template: `
    <article
      class="flex flex-col gap-3 border-b border-slate-200 py-4 sm:flex-row sm:items-start sm:gap-4"
      data-testid="cart-line"
    >
      <div class="size-20 shrink-0 overflow-hidden rounded-md bg-slate-50">
        @if (line().image; as image) {
          <img [src]="image" alt="" class="h-full w-full object-cover" />
        }
      </div>

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
          <span aria-hidden="true">&times;</span>
          <span class="sr-only" i18n="@@cart.line.at">at</span>
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

      <div class="flex shrink-0 flex-col items-start gap-2 sm:items-end">
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
             should be steering them towards. -->
        <button
          yob-button
          variant="destructive"
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
