import { CurrencyPipe } from '@angular/common';
import { Component, input } from '@angular/core';

import type { CartDocDto } from '../contracts/cart.types';

/**
 * Cart totals.
 *
 * Every figure is read straight off the cart document. Nothing here adds lines
 * together - if the backend and a hand-rolled sum ever disagreed, the backend would be
 * right and the page would be lying.
 */
@Component({
  selector: 'app-cart-summary',
  imports: [CurrencyPipe],
  host: { class: 'contents' },
  template: `
    <section
      class="rounded-lg border border-slate-200 bg-slate-50/60 p-4"
      aria-labelledby="cart-summary-heading"
      data-testid="cart-summary"
    >
      <h2 id="cart-summary-heading" class="text-base font-semibold text-slate-900" i18n="@@cart.summary.heading">
        Order summary
      </h2>

      <dl class="mt-3 flex flex-col gap-2 text-sm">
        <div class="flex justify-between gap-4">
          <dt i18n="@@cart.summary.quantity">Total quantity</dt>
          <dd data-testid="cart-total-quantity">{{ cart().total_quantity }}</dd>
        </div>

        <div class="flex justify-between gap-4">
          <dt i18n="@@cart.summary.netTotal">Net total</dt>
          <dd data-testid="cart-net-total">{{ cart().net_total | currency: cart().currency }}</dd>
        </div>

        @if (cart().total_discount !== 0) {
          <div class="flex justify-between gap-4 text-green-900">
            <dt i18n="@@cart.summary.discount">Discount</dt>
            <dd data-testid="cart-total-discount">
              {{ cart().total_discount | currency: cart().currency }}
            </dd>
          </div>
        }

        <!-- Separate from the discount row above because the backend keeps them
             separate: total_discount is the item/pricing-rule discount and applies with
             or without a coupon, while coupon_discount is the transaction-level amount
             the coupon produced. Verified against the running backend - applying a
             coupon moved coupon_discount 0 -> 27.00 while total_discount stayed 15.00.
             Two rows, never combined here. -->
        @if (cart().coupon_discount !== 0) {
          <div class="flex justify-between gap-4 text-green-900">
            <dt i18n="@@cart.summary.couponDiscount">Coupon discount</dt>
            <dd data-testid="cart-coupon-discount">
              {{ cart().coupon_discount | currency: cart().currency }}
            </dd>
          </div>
        }

        @if (cart().tax_total !== 0) {
          <div class="flex justify-between gap-4">
            <dt i18n="@@cart.summary.tax">Tax</dt>
            <dd data-testid="cart-tax-total">{{ cart().tax_total | currency: cart().currency }}</dd>
          </div>
        }

        <div
          class="mt-2 flex justify-between gap-4 border-t border-slate-200 pt-3 text-base font-semibold"
        >
          <dt i18n="@@cart.summary.grandTotal">Total</dt>
          <dd data-testid="cart-grand-total">
            {{ cart().grand_total | currency: cart().currency }}
          </dd>
        </div>
      </dl>
    </section>
  `,
})
export class CartSummary {
  readonly cart = input.required<CartDocDto>();
}
