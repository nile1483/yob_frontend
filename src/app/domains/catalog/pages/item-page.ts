import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Alert } from '../../../design/alert/alert';
import { Button } from '../../../design/button/button';
import { Field } from '../../../design/field/field';
import { EmptyState } from '../../../design/empty-state/empty-state';
import { Spinner } from '../../../design/spinner/spinner';
import { YobApiError } from '../../../foundation/network/yob-api-error';
import { CartStore } from '../../cart/state/cart.store';
import { CATALOG_CURRENCY } from '../catalog.currency';
import type { ItemDetailDto } from '../contracts/catalog.types';
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
 * ## Quantity and repricing
 *
 * The quantity feeds `get_item(slug, qty)`, so the backend reprices for the chosen
 * quantity and the page displays whatever it returns. Repricing is driven by the
 * input's native `change` event - fired on blur or Enter, not per keystroke - so
 * typing "250" cannot produce three requests. No debounce, no timers, nothing to tune.
 *
 * Stale responses cannot win: the resource keys on the quantity, so changing it
 * cancels the previous request outright. A test proves an older quantity's response
 * cannot overwrite a newer one's pricing.
 *
 * The verified backend rule is the only rule enforced: a float greater than zero. No
 * integer, step, maximum or stock constraint is invented, because the contract has
 * none. Non-finite input is rejected before a request is made.
 */
@Component({
  selector: 'app-item-page',
  imports: [Alert, Button, CurrencyPipe, EmptyState, Field, RouterLink, Spinner],
  template: `
    <nav aria-label="Breadcrumb" i18n-aria-label="@@item.breadcrumb.label">
      <a routerLink="/catalog" class="text-sm text-slate-600 underline underline-offset-4"
        ><ng-container i18n="@@item.breadcrumb.back">Back to catalog</ng-container></a
      >
    </nav>

    @if (item.isLoading() && detail() === undefined) {
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
    } @else if (detail(); as detail) {
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

            @if (isRepricing()) {
              <span class="text-sm text-slate-500" data-testid="item-repricing">
                <app-spinner label="Updating price" i18n-label="@@item.repricing" />
              </span>
            }

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

          <form class="flex flex-col gap-3" (submit)="addToCart($event, detail.name)">
            <app-field
              label="Quantity"
              i18n-label="@@item.quantity.label"
              [error]="quantityError()"
            >
              <input
                type="number"
                step="any"
                inputmode="decimal"
                [value]="quantity()"
                (input)="onQuantityInput($event)"
                (change)="onQuantityCommitted($event)"
                data-testid="item-quantity"
                class="w-32 rounded-md border border-slate-300 px-3 py-2 text-base sm:text-sm"
              />
            </app-field>

            <div>
              <button
                yob-button
                type="submit"
                [loading]="cart.isAdding()"
                [disabled]="!isQuantityValid()"
                data-testid="add-to-cart"
                i18n="@@item.addToCart"
              >
                Add to cart
              </button>
            </div>

            @if (addedMessage()) {
              <div data-testid="add-to-cart-success">
                <app-alert tone="success">
                  <span i18n="@@item.added">Added to your cart.</span>
                  <a routerLink="/cart" class="underline underline-offset-4" i18n="@@item.viewCart"
                    >View cart</a
                  >
                </app-alert>
              </div>
            }

            @if (addErrorMessage(); as message) {
              <div data-testid="add-to-cart-error">
                <app-alert tone="error">{{ message }}</app-alert>
              </div>
            }
          </form>

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

  protected readonly cart = inject(CartStore);

  /** Live value, updated per keystroke. Drives validation and the add payload. */
  protected readonly quantity = signal(1);

  /**
   * The quantity the backend has been asked to price for.
   *
   * Updated on `change` (blur/Enter) rather than `input`, which is what keeps
   * repricing to one request per decision instead of one per digit.
   */
  private readonly pricedQuantity = signal(1);

  protected readonly isQuantityValid = computed(() => isPositiveFinite(this.quantity()));

  protected readonly quantityError = computed(() =>
    this.quantityTouched() && !this.isQuantityValid()
      ? $localize`:@@item.quantity.invalid:Enter a quantity greater than zero.`
      : '',
  );

  private readonly quantityTouched = signal(false);
  private readonly addedSignal = signal(false);

  protected readonly addedMessage = this.addedSignal.asReadonly();

  protected readonly item = rxResource({
    params: () => ({ slug: this.itemSlug(), qty: this.pricedQuantity() }),
    stream: ({ params }) => this.api.getItem(params.slug, params.qty),
  });

  /**
   * The item currently on screen.
   *
   * A resource clears its value while reloading, which for a quantity change would
   * blank the page and unmount the very control the user is operating - losing their
   * focus mid-edit. So the last loaded item is retained *for the same slug* and the
   * reprice is shown inline instead.
   *
   * Keyed on the slug so it never leaks across items: navigating to a different item
   * drops the previous one immediately rather than showing it under the new URL.
   */
  protected readonly detail = linkedSignal<
    { slug: string; value: ItemDetailDto | undefined },
    ItemDetailDto | undefined
  >({
    source: () => ({ slug: this.itemSlug(), value: this.item.value() }),
    computation: (next, previous) =>
      next.value ?? (previous?.source.slug === next.slug ? previous.value : undefined),
  });

  /** A reprice in flight over content that is already on screen. */
  protected readonly isRepricing = computed(
    () => this.item.isLoading() && this.detail() !== undefined,
  );

  protected readonly addErrorMessage = computed(() => {
    const error = this.cart.addError();
    if (error === null) {
      return null;
    }
    switch (error.code) {
      case 'quantity_invalid':
        return $localize`:@@item.add.quantityInvalid:Enter a quantity greater than zero.`;
      case 'item_not_found':
        return $localize`:@@item.add.itemNotFound:This item is no longer available.`;
      default:
        return $localize`:@@item.add.failed:We could not add this item to your cart. Please try again.`;
    }
  });

  protected onQuantityInput(event: Event): void {
    this.quantityTouched.set(true);
    this.addedSignal.set(false);
    this.quantity.set(readNumber(event));
  }

  /** Reprice only for a quantity the backend would accept. */
  protected onQuantityCommitted(event: Event): void {
    const value = readNumber(event);
    this.quantity.set(value);
    if (isPositiveFinite(value)) {
      this.pricedQuantity.set(value);
    }
  }

  protected addToCart(event: Event, itemCode: string): void {
    event.preventDefault();
    this.quantityTouched.set(true);
    this.addedSignal.set(false);

    if (!this.isQuantityValid()) {
      return;
    }

    // The cart store drops a second call while one is in flight, so a double click
    // cannot produce two adds.
    this.cart.add(itemCode, this.quantity()).subscribe(() => this.addedSignal.set(true));
  }

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

/** The verified backend rule, and nothing more: a finite number greater than zero. */
function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** `NaN` for a blank or unparseable field, which `isPositiveFinite` then rejects. */
function readNumber(event: Event): number {
  return Number((event.target as HTMLInputElement).value);
}
