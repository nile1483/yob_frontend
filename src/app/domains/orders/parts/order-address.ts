import { Component, computed, input } from '@angular/core';

import type { OrderAddressDto } from '../contracts/orders.types';

/**
 * One labelled address block on an order.
 *
 * Read-only by construction. Checkout's address presentation is a *selector* - radios,
 * an add form, a busy state - and none of that belongs on a placed order, so this
 * renders the same fields without importing any of that machinery.
 *
 * Each block is its own labelled `section`, so a screen-reader user can tell billing
 * from shipping without inferring it from position.
 */
@Component({
  selector: 'app-order-address',
  template: `
    <section [attr.aria-labelledby]="headingId()" [attr.data-testid]="testId()">
      <h3 [id]="headingId()" class="text-sm font-semibold text-slate-900">{{ heading() }}</h3>

      @if (lines().length === 0) {
        <p class="mt-1 text-sm text-slate-600">{{ fallback() }}</p>
      } @else {
        <address class="mt-1 text-sm break-words text-slate-600 not-italic">
          @for (line of lines(); track line) {
            <span class="block">{{ line }}</span>
          }
        </address>
      }
    </section>
  `,
})
export class OrderAddress {
  readonly heading = input.required<string>();
  readonly address = input<OrderAddressDto | undefined>(undefined);
  /** The record name, shown when the order references an address it could not resolve. */
  readonly addressName = input<string | null>(null);
  readonly testId = input.required<string>();

  private static nextId = 0;
  private readonly instance = OrderAddress.nextId++;
  protected readonly headingId = computed(() => `order-address-${this.instance}`);

  /**
   * The address as displayable lines.
   *
   * Only what the server returned, in postal order, with blanks dropped. `phone` is
   * included because the order carries it and a buyer checking a delivery wants it.
   */
  protected readonly lines = computed<readonly string[]>(() => {
    const address = this.address();
    if (address === undefined) {
      return [];
    }

    const cityState = [address.city, address.state].filter(present).join(', ');
    const postal = [address.pincode, address.country].filter(present).join(' ');

    return [
      address.address_title,
      address.address_line1,
      address.address_line2,
      cityState,
      postal,
      address.phone,
    ].filter(present);
  });

  /** When the order names an address the endpoint did not resolve, say so plainly. */
  protected readonly fallback = computed(
    () => this.addressName() ?? $localize`:@@orders.address.none:Not recorded for this order.`,
  );
}

function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
