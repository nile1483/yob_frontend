import { CurrencyPipe } from '@angular/common';
import { Component, input } from '@angular/core';

import type { CartDocDto } from '../../cart/contracts/cart.types';
import { CartSummary } from '../../cart/parts/cart-summary';

/**
 * What is being bought, beside the details being filled in.
 *
 * The totals block is the cart's own `CartSummary`, reused unchanged - it reads server
 * figures and contains no cart-specific controls, so there is nothing to strip out and
 * no reason for checkout to own a second version that could round differently.
 *
 * The line list is checkout's own, and short deliberately. `CartLine` carries a Remove
 * button, and removing items is the cart's job; a buyer part-way through entering an
 * address should be reading a confirmation, not being offered a way to change it here.
 * There is a link back to the cart for that.
 *
 * Every number is the backend's. Nothing on this page multiplies or adds anything.
 */
@Component({
  selector: 'app-checkout-summary',
  imports: [CartSummary, CurrencyPipe],
  template: `
    <div class="flex flex-col gap-4">
      <section aria-labelledby="checkout-items-heading" data-testid="checkout-items">
        <h2
          id="checkout-items-heading"
          class="text-base font-semibold text-slate-900"
          i18n="@@checkout.items.heading"
        >
          Items
        </h2>

        <ul class="mt-3 flex flex-col gap-3">
          @for (line of cart().items; track line.item_code) {
            <li class="flex justify-between gap-4 text-sm" data-testid="checkout-item">
              <span class="min-w-0">
                <span class="block font-medium break-words">{{ line.item_name }}</span>
                <span class="block text-slate-600">
                  <!-- Quantity is shown, never edited: the cart owns changes. -->
                  {{ line.quantity }} {{ line.uom }} ×
                  {{ line.rate | currency: cart().currency }}
                </span>
              </span>
              <span class="shrink-0 font-medium" data-testid="checkout-item-total">
                {{ line.total_amount | currency: cart().currency }}
              </span>
            </li>
          }
        </ul>
      </section>

      <app-cart-summary [cart]="cart()" />
    </div>
  `,
})
export class CheckoutSummary {
  readonly cart = input.required<CartDocDto>();
}
