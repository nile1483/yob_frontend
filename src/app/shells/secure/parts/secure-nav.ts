import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { CartStore } from '../../../domains/cart/state/cart.store';

/**
 * Primary navigation for the authenticated storefront.
 *
 * A separate piece so the secure shell can move it - beside the brand, under the
 * header, into a sidebar - by relocating one element instead of rewriting markup.
 * That is the whole of the "layout flexibility" story: composition, not configuration.
 *
 * Links are listed literally. When a copied client does not need one, delete the
 * anchor; there is deliberately no enable/disable setting.
 *
 * ## Storefront navigation, not application navigation
 *
 * The active link is marked with weight *and* a bottom rule, not weight alone. A bold
 * word among four other words is easy to miss mid-scan, and this is the only thing
 * telling a buyer where they are.
 *
 * It also carries `aria-current="page"`, which is the same information for someone who
 * cannot see either cue. `routerLinkActive` does not set it on its own - it only swaps
 * classes - so without `ariaCurrentWhenActive` the active state was purely visual.
 *
 * Each link is a 44px-tall target with its own padding, so the row is usable with a
 * thumb at 390px. It scrolls horizontally there rather than wrapping onto a second
 * line, which keeps the header one predictable height on every page.
 *
 * ## The cart count never triggers a request
 *
 * It reads whatever `CartStore` already holds. The shell renders on every secure page,
 * and fetching a cart from here would put a request on every navigation - including
 * pages that have nothing to do with the cart - purely to decorate a link. So the count
 * appears once something has genuinely loaded the cart, and is simply absent before
 * that. A wrong number would be worse than no number.
 */
@Component({
  selector: 'app-secure-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav aria-label="Primary" class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
      <ul class="flex items-center gap-x-1 sm:gap-x-2">
        @for (link of links; track link.path) {
          <li>
            <a
              [routerLink]="link.path"
              routerLinkActive="border-slate-900 font-semibold text-slate-900"
              ariaCurrentWhenActive="page"
              class="flex min-h-11 items-center gap-2 border-b-2 border-transparent px-2 text-sm
                     whitespace-nowrap text-slate-600 hover:text-slate-900"
              >{{ link.label }}

              @if (link.path === '/cart' && cartCount(); as count) {
                <!-- aria-hidden: the count duplicates what the cart page states in full,
                     and "Cart 3" read aloud on every page is noise rather than help. -->
                <span
                  aria-hidden="true"
                  class="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-900
                         px-1.5 py-0.5 text-xs font-medium text-white"
                  data-testid="nav-cart-count"
                  >{{ count }}</span
                >
              }
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
})
export class SecureNav {
  private readonly cart = inject(CartStore);

  /** Absent until something has loaded the cart, and absent when it is empty. */
  protected readonly cartCount = computed(() => this.cart.cart()?.total_quantity ?? 0);

  protected readonly links = [
    { path: '/catalog', label: $localize`:@@nav.catalog:Catalog` },
    { path: '/cart', label: $localize`:@@nav.cart:Cart` },
    { path: '/orders', label: $localize`:@@nav.orders:Orders` },
    { path: '/account', label: $localize`:@@nav.account:Account` },
  ];
}
