import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Alert } from '../../../design/alert/alert';
import { EmptyState } from '../../../design/empty-state/empty-state';
import { Spinner } from '../../../design/spinner/spinner';
import { YobApiError } from '../../../foundation/network/yob-api-error';
import { CATALOG_CURRENCY } from '../catalog.currency';
import { CatalogApi } from '../data/catalog.api';

/**
 * Item detail.
 *
 * Same shape as `CategoryPage`, deliberately: slug in as a signal input, page-local
 * `rxResource`, four explicit states. No store - one page reads this data and it is
 * entirely route-derived. Nothing new was needed architecturally to show one item,
 * which is the point.
 *
 * ## Prices are displayed, never derived
 *
 * Every figure is the backend's. The only logic is comparing `rate` with `base_price`
 * to decide whether to decorate a discount, and even the percentage shown is the
 * backend's `discount_percentage` - not something computed from those two numbers.
 *
 * ## Quantity
 *
 * The request sends no quantity, so the backend prices for 1. There is no quantity
 * control because there is nothing to do with one yet; it arrives with add-to-cart,
 * where changing it has a purpose and a reason to re-price.
 */
@Component({
  selector: 'app-item-page',
  imports: [Alert, CurrencyPipe, EmptyState, RouterLink, Spinner],
  template: `
    <nav aria-label="Breadcrumb" i18n-aria-label="@@item.breadcrumb.label">
      <a routerLink="/catalog" class="text-sm text-slate-600 underline underline-offset-4"
        ><ng-container i18n="@@item.breadcrumb.back">Back to catalog</ng-container></a
      >
    </nav>

    @if (item.isLoading()) {
      <div class="mt-8 flex justify-center" data-testid="item-loading">
        <app-spinner label="Loading item" i18n-label="@@item.loading" />
      </div>
    } @else if (notFound()) {
      <div class="mt-6" data-testid="item-not-found">
        <app-empty-state>
          <h1 emptyTitle i18n="@@item.notFound.title">Item not found</h1>
          <p emptyBody i18n="@@item.notFound.body">
            This item may have been renamed or is no longer available to your account.
          </p>
          <a
            emptyAction
            routerLink="/catalog"
            class="underline underline-offset-4"
            i18n="@@item.notFound.action"
            >Browse the catalog</a
          >
        </app-empty-state>
      </div>
    } @else if (item.error()) {
      <div class="mt-6" data-testid="item-error">
        <app-alert tone="error">
          <span i18n="@@item.error">We could not load this item. Please try again.</span>
        </app-alert>
      </div>
    } @else if (item.value(); as detail) {
      <article class="mt-4 grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          @if (detail.image; as image) {
            <img
              [src]="image"
              [alt]="detail.item_name"
              class="w-full rounded-lg border border-slate-200 object-cover"
              data-testid="item-image"
            />
          } @else {
            <div
              class="aspect-square w-full rounded-lg bg-slate-100"
              aria-hidden="true"
              data-testid="item-image-placeholder"
            ></div>
          }
        </div>

        <div class="flex flex-col gap-4">
          <header>
            <h1
              class="text-2xl font-semibold tracking-tight break-words"
              data-testid="item-title"
            >
              {{ detail.item_name }}
            </h1>
            <p class="mt-1 text-sm text-slate-500 break-words">
              <span class="sr-only" i18n="@@item.code">Item code</span>
              {{ detail.name }}
            </p>
          </header>

          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span class="text-3xl font-semibold text-slate-900" data-testid="item-rate">
              {{ detail.rate | currency: currency }}
            </span>

            @if (hasDiscount()) {
              <s class="text-base text-slate-500" data-testid="item-base-price">
                {{ detail.base_price | currency: currency }}
              </s>
              <span
                class="rounded bg-green-100 px-2 py-0.5 text-sm font-medium text-green-900"
                data-testid="item-discount"
                i18n="@@item.discount"
              >
                {{ detail.discount_percentage }}% off
              </span>
            }
          </div>

          <p class="text-sm text-slate-600" data-testid="item-uom">
            <ng-container i18n="@@item.pricedPer">Priced per</ng-container>
            {{ detail.uom }}
          </p>

          @if (detail.pricing_rule_label; as label) {
            <p class="text-sm text-slate-700" data-testid="item-pricing-rule">{{ label }}</p>
          }

          <!-- Only worth showing when tax actually applies; with no tax the breakdown
               would just repeat the price on three lines. -->
          @if (showsTaxBreakdown()) {
            <dl
              class="flex flex-col gap-1 rounded-md border border-slate-200 p-3 text-sm"
              data-testid="item-tax-breakdown"
            >
              <div class="flex justify-between gap-4">
                <dt i18n="@@item.netAmount">Net amount</dt>
                <dd>{{ detail.net_amount | currency: currency }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt data-testid="item-tax-label">
                  {{ detail.tax_label ?? defaultTaxLabel }}
                </dt>
                <dd data-testid="item-tax-amount">
                  {{ detail.tax_amount | currency: currency }}
                </dd>
              </div>
              <div class="flex justify-between gap-4 font-medium">
                <dt i18n="@@item.totalAmount">Total</dt>
                <dd data-testid="item-total-amount">
                  {{ detail.total_amount | currency: currency }}
                </dd>
              </div>
            </dl>
          }

          @if (detail.available_rules.length > 0) {
            <section data-testid="item-offers">
              <h2 class="text-sm font-semibold" i18n="@@item.offers.heading">Available offers</h2>
              <ul class="mt-1 list-disc pl-5 text-sm text-slate-700">
                @for (offer of detail.available_rules; track offer) {
                  <li>{{ offer }}</li>
                }
              </ul>
            </section>
          }
        </div>
      </article>
    }
  `,
})
export class ItemPage {
  /** Bound from the `:itemSlug` route parameter. */
  readonly itemSlug = input.required<string>();

  private readonly api = inject(CatalogApi);

  protected readonly currency = inject(CATALOG_CURRENCY);

  /** Fallback when the backend supplies an amount but no label for it. */
  protected readonly defaultTaxLabel = $localize`:@@item.taxLabelFallback:Tax`;

  protected readonly item = rxResource({
    params: () => ({ slug: this.itemSlug() }),
    stream: ({ params }) => this.api.getItem(params.slug),
  });

  /**
   * A missing item is a destination, not a fault.
   *
   * Branches on the stable `item_not_found` code. Everything else - including the raw
   * Frappe 403 the bench currently produces for items, which normalises to
   * `client_permission_denied` - falls through to the generic error. The user stays
   * signed in: a permission denial from a business endpoint says nothing about the
   * session, and nothing here treats it as if it did.
   */
  protected readonly notFound = computed(() => {
    const error = this.item.error();
    return error instanceof YobApiError && error.code === 'item_not_found';
  });

  protected readonly hasDiscount = computed(() => {
    const detail = this.item.value();
    return detail !== undefined && detail.rate < detail.base_price && detail.discount_percentage > 0;
  });

  protected readonly showsTaxBreakdown = computed(() => {
    const detail = this.item.value();
    return detail !== undefined && (detail.tax_amount !== 0 || detail.tax_label !== null);
  });
}
