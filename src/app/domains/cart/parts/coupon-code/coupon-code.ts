import { Component, computed, inject, signal } from '@angular/core';

import { Alert } from '../../../../design/alert/alert';
import { Button } from '../../../../design/button/button';
import { Field } from '../../../../design/field/field';
import { CartStore } from '../../state/cart.store';

/**
 * The cart's coupon control.
 *
 * ## Why this lives in Cart and not in `design/` or a shared widget
 *
 * It is visually a small widget, which is a tempting reason to generalise it. It is
 * not a general one: it reads `CartStore` directly and has no meaning away from a
 * cart. Cart is also the only place the product puts it - not catalog, not checkout,
 * not the payment page - so a shared abstraction would have exactly one caller and
 * would owe an inputs/outputs contract nobody needs. It moves if a second caller
 * appears.
 *
 * ## There is no CouponStore, deliberately
 *
 * The applied coupon *is* cart state: the backend re-evaluates eligibility on every
 * reprice, so adding an item or a plain reconciliation can drop or change it. A
 * separate store would be a second copy of that truth, free to disagree with the
 * totals rendered directly beside it. Everything below is a `computed` over
 * `CartStore`; the only local state is the text the buyer is currently typing.
 *
 * ## Nothing here calculates money
 *
 * No percentage, no subtraction, no eligibility check, no minimum-spend rule. The code
 * is submitted and the server's cart is displayed. The discount appears in the summary
 * because the server put it there.
 */
@Component({
  selector: 'app-coupon-code',
  imports: [Alert, Button, Field],
  host: { class: 'contents' },
  template: `
    <!-- No heading of its own: the field's label already says "Coupon code", and the
         two together rendered it twice. Secondary to the totals and the checkout button
         by construction - a bordered box rather than a filled panel, and no primary
         action inside it. -->
    <section
      class="rounded-lg border border-slate-200 p-4"
      aria-label="Coupon code"
      i18n-aria-label="@@cart.coupon.heading"
      data-testid="cart-coupon"
    >
      @if (store.hasCoupon()) {
        <!-- Applied. The code shown is the server's, never what was typed: the backend
             upper-cases and trims it, and only the canonical cart says it stuck. -->
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="flex items-center gap-2 text-sm text-slate-900" data-testid="cart-coupon-applied">
            <!-- Decorative: the adjacent text carries the meaning, so the state is
                 never colour- or glyph-only. -->
            <span aria-hidden="true" class="text-green-700">✓</span>
            <span>
              <span class="font-medium">{{ store.couponCode() }}</span>
              <span i18n="@@cart.coupon.applied"> applied</span>
            </span>
          </p>

          <button
            yob-button
            variant="quiet"
            size="sm"
            type="button"
            [loading]="store.couponPending() === 'remove'"
            [disabled]="store.couponPending() !== null"
            (click)="onRemove()"
            data-testid="cart-coupon-remove"
            i18n="@@cart.coupon.remove"
          >
            Remove
          </button>
        </div>
      } @else {
        <!-- A real form, so Enter submits it exactly as the browser does, and the
             submit button needs no click handler of its own. The native submit event
             is used rather than ngSubmit because ngSubmit is a FormsModule directive
             output, and this field needs no forms machinery. -->
        <form class="flex flex-wrap items-end gap-3" (submit)="onSubmit($event)" novalidate>
          <div class="min-w-0 flex-1">
            <app-field label="Coupon code" i18n-label="@@cart.coupon.label" [error]="errorMessage()">
              <!-- A plain native input bound to a signal, with no forms module.
                   One optional text field needs no validators, no form group and no
                   ControlValueAccessor - and ngModel writes its model asynchronously,
                   which would make every test await stability to observe a keystroke. -->
              <input
                type="text"
                name="couponCode"
                [value]="draft()"
                (input)="onInput($event)"
                [disabled]="store.couponPending() !== null"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                placeholder="Enter coupon code"
                i18n-placeholder="@@cart.coupon.placeholder"
                class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm
                       disabled:cursor-not-allowed disabled:bg-slate-50"
                data-testid="cart-coupon-input"
              />
            </app-field>
          </div>

          <button
            yob-button
            variant="secondary"
            type="submit"
            [loading]="store.couponPending() === 'apply'"
            [disabled]="!canApply()"
            data-testid="cart-coupon-apply"
            i18n="@@cart.coupon.apply"
          >
            Apply
          </button>
        </form>
      }

      @if (unconfirmedMessage(); as message) {
        <div class="mt-3" data-testid="cart-coupon-unconfirmed">
          <!-- The info tone, not error: we do not know that anything failed, and
               the palette has no separate warning tone. -->
          <app-alert tone="info">{{ message }}</app-alert>
        </div>
      }
    </section>
  `,
})
export class CouponCode {
  protected readonly store = inject(CartStore);

  /** The only local state: what the buyer is typing. Never the applied coupon. */
  protected readonly draft = signal('');

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  /**
   * Enabled only with something to send and nothing in flight.
   *
   * The blank guard is client-side because the server's `coupon_code_required` refusal
   * for an empty box tells the buyer nothing they cannot already see.
   */
  protected readonly canApply = computed(
    () => this.draft().trim() !== '' && this.store.couponPending() === null,
  );

  /**
   * Apply the typed code.
   *
   * Fired by both the Apply button and Enter, and safe for either to repeat: the store
   * drops a call while one is in flight, so a double click or a held Enter still
   * produces exactly one request. That guard is explicit, not a debounce - a debounce
   * would only make a second request less likely.
   *
   * The draft is **kept** on purpose. A rejected code is usually a typo, and clearing
   * the box would make the buyer retype it to fix one character.
   */
  protected onSubmit(event: Event): void {
    // Stop the browser navigating; this is an RPC, not a form post.
    event.preventDefault();
    this.store.applyCoupon(this.draft()).subscribe();
  }

  protected onRemove(): void {
    this.store.removeCoupon().subscribe();
  }

  /**
   * The buyer-facing message for a definite refusal.
   *
   * Mapped from the backend's stable `code`, never rendered from its `detail`. The
   * detail is safe to display but is server-authored English, so using it would put
   * untranslated text on a localised page.
   *
   * `coupon_minimum_not_met` / `coupon_maximum_exceeded` do carry the threshold in
   * `details.minimum_amount` / `maximum_amount`, but `YobApiError.context` is a
   * three-key allow-list by design and those are not on it. Rather than widen a
   * security boundary for a nicety, the message says what to do without the figure.
   * The trade is recorded in `docs/PROJECT-STATE.md`.
   */
  protected readonly errorMessage = computed(() => {
    const error = this.store.couponError();
    if (error === null) {
      return '';
    }

    switch (error.code) {
      case 'coupon_invalid':
        return $localize`:@@cart.coupon.error.invalid:That coupon code is not valid.`;
      case 'coupon_expired':
        return $localize`:@@cart.coupon.error.expired:That coupon has expired.`;
      case 'coupon_not_active':
        return $localize`:@@cart.coupon.error.notActive:That coupon is not active yet.`;
      case 'coupon_usage_limit_reached':
        return $localize`:@@cart.coupon.error.usageLimit:That coupon has reached its usage limit.`;
      case 'coupon_not_applicable':
        return $localize`:@@cart.coupon.error.notApplicable:That coupon cannot be used with this cart.`;
      case 'coupon_minimum_not_met':
        return $localize`:@@cart.coupon.error.minimum:Your cart total is below the minimum for that coupon.`;
      case 'coupon_maximum_exceeded':
        return $localize`:@@cart.coupon.error.maximum:Your cart total is above the maximum for that coupon.`;
      case 'coupon_code_required':
        return $localize`:@@cart.coupon.error.required:Enter a coupon code.`;
      case 'coupon_not_applied':
        return $localize`:@@cart.coupon.error.notApplied:There is no coupon on this cart.`;
      default:
        return $localize`:@@cart.coupon.error.generic:We could not update the coupon. Please try again.`;
    }
  });

  /**
   * The message for an outcome we could not determine.
   *
   * Separate from {@link errorMessage} because it is a different fact. Saying "that
   * coupon is not valid" when the request may well have succeeded would be a
   * confident lie, and would invite the buyer to submit again.
   */
  protected readonly unconfirmedMessage = computed(() => {
    switch (this.store.couponUnconfirmed()) {
      case 'refreshed':
        return $localize`:@@cart.coupon.unconfirmed.refreshed:We could not confirm that change, so your cart has been refreshed. It now shows the current coupon.`;
      case 'unknown':
        return $localize`:@@cart.coupon.unconfirmed.unknown:We could not confirm that change or reload your cart. Please check your cart before trying again.`;
      default:
        return null;
    }
  });
}
