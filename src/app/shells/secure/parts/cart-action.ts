import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { CartStore } from '../../../domains/cart/state/cart.store';

/**
 * The cart, as a header action.
 *
 * Icon-led rather than a text link, because the new header spends its horizontal space
 * on search. The accessible name still says "Cart" in full, and the count is announced
 * with it - an icon-only control that reads as "link" to a screen reader would be a
 * regression dressed as a redesign.
 *
 * ## It never fetches
 *
 * The count reads whatever `CartStore` already holds. The header renders on every secure
 * page, so fetching here would put a request on every navigation - including pages with
 * nothing to do with the cart - purely to decorate an icon. The number appears once
 * something has genuinely loaded the cart, and is simply absent before that: a wrong
 * number would be worse than no number.
 */
@Component({
  selector: 'yob-cart-action',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <a
      routerLink="/cart"
      routerLinkActive="text-slate-900"
      ariaCurrentWhenActive="page"
      class="relative flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-slate-700
             hover:bg-slate-50 hover:text-slate-900"
      [attr.aria-label]="label()"
      data-testid="cart-action"
    >
      <svg class="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 4h2l2.4 10.4a1.5 1.5 0 0 0 1.5 1.1h7.7a1.5 1.5 0 0 0 1.5-1.2L20 7H6" />
        <circle cx="9.5" cy="19" r="1.25" />
        <circle cx="17" cy="19" r="1.25" />
      </svg>

      @if (count(); as total) {
        <!-- aria-hidden: the accessible name above already carries the number, and
             hearing it twice on every page is noise rather than help. -->
        <span
          aria-hidden="true"
          class="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-900
                 px-1.5 py-0.5 text-xs font-medium text-white"
          data-testid="nav-cart-count"
          >{{ total }}</span
        >
      }
    </a>
  `,
  host: { class: 'block' },
})
export class CartAction {
  private readonly cart = inject(CartStore);

  /** Absent until something has loaded the cart, and absent when it is empty. */
  protected readonly count = computed(() => this.cart.cart()?.total_quantity ?? 0);

  protected readonly label = computed(() => {
    const total = this.count();
    return total > 0
      ? $localize`:@@nav.cart.withCount:Cart, ${total}:count: items`
      : $localize`:@@nav.cart:Cart`;
  });
}
