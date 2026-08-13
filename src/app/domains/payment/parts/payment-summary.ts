import { CurrencyPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';

import { isCartBacked, type PaymentCheckoutDto } from '../contracts/payment.types';

/** One line, reduced to what both source shapes can actually supply. */
interface SummaryLine {
  readonly key: string;
  readonly label: string;
  readonly quantity: number;
  readonly uom: string | null;
  readonly rate: number;
  readonly amount: number;
}

/**
 * What is being paid for.
 *
 * Renders **either** source shape. The two are genuinely different - a cart document
 * with rich lines, or a flat order with `items[]` and addresses as bare name strings -
 * so the differences are handled here, once, rather than by pretending an order still
 * has a cart.
 *
 * ## What it does not do
 *
 * No arithmetic. The amount owed is `data.amount` from the immutable Payment Request,
 * and the per-line figures are the server's. A cart-backed view additionally shows the
 * cart's own totals because the server supplies them; the order-backed view shows only
 * what the order shape carries, rather than summing lines to invent a subtotal the
 * server did not state.
 *
 * Addresses render as names when that is all the server gave. Fetching address details
 * to make the two views look alike would be inventing a request the contract does not
 * define.
 */
@Component({
  selector: 'app-payment-summary',
  imports: [CurrencyPipe],
  template: `
    <section
      class="rounded-lg border border-slate-200 p-4"
      aria-labelledby="payment-summary-heading"
      data-testid="payment-summary"
    >
      <h2
        id="payment-summary-heading"
        class="text-lg font-semibold"
        i18n="@@payment.summary.heading"
      >
        Order summary
      </h2>

      <p class="mt-1 text-sm text-slate-600">
        <span data-testid="payment-source-reference">{{ reference() }}</span>
      </p>

      @if (orderStatus(); as status) {
        <p class="mt-1 text-sm text-slate-600" data-testid="payment-order-status">
          <ng-container i18n="@@payment.summary.orderStatus">Order status</ng-container>:
          {{ status }}
        </p>
      }

      <ul class="mt-3 flex flex-col gap-3">
        @for (line of lines(); track line.key) {
          <li class="flex justify-between gap-4 text-sm" data-testid="payment-line">
            <span class="min-w-0">
              <span class="block font-medium break-words">{{ line.label }}</span>
              <span class="block text-slate-600">
                {{ line.quantity }} {{ line.uom }} × {{ line.rate | currency: data().currency }}
              </span>
            </span>
            <span class="shrink-0 font-medium">{{ line.amount | currency: data().currency }}</span>
          </li>
        }
      </ul>

      <dl class="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-3 text-sm">
        @if (cartTotals(); as totals) {
          @if (totals.total_discount !== 0) {
            <div class="flex justify-between gap-4 text-green-900">
              <dt i18n="@@payment.summary.discount">Discount</dt>
              <dd>{{ totals.total_discount | currency: data().currency }}</dd>
            </div>
          }
          @if (totals.tax_total !== 0) {
            <div class="flex justify-between gap-4">
              <dt i18n="@@payment.summary.tax">Tax</dt>
              <dd data-testid="payment-tax">{{ totals.tax_total | currency: data().currency }}</dd>
            </div>
          }
        }

        <div class="flex justify-between gap-4 text-base font-semibold">
          <dt i18n="@@payment.summary.amountDue">Amount due</dt>
          <dd data-testid="payment-amount">{{ data().amount | currency: data().currency }}</dd>
        </div>
      </dl>

      <div class="mt-4 flex flex-col gap-2 text-sm text-slate-600">
        @if (billing(); as address) {
          <p data-testid="payment-billing">
            <ng-container i18n="@@payment.summary.billing">Billing</ng-container>: {{ address }}
          </p>
        }
        @if (shipping(); as address) {
          <p data-testid="payment-shipping">
            <ng-container i18n="@@payment.summary.shipping">Shipping</ng-container>: {{ address }}
          </p>
        }
        @if (contact(); as person) {
          <p data-testid="payment-contact">
            <ng-container i18n="@@payment.summary.contact">Contact</ng-container>: {{ person }}
          </p>
        }
      </div>
    </section>
  `,
})
export class PaymentSummary {
  readonly data = input.required<PaymentCheckoutDto>();

  /** The order or cart this payment is for, shown so the buyer can quote it. */
  protected readonly reference = computed(() => this.data().source_name);

  /** Only orders have a status; carts have not been committed yet. */
  protected readonly orderStatus = computed(() => {
    const data = this.data();
    return isCartBacked(data) ? null : data.order_status;
  });

  protected readonly lines = computed<readonly SummaryLine[]>(() => {
    const data = this.data();

    if (isCartBacked(data)) {
      return data.cart.items.map((item, index) => ({
        // Cart rows report `item_name` as null in the verified capture, so the code is
        // the only label available - and it is a real, quotable identifier here.
        key: `${item.item_code}-${index}`,
        label: item.item_name ?? item.item_code,
        quantity: item.quantity,
        uom: item.uom,
        rate: item.rate,
        amount: item.amount,
      }));
    }

    return data.items.map((item, index) => ({
      key: `${item.item_code}-${index}`,
      label: item.item_name ?? item.item_code,
      quantity: item.quantity,
      uom: item.uom,
      rate: item.rate,
      amount: item.amount,
    }));
  });

  /** Cart-backed only: the server states these, so they can be shown. */
  protected readonly cartTotals = computed(() => {
    const data = this.data();
    return isCartBacked(data) ? data.cart : null;
  });

  protected readonly billing = computed(() => addressLabel(this.data(), 'billing_address'));
  protected readonly shipping = computed(() => addressLabel(this.data(), 'shipping_address'));

  protected readonly contact = computed(() => {
    const data = this.data();
    if (isCartBacked(data)) {
      return data.contact?.full_name ?? data.contact?.name ?? null;
    }
    return data.contact_person;
  });
}

/**
 * A displayable address, from whichever form the source shape uses.
 *
 * Cart-backed gives an object; Sales-Order-backed gives a record name string. The
 * object's `display` field is deliberately unused - it is backend-rendered HTML that
 * embeds a GSTIN.
 */
function addressLabel(
  data: PaymentCheckoutDto,
  field: 'billing_address' | 'shipping_address',
): string | null {
  const value = data[field];

  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  const parts = [value.city, value.state, value.pincode, value.country].filter(
    (part): part is string => typeof part === 'string' && part !== '',
  );

  return parts.length > 0 ? parts.join(', ') : value.name;
}
