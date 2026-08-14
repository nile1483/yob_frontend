import { Component, computed, input } from '@angular/core';

/**
 * One labelled address block on an order.
 *
 * ## Historical, not current
 *
 * The text is the Sales Order's **order-time snapshot**, supplied by the backend. This
 * component never resolves an Address record, and the order's `*_address_name` is not
 * passed to it at all - showing a record identifier where a postal address belongs
 * would be worse than showing nothing, and using it to look up today's master is
 * exactly the bug backend Phase 14.5 removed.
 *
 * ## Rendered as text, deliberately
 *
 * The backend converts the stored snapshot to plain text with real newlines before
 * sending it, so this interpolates it into an `<address>` and lets
 * `white-space: pre-line` do the line breaks.
 *
 * There is **no** `[innerHTML]` here, no sanitizer, and no markup parsing. That is not
 * caution about this particular payload - it is that an order page has no reason to
 * own an HTML rendering path at all, and one added "just in case" is one that can be
 * reached later by content nobody re-checked. A test feeds it markup-shaped text and
 * proves it appears as characters.
 *
 * Read-only by construction: Checkout's address presentation is a *selector*, and none
 * of that belongs on a placed order.
 */
@Component({
  selector: 'app-order-address',
  template: `
    <section [attr.aria-labelledby]="headingId()" [attr.data-testid]="testId()">
      <h3 [id]="headingId()" class="text-sm font-semibold text-slate-900">{{ heading() }}</h3>

      @if (text(); as address) {
        <!-- Interpolation, so every character arrives as text. The pre-line rule
             collapses runs of spaces but honours the newlines the backend sent. -->
        <address class="mt-1 text-sm break-words whitespace-pre-line text-slate-600 not-italic">
          {{ address }}
        </address>
      } @else {
        <p class="mt-1 text-sm text-slate-600" i18n="@@orders.address.none">
          Not recorded for this order.
        </p>
      }
    </section>
  `,
})
export class OrderAddress {
  readonly heading = input.required<string>();
  /** The order-time snapshot: plain text with newlines, or `null`. */
  readonly display = input<string | null>(null);
  readonly testId = input.required<string>();

  private static nextId = 0;
  private readonly instance = OrderAddress.nextId++;
  protected readonly headingId = computed(() => `order-address-${this.instance}`);

  /** Blank-but-present text is treated as absent, so an empty block is never rendered. */
  protected readonly text = computed(() => {
    const value = this.display();
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  });
}
