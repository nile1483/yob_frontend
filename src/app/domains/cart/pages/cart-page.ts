import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Alert } from '../../../design/alert/alert';
import { EmptyState } from '../../../design/empty-state/empty-state';
import { Spinner } from '../../../design/spinner/spinner';
import { PageHeader } from '../../../design/page-header/page-header';
import { CartLine } from '../parts/cart-line';
import { CartSummary } from '../parts/cart-summary';
import { CouponCode } from '../parts/coupon-code/coupon-code';
import { toCartRowViews } from '../cart.rows';
import { CartStore } from '../state/cart.store';

/**
 * The cart.
 *
 * Reads `CartStore` and renders it. The page owns no cart truth of its own, which is
 * the point of the store existing: item detail can change the cart and this page shows
 * the result without either of them maintaining a private copy.
 */
@Component({
  selector: 'app-cart-page',
  imports: [PageHeader, Alert, CartLine, CartSummary, CouponCode, EmptyState, RouterLink, Spinner],
  template: `
    <app-page-header heading="Your cart" i18n-heading="@@cart.heading" />

    <!-- Outside the state branches on purpose: when the server withdraws every line
         the cart becomes empty, and "your cart is empty" with no explanation is
         exactly the silent reconciliation this must avoid. -->
    @if (reconciliationMessage(); as message) {
      <div class="mt-6" data-testid="cart-reconciliation">
        <app-alert tone="info">{{ message }}</app-alert>
      </div>
    }

    @if (store.justRemoved()) {
      <div class="mt-6" data-testid="cart-removed">
        <app-alert tone="success">
          <span i18n="@@cart.removed">Item removed from your cart.</span>
        </app-alert>
      </div>
    }

    @if (removeErrorMessage(); as message) {
      <div class="mt-6" data-testid="cart-remove-error">
        <app-alert tone="error">{{ message }}</app-alert>
      </div>
    }

    @if (showsLoading()) {
      <div class="mt-8 flex justify-center" data-testid="cart-loading">
        <app-spinner label="Loading your cart" i18n-label="@@cart.loading" />
      </div>
    } @else if (store.error()) {
      <div class="mt-6" data-testid="cart-error">
        <app-alert tone="error">
          <span i18n="@@cart.error">We could not load your cart. Please try again.</span>
        </app-alert>
      </div>
    } @else if (store.isEmpty()) {
      <div class="mt-8" data-testid="cart-empty">
        <app-empty-state>
          <h2 emptyTitle i18n="@@cart.empty.title">Your cart is empty</h2>
          <p emptyBody i18n="@@cart.empty.body">Items you add will appear here.</p>
          <a
            emptyAction
            routerLink="/catalog"
            class="underline underline-offset-4"
            i18n="@@cart.empty.action"
            >Browse the catalog</a
          >
        </app-empty-state>
      </div>
    } @else if (store.cart(); as cart) {
      <div class="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <!-- A list, not a table: a price table is unreadable on a 390px phone, and
             nothing here is genuinely tabular data a user needs to scan in columns. -->
        <!-- Priced rows, not intent rows: pricing_rows is what ERPNext actually
             charged, including promotion rows the buyer never asked for. Tracked by
             row_id because one SKU legitimately appears twice - once Paid, once
             Promotion - and tracking by item code would make one replace the other. -->
        <ul data-testid="cart-lines">
          @for (view of rowViews(); track view.row.row_id) {
            <li>
              <app-cart-line
                [view]="view"
                [currency]="cart.currency"
                [removing]="store.removingItemCode() === view.row.item_code"
                (remove)="onRemove($event)"
              />
            </li>
          }
        </ul>

        <div class="flex flex-col gap-4">
          <app-cart-summary [cart]="cart" />

          <!-- Directly above checkout, and inside this branch on purpose: the branch
               only renders with lines, so an empty cart never shows a coupon form.
               A coupon on nothing to buy is an invitation to an error - and the
               backend has a known defect where it reports success for exactly that. -->
          <app-coupon-code />

          <!-- Only reachable with something to buy: checkout renders an empty state
               otherwise, and offering it here would be an invitation to a dead end. -->
          <a
            routerLink="/checkout"
            class="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2
                   text-sm font-medium text-white transition-colors hover:bg-slate-700"
            data-testid="cart-checkout-link"
            i18n="@@cart.checkout"
          >
            Proceed to checkout
          </a>
        </div>
      </div>
    }
  `,
})
export class CartPage {
  protected readonly store = inject(CartStore);

  /**
   * What the cart shows: the priced projection, joined to the intent rows for the
   * thumbnail, the product link and the readable offer wording.
   *
   * Totals are **not** derived from these rows - they come from the cart document, which
   * is the only thing that has seen taxes, coupons and transaction-level discounts.
   */
  protected readonly rowViews = computed(() =>
    toCartRowViews(this.store.pricingRows(), this.store.lines()),
  );

  constructor() {
    // The store may already hold a payload from an add on item detail; reload anyway
    // so the page always shows what the server says right now.
    this.store.load().subscribe();
  }

  /**
   * Remove a line.
   *
   * `item_code` is what the current backend takes. Nothing is removed locally - the
   * store replaces its state from the `get_cart` that follows the mutation, so a
   * failure leaves the line exactly where it was.
   */
  protected onRemove(itemCode: string): void {
    this.store.removeItem(itemCode).subscribe();
  }

  protected readonly removeErrorMessage = computed(() => {
    const error = this.store.removeError();
    if (error === null) {
      return null;
    }
    return $localize`:@@cart.remove.failed:We could not remove that item. Please try again.`;
  });

  /** Only show the spinner on a first load, not on a refresh over existing content. */
  protected readonly showsLoading = computed(
    () => this.store.isLoading() && !this.store.isLoaded(),
  );

  /**
   * Explain a cart that changed underneath the user.
   *
   * Counts, not item codes: the contract gives us internal identifiers, and a buyer
   * cannot do anything with `YOB-BOLT-M10`. The codes stay in the store for later
   * per-line use.
   */
  protected readonly reconciliationMessage = computed(() => {
    const removed = this.store.removedItemCodes().length;
    const repriced = this.store.priceUpdatedItemCodes().length;

    if (removed > 0 && repriced > 0) {
      return $localize`:@@cart.reconciled.both:Some items were removed because they are no longer available, and some prices were updated.`;
    }
    if (removed > 0) {
      return $localize`:@@cart.reconciled.removed:Some items were removed from your cart because they are no longer available.`;
    }
    if (repriced > 0) {
      return $localize`:@@cart.reconciled.repriced:Some prices in your cart were updated.`;
    }
    return null;
  });
}
