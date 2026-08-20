import { CurrencyPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Badge } from '../../../design/badge/badge';
import { Button } from '../../../design/button/button';
import { Media } from '../../../design/media/media';

import type { CartRowView } from '../cart.rows';
import type { CartTaxComponentDto } from '../contracts/cart.types';

/**
 * One cart line.
 *
 * Displays backend figures and nothing else - `amount` and `total_amount` are the
 * server's, never `rate * quantity`. A cart-specific part, because it understands the
 * cart contract; it is not the catalog item card wearing a different hat.
 */
@Component({
  selector: 'app-cart-line',
  imports: [Badge, Button, CurrencyPipe, Media, RouterLink],
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
        [src]="view().image"
        alt=""
        ratio="product"
        sizes=""
        testId="cart-line-media"
      />

      <div class="min-w-0 flex-1">
        <h3 class="font-medium break-words text-slate-900">
          @if (view().slug; as slug) {
            <a [routerLink]="['/catalog', 'item', slug]" data-testid="cart-line-link">{{
              row().item_name
            }}</a>
          } @else {
            {{ row().item_name }}
          }
        </h3>
        <p class="mt-0.5 text-xs text-slate-500 break-words" data-testid="cart-line-code">
          {{ row().item_code }}
        </p>

        @if (isPromotion()) {
          <p class="mt-1">
            <app-badge tone="success" data-testid="cart-line-promotion" i18n="@@cart.line.free">
              Free
            </app-badge>
          </p>
          <p class="mt-1 text-sm text-slate-600">
            <span data-testid="cart-line-quantity">{{ row().qty }}</span>
            <!-- No whitespace before the comma: the surrounding elements would otherwise
                 render "1 Nos , added by an offer". -->
            {{ row().uom }}<ng-container i18n="@@cart.line.addedByOffer"
              >, added by an offer</ng-container
            >
          </p>
        } @else {
          <p class="mt-1 text-sm text-slate-600">
            <span data-testid="cart-line-quantity">{{ row().qty }}</span>
            {{ row().uom }}
            <span class="sr-only" i18n="@@cart.line.at">at</span>
            <span aria-hidden="true">&times;</span>
            <span data-testid="cart-line-rate">{{ row().rate | currency: currency() }}</span>
          </p>

          @if (hasDiscount()) {
            <p class="mt-1 text-xs text-green-900" data-testid="cart-line-discount">
              <ng-container i18n="@@cart.line.wasPriced">Was</ng-container>
              {{ row().base_price | currency: currency() }}
              @if (view().ruleLabel; as label) {
                <span data-testid="cart-line-rule">&middot; {{ label }}</span>
              }
            </p>
          }
        }
        @if (taxComponents().length > 0) {
          <!-- The explanatory breakdown, in the details column rather than beside the
               money: at 390px it is the longest string on the line, and in the narrow
               right-hand column it squeezed the product name onto three lines.
               Text, not colour, carries which tax is which - and a component is shown
               whenever the backend sent one, including a zero amount on a promotion. -->
          <p class="mt-1 text-xs text-slate-500" data-testid="cart-line-tax-components">
            @for (part of taxComponents(); track $index) {
              @if (!$first) {
                <span aria-hidden="true"> &middot; </span>
              }
              <span data-testid="cart-line-tax-component"
                >{{ componentLabel(part) }} {{ part.rate }}%
                {{ part.amount | currency: currency() }}</span
              >
            }
          </p>
        }
      </div>

      <div class="flex shrink-0 flex-col items-end gap-1">
        <!-- Every figure here is read, never derived. total_amount in particular is
             NOT net plus tax: with an inclusive tax the backend returns amount 100,
             net 84.75, tax 15.25 and total 100, and adding the tax back would bill the
             buyer for it twice. -->
        <p class="font-semibold text-slate-900" data-testid="cart-line-amount">
          {{ row().amount | currency: currency() }}
        </p>

        @if (row().tax_amount !== 0) {
          <p class="text-xs text-slate-500" data-testid="cart-line-tax">
            <ng-container i18n="@@cart.line.tax">Tax</ng-container>
            {{ row().tax_amount | currency: currency() }}
          </p>

          <p class="text-sm font-medium text-slate-900" data-testid="cart-line-total">
            <ng-container i18n="@@cart.line.total">Total</ng-container>
            {{ row().total_amount | currency: currency() }}
          </p>
        }

        <!-- Quiet, and deliberately not the same weight as Proceed to checkout. Remove
             is a recovery action a buyer occasionally wants, not something the page
             should be steering them towards. Text rather than an outlined button also
             gives a long product name back about 25px of a 390px line. -->
        <!-- Only for a row the buyer owns. A promotion row is ERPNext output that can
             change or disappear after any mutation, so offering Remove on one would
             imply an ownership - and a control - that does not exist. -->
        @if (view().mutable) {
          <button
            yob-button
            variant="quiet-destructive"
            size="sm"
            type="button"
            [loading]="removing()"
            [attr.aria-label]="removeLabel()"
            (click)="remove.emit(row().item_code)"
            data-testid="cart-line-remove"
            i18n="@@cart.line.remove"
          >
            Remove
          </button>
        }
      </div>
    </article>
  `,
})
export class CartLine {
  /** The priced projection row plus its presentation join. See {@link CartRowView}. */
  readonly view = input.required<CartRowView>();
  readonly currency = input.required<string>();
  readonly removing = input(false);

  /**
   * Emits the `item_code`, which is what the current backend's removal endpoint takes.
   *
   * The part stays presentational: the page owns the store call. It emits rather than
   * removing, so a domain part never reaches into shared state.
   */
  readonly remove = output<string>();

  /** The priced row itself - every figure on screen comes from here. */
  protected readonly row = computed(() => this.view().row);

  /** Read from the backend's explicit role, never inferred from a zero rate. */
  protected readonly isPromotion = computed(() => this.row().line_role === 'Promotion');

  /**
   * The breakdown behind this row's tax, in the backend's own order.
   *
   * Belongs to *this* row: a promotion row shows its own components, never the paid
   * row's, even when the two are the same SKU.
   */
  protected readonly taxComponents = computed(() => this.row().tax_components);

  /**
   * What to call a tax component.
   *
   * `tax_type` when ERPNext classified it, otherwise the backend's own `label`. A
   * component with no classification is real - a company without GST registration
   * produces them - so it is named, not hidden, and never relabelled "GST" on a guess.
   */
  protected componentLabel(part: CartTaxComponentDto): string {
    return part.tax_type ?? part.label;
  }

  /**
   * A row-specific accessible name.
   *
   * Every row's visible label is just "Remove", so without this a screen-reader user
   * hears a list of identical buttons with no way to tell which is which.
   */
  protected readonly removeLabel = computed(
    () =>
      $localize`:@@cart.line.remove.label:Remove ${this.row().item_name}:itemName: from your cart`,
  );

  /** Comparison of two backend values - never a derived discount. */
  protected readonly hasDiscount = computed(
    () => this.row().rate < this.row().base_price && this.row().discount_percentage > 0,
  );
}
