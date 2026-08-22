import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Alert } from '../../../design/alert/alert';
import { Badge } from '../../../design/badge/badge';
import { EmptyState } from '../../../design/empty-state/empty-state';
import { PageHeader } from '../../../design/page-header/page-header';
import { Spinner } from '../../../design/spinner/spinner';
import { OrdersApi } from '../data/orders.api';
import { orderStatusLabel, orderStatusTone } from '../orders.status';
import { ContentSlot } from '../../content/parts/content-slot';

/**
 * Order history.
 *
 * ## State decision: page-local, no store
 *
 * Same reasoning as Catalog. Orders are read-only, route-derived, and read by exactly
 * one page each - there is no second consumer that must agree with this one, and
 * nothing mutates. A store would owe a cache-invalidation policy for a problem that
 * does not exist. `rxResource` gives loading, error and value as signals and discards
 * the request with the page.
 *
 * ## A list, not a table
 *
 * Five fields per order, one of which is a long identifier. A desktop table would
 * force either a horizontal scroll or truncation on a 390px phone, and the data is not
 * something a buyer scans in columns. Each row is a real `<a>` wrapping the order -
 * not a clickable `div` with a click handler - so it is keyboard reachable, focusable
 * and openable in a new tab for free.
 *
 * ## Currency comes from the row
 *
 * Backend Phase 14.5 added `currency` to each row. The environment-default fallback
 * this page needed while the field was absent is gone: on a financial record, a
 * plausible-looking wrong currency is worse than an unformatted number.
 */
@Component({
  selector: 'app-orders-page',
  imports: [Alert, Badge, CurrencyPipe, DatePipe, EmptyState, PageHeader, RouterLink, Spinner, ContentSlot],
  template: `
    <app-page-header
      heading="Your orders"
      i18n-heading="@@orders.heading"
      lead="Everything you have ordered, most recent first."
      i18n-lead="@@orders.lead"
    />

    <!-- Merchant content for this route. The position is ours; what appears
         in it is the merchant's, and an empty slot renders nothing. -->
    <yob-content-slot routeKey="orders" slotKey="above_list" />

    @if (orders.isLoading()) {
      <div class="mt-8 flex justify-center" data-testid="orders-loading">
        <app-spinner label="Loading your orders" i18n-label="@@orders.loading" />
      </div>
    } @else if (orders.error()) {
      <div class="mt-6" data-testid="orders-error">
        <app-alert tone="error">
          <span i18n="@@orders.error">We could not load your orders. Please try again.</span>
        </app-alert>
      </div>
    } @else if (isEmpty()) {
      <!-- No orders is a normal state for a new buyer, not a failure. -->
      <div class="mt-8" data-testid="orders-empty">
        <app-empty-state>
          <h2 emptyTitle i18n="@@orders.empty.title">You have no orders yet</h2>
          <p emptyBody i18n="@@orders.empty.body">Orders you place will appear here.</p>
          <a
            emptyAction
            routerLink="/catalog"
            class="underline underline-offset-4"
            i18n="@@orders.empty.action"
            >Browse the catalog</a
          >
        </app-empty-state>
      </div>
    } @else {
      <!-- A divided list rather than a stack of cards: these rows are the same kind of
           thing repeated, and a border around each one adds no information while making
           the page look like a settings screen. -->
      <ul
        class="mt-6 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200"
        data-testid="orders-list"
      >
        @for (order of orders.value(); track order.name) {
          <li>
            <!-- Fixed columns on desktop, so status and amount line up down the list
                 instead of floating after order numbers of different lengths. -->
            <a
              [routerLink]="['/orders', order.name]"
              class="grid gap-2 p-4 hover:bg-slate-50
                     sm:grid-cols-[minmax(0,1fr)_10rem_8rem] sm:items-center sm:gap-4"
              data-testid="order-row"
            >
              <span class="min-w-0">
                <!-- break-all: order names are long unbroken tokens and would otherwise
                     push the row wider than a phone. -->
                <span class="block font-medium break-all" data-testid="order-row-name">
                  {{ order.name }}
                </span>
                @if (order.transaction_date) {
                  <span class="mt-0.5 block text-sm text-slate-500" data-testid="order-row-date">
                    {{ order.transaction_date | date: 'mediumDate' }}
                  </span>
                }
              </span>

              <!-- Status as words. Colour reinforces them and never replaces them. -->
              <span class="sm:justify-self-start">
                <app-badge [tone]="statusTone(order.status)" data-testid="order-row-status">
                  {{ statusLabel(order.status) }}
                </app-badge>
              </span>

              <span
                class="font-semibold tabular-nums sm:justify-self-end"
                data-testid="order-row-total"
              >
                {{ order.grand_total | currency: order.currency }}
              </span>
            </a>
          </li>
        }
      </ul>
    }

    <yob-content-slot routeKey="orders" slotKey="below_list" />
  `,
})
export class OrdersPage {
  private readonly api = inject(OrdersApi);

  protected readonly orders = rxResource({ stream: () => this.api.getOrders() });

  /** Distinguishes "no orders" from "not loaded yet". */
  protected readonly isEmpty = computed(() => (this.orders.value() ?? []).length === 0);

  protected statusLabel(status: string): string {
    return orderStatusLabel(status);
  }

  protected statusTone(status: string) {
    return orderStatusTone(status);
  }
}
