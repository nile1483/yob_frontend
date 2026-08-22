import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Alert } from '../../../design/alert/alert';
import { Badge } from '../../../design/badge/badge';
import { EmptyState } from '../../../design/empty-state/empty-state';
import { Spinner } from '../../../design/spinner/spinner';
import { normalizeYobFailure } from '../../../foundation/network/yob-api-error';
import { OrdersApi } from '../data/orders.api';
import {
  capturedPayment,
  orderPaymentLabel,
  orderPaymentState,
  orderStatusLabel,
  orderStatusTone,
} from '../orders.status';
import { OrderAddress } from '../parts/order-address';
import { ContentSlot } from '../../content/parts/content-slot';

/**
 * One order, in full.
 *
 * Read-only, page-local state, same shape as the list - the id comes from the route as
 * a signal input, an `rxResource` keys on it, and four explicit states are rendered.
 *
 * ## Every figure is the server's
 *
 * `original_total`, `discount`, `subtotal`, `net_total`, `tax` and `grand_total` are
 * all computed by the backend, including the discount, which it derives from the lines.
 * Nothing here adds a column up. If a hand-rolled sum ever disagreed with the backend,
 * the backend would be right and the page would be lying about what was charged.
 *
 * ## Item names are not links
 *
 * The order line exposes `item_code` and `item_name` but no slug, and on this bench
 * the code *is* the name. Building a catalog URL from either would be constructing a
 * route from a display string, so the names render as text.
 */
@Component({
  selector: 'app-order-page',
  imports: [Alert, Badge, CurrencyPipe, DatePipe, EmptyState, OrderAddress, RouterLink, Spinner, ContentSlot],
  template: `
    <nav aria-label="Breadcrumb" i18n-aria-label="@@orders.breadcrumb.label">
      <a routerLink="/orders" class="text-sm text-slate-600 underline underline-offset-4"
        ><ng-container i18n="@@orders.breadcrumb.back">Back to your orders</ng-container></a
      >
    </nav>

    <!-- Merchant content for this route. The position is ours; what appears
         in it is the merchant's, and an empty slot renders nothing. -->
    <yob-content-slot routeKey="order_detail" slotKey="above_order" />

    @if (order.isLoading()) {
      <div class="mt-8 flex justify-center" data-testid="order-loading">
        <app-spinner label="Loading order" i18n-label="@@order.loading" />
      </div>
    } @else if (notFound()) {
      <!-- An order that does not exist and one belonging to someone else answer
           identically. The wording must not imply we know which - we do not. -->
      <div class="mt-6" data-testid="order-not-found">
        <app-empty-state>
          <h1 emptyTitle i18n="@@order.notFound.title">Order not available</h1>
          <p emptyBody i18n="@@order.notFound.body">
            We could not find this order on your account.
          </p>
          <a
            emptyAction
            routerLink="/orders"
            class="underline underline-offset-4"
            i18n="@@order.notFound.action"
            >Back to your orders</a
          >
        </app-empty-state>
      </div>
    } @else if (order.error()) {
      <div class="mt-6" data-testid="order-error">
        <app-alert tone="error">
          <span i18n="@@order.error">We could not load this order. Please try again.</span>
        </app-alert>
      </div>
    } @else if (order.value(); as detail) {
      <!-- Capped measure. An order with one line has genuinely little content, and
           stretching it across a 1440px viewport put the item name most of a screen away
           from its price and every totals label a screenful from its figure. Capping the
           column is the honest fix; padding the page with invented content is not. The
           cap is generous enough that a twenty-line order still uses it well. -->
      <article class="mt-4 flex max-w-3xl flex-col gap-8">
        <header>
          <h1 class="text-2xl font-semibold tracking-tight break-all" data-testid="order-name">
            {{ detail.name }}
          </h1>

          <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <app-badge [tone]="statusTone()" data-testid="order-status">
              {{ statusLabel() }}
            </app-badge>
            <app-badge [tone]="isPaid() ? 'success' : 'warning'" data-testid="order-payment-status">
              {{ paymentLabel() }}
            </app-badge>
            @if (detail.transaction_date) {
              <span class="text-sm text-slate-600" data-testid="order-date">
                <ng-container i18n="@@order.placedOn">Placed</ng-container>
                {{ detail.transaction_date | date: 'mediumDate' }}
              </span>
            }
          </div>
        </header>

        <!-- ------------------------------------------------------------ items -->
        <section aria-labelledby="order-items-heading" data-testid="order-items">
          <h2 id="order-items-heading" class="text-lg font-semibold" i18n="@@order.items.heading">
            Items
          </h2>

          <ul class="mt-3 flex flex-col gap-3">
            @for (line of detail.items; track line.item_code) {
              <li
                class="flex flex-col gap-1 border-b border-slate-100 pb-3 sm:flex-row
                       sm:justify-between sm:gap-4"
                data-testid="order-line"
              >
                <span class="min-w-0">
                  <span class="block font-medium break-words" data-testid="order-line-name">
                    {{ line.item_name ?? line.item_code }}
                  </span>
                  <span class="block text-sm text-slate-600">
                    {{ line.qty }} {{ line.uom }} ×
                    {{ line.rate | currency: detail.currency }}
                    @if (line.discount_amount > 0) {
                      <span class="text-green-900" data-testid="order-line-discount">
                        (−{{ line.discount_amount | currency: detail.currency }})
                      </span>
                    }
                  </span>
                </span>
                <span class="shrink-0 font-medium sm:text-right" data-testid="order-line-amount">
                  {{ line.amount | currency: detail.currency }}
                </span>
              </li>
            }
          </ul>
        </section>

        <!-- ----------------------------------------------------------- totals -->
        <section aria-labelledby="order-totals-heading" data-testid="order-totals">
          <h2 id="order-totals-heading" class="text-lg font-semibold" i18n="@@order.totals.heading">
            Totals
          </h2>

          <!-- A narrow block, aligned right: totals are read as a column of figures,
               and a label stranded opposite its amount across a wide page is not. -->
          <dl class="mt-3 ml-auto flex w-full max-w-sm flex-col gap-2 text-sm [&_dd]:tabular-nums">
            <div class="flex justify-between gap-4">
              <dt i18n="@@order.totals.subtotal">Subtotal</dt>
              <dd data-testid="order-subtotal">
                {{ detail.subtotal | currency: detail.currency }}
              </dd>
            </div>

            @if (detail.discount !== 0) {
              <div class="flex justify-between gap-4 text-green-900">
                <dt i18n="@@order.totals.discount">Discount</dt>
                <dd data-testid="order-discount">
                  {{ detail.discount | currency: detail.currency }}
                </dd>
              </div>
            }

            @if (detail.tax !== 0) {
              <div class="flex justify-between gap-4">
                <dt i18n="@@order.totals.tax">Tax</dt>
                <dd data-testid="order-tax">{{ detail.tax | currency: detail.currency }}</dd>
              </div>
            }

            <div
              class="mt-1 flex items-baseline justify-between gap-4 border-t border-slate-200 pt-3"
            >
              <dt class="text-base font-semibold" i18n="@@order.totals.grandTotal">Total</dt>
              <dd class="text-lg font-semibold tabular-nums" data-testid="order-grand-total">
                {{ detail.grand_total | currency: detail.currency }}
              </dd>
            </div>
          </dl>
        </section>

        <!-- ---------------------------------------------------------- payment -->
        @if (payment(); as paid) {
          <section aria-labelledby="order-payment-heading" data-testid="order-payment">
            <h2
              id="order-payment-heading"
              class="text-lg font-semibold"
              i18n="@@order.payment.heading"
            >
              Payment
            </h2>
            <dl class="mt-3 ml-auto flex w-full max-w-sm flex-col gap-2 text-sm [&_dd]:tabular-nums">
              @if (paid.payment_method) {
                <div class="flex justify-between gap-4">
                  <dt i18n="@@order.payment.method">Method</dt>
                  <!-- The provider's own word, capitalized for display only - the value
                       is still exactly what the backend stored, never re-mapped. -->
                  <dd class="capitalize" data-testid="order-payment-method">
                    {{ paid.payment_method }}
                  </dd>
                </div>
              }
              @if (paid.razorpay_payment_id) {
                <div class="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <dt i18n="@@order.payment.reference">Payment reference</dt>
                  <dd class="break-all" data-testid="order-payment-reference">
                    {{ paid.razorpay_payment_id }}
                  </dd>
                </div>
              }
            </dl>
          </section>
        }

        <!-- ------------------------------------------------------- who / where -->
        <section aria-labelledby="order-details-heading">
          <h2
            id="order-details-heading"
            class="text-lg font-semibold"
            i18n="@@order.details.heading"
          >
            Order details
          </h2>

          <!-- Auto-flowing columns rather than a fixed two-up: with contact, billing
               and shipping the third cell used to wrap alone and leave an obvious hole
               beside it. -->
          <div class="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            @if (contactLines().length > 0) {
              <section aria-labelledby="order-contact-heading" data-testid="order-contact">
                <h3
                  id="order-contact-heading"
                  class="text-sm font-semibold text-slate-900"
                  i18n="@@order.contact.heading"
                >
                  Contact
                </h3>
                <div class="mt-1 text-sm break-words text-slate-600">
                  @for (line of contactLines(); track line) {
                    <span class="block">{{ line }}</span>
                  }
                </div>
              </section>
            }

            <app-order-address
              heading="Billing address"
              i18n-heading="@@order.billing.heading"
              testId="order-billing"
              [display]="detail.billing_address_display"
            />

            <!-- Keyed on the snapshot, not the reference: an order with a shipping
                 link but no recorded address has nothing to show here. -->
            @if (detail.shipping_address_display) {
              <app-order-address
                heading="Shipping address"
                i18n-heading="@@order.shipping.heading"
                testId="order-shipping"
                [display]="detail.shipping_address_display"
              />
            }
          </div>
        </section>
      </article>
    }

    <yob-content-slot routeKey="order_detail" slotKey="below_order" />
  `,
})
export class OrderPage {
  /** Bound from `/orders/:orderId`. The Sales Order name, which is the lookup key. */
  readonly orderId = input.required<string>();

  private readonly api = inject(OrdersApi);

  protected readonly order = rxResource({
    params: () => ({ orderId: this.orderId() }),
    stream: ({ params }) => this.api.getOrderDetails(params.orderId),
  });

  /**
   * Unknown order, or someone else's.
   *
   * Deliberately one state. The backend answers both with `order_not_found` so that
   * changing the id in the URL cannot be used to discover another customer's orders,
   * and reporting them differently would hand back exactly what it withheld.
   */
  protected readonly notFound = computed(() => {
    const error = this.order.error();
    if (error === undefined || error === null) {
      return false;
    }
    return normalizeYobFailure(error).code === 'order_not_found';
  });

  protected readonly statusLabel = computed(() => {
    const detail = this.order.value();
    return detail === undefined ? '' : orderStatusLabel(detail.status);
  });

  protected readonly payment = computed(() => {
    const detail = this.order.value();
    return detail === undefined ? null : capturedPayment(detail);
  });

  /** Same mapping the orders list uses, so one order never reads two ways. */
  protected readonly statusTone = computed(() => {
    const detail = this.order.value();
    return detail === undefined ? 'neutral' : orderStatusTone(detail.status);
  });

  protected readonly isPaid = computed(() => {
    const detail = this.order.value();
    return detail !== undefined && orderPaymentState(detail) === 'paid';
  });

  protected readonly paymentLabel = computed(() => {
    const detail = this.order.value();
    return detail === undefined ? '' : orderPaymentLabel(orderPaymentState(detail));
  });

  /**
   * Contact details the order actually recorded.
   *
   * On every real order the bench holds, `contact_email` and `contact_mobile` are
   * `null` while `contact_person` is set - so this filters rather than assuming all
   * three are present, and the section disappears entirely when none are.
   */
  protected readonly contactLines = computed<readonly string[]>(() => {
    const detail = this.order.value();
    if (detail === undefined) {
      return [];
    }
    return [detail.contact_person, detail.contact_email, detail.contact_mobile].filter(
      (value): value is string => typeof value === 'string' && value.trim() !== '',
    );
  });
}
