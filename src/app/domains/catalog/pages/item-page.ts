import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Alert } from '../../../design/alert/alert';
import { Badge } from '../../../design/badge/badge';
import { Media } from '../../../design/media/media';
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
 * ## Quantity is local (Phase 23B-2)
 *
 * Choosing a quantity changes a signal and nothing else. It issues **no** request of any
 * kind - not a reprice, not a cart call - until Add to cart.
 *
 * The price on this page is the customer's standalone preview for the backend's default
 * quantity. The transaction rate is settled only when the whole cart is priced as one
 * ERPNext document, where quantity rules, mixed conditions, transaction-amount rules and
 * coupons all apply and none can be previewed per item. So the page shows the preview,
 * sends the chosen quantity once, and takes whatever the cart comes back with as
 * authoritative - a difference between the two is legitimate, not a defect.
 *
 * Repricing per committed quantity was removed with that reasoning. It also made a
 * misconfigured Pricing Rule break the page outright: a tier conflict at one quantity
 * turned typing into "We could not load this item".
 *
 * The verified backend rule is the only rule enforced: a float greater than zero. No
 * integer, step, maximum or stock constraint is invented, because the contract has none -
 * and availability is shown for information, never as a purchase limit.
 */
@Component({
  selector: 'app-item-page',
  imports: [Alert, Badge, Button, CurrencyPipe, EmptyState, Field, Media, RouterLink, Spinner],
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
      <article class="mt-4 grid grid-cols-1 gap-8 md:grid-cols-2 md:items-start lg:gap-12">
        <!-- Sticky on desktop so the product stays in view while the buy box and the
             specifications below it are read. -->
        <div class="md:sticky md:top-24">
          <!-- The buying surface's main image: larger than a card, the whole product
               visible, and capped in height so a tall portrait cannot push the price and
               Add to cart below the fold on a laptop. Named here rather than left with an
               empty alt - unlike a card, this image is the subject of the page. It is
               the only image in the storefront loaded with priority. -->
          <app-media
            class="overflow-hidden rounded-lg border border-slate-200"
            [src]="detail.image"
            [alt]="detail.item_name"
            ratio="hero"
            [priority]="true"
            sizes="(min-width: 768px) 50vw, 100vw"
            testId="item-image"
          />
        </div>

        <div class="flex flex-col gap-5">
          <header>
            <h1
              class="text-2xl font-semibold tracking-tight break-words sm:text-3xl"
              data-testid="item-title"
            >
              {{ detail.item_name }}
            </h1>
            <p class="mt-1 text-sm break-words text-slate-500">
              <span class="sr-only" i18n="@@item.code">Item code</span>
              {{ detail.name }}
            </p>
          </header>

          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span class="text-3xl font-semibold text-slate-900" data-testid="item-rate">
              {{ detail.rate | currency: currency }}
            </span>

            @if (hasDiscount()) {
              <s class="text-base text-slate-400" data-testid="item-base-price">
                {{ detail.base_price | currency: currency }}
              </s>
              <app-badge tone="success" data-testid="item-discount" i18n="@@item.discount">
                {{ detail.discount_percentage }}% off
              </app-badge>
            }
          </div>

          <div class="-mt-3 flex flex-col gap-1">
            <p class="text-sm text-slate-600" data-testid="item-uom">
              <ng-container i18n="@@item.pricedPer">Priced per</ng-container>
              {{ detail.uom }}
            </p>

            @if (availability(); as available) {
              <p class="text-sm text-slate-600" data-testid="item-availability">
                <ng-container i18n="@@item.available">Available</ng-container>:
                {{ available.qty }} {{ available.uom }}
              </p>
            }

            @if (detail.pricing_rule_label; as label) {
              <p class="text-sm text-slate-700" data-testid="item-pricing-rule">{{ label }}</p>
            }
          </div>

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

          <!-- The one thing this page exists for, so it is grouped and separated from
               the description rather than being another paragraph in the stack. Still a
               plain bordered block: an oversized hero treatment on a functional buy box
               would be decoration competing with the price above it. -->
          <form
            class="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
            (submit)="addToCart($event, detail.name)"
          >
            <app-field
              label="Quantity to add"
              i18n-label="@@item.quantity.label"
              hint="Added to whatever is already in your cart."
              i18n-hint="@@item.quantity.hint"
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
                class="w-full sm:w-auto sm:min-w-48"
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

            @if (addUnconfirmedMessage(); as message) {
              <!-- Not an error and not a success. Adding is non-idempotent, so
                   claiming either way would be a guess with a real cost. -->
              <div data-testid="add-to-cart-unconfirmed">
                <app-alert tone="info">{{ message }}</app-alert>
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

  protected readonly isQuantityValid = computed(() => isPositiveFinite(this.quantity()));

  protected readonly quantityError = computed(() =>
    this.quantityTouched() && !this.isQuantityValid()
      ? $localize`:@@item.quantity.invalid:Enter a quantity greater than zero.`
      : '',
  );

  private readonly quantityTouched = signal(false);
  private readonly addedSignal = signal(false);

  protected readonly addedMessage = this.addedSignal.asReadonly();

  /**
   * The item, priced once for the backend's default quantity.
   *
   * ## Quantity does not reprice (Phase 23B-2)
   *
   * This used to key on the chosen quantity, so every commit issued a `get_item` call.
   * That was wrong twice over. It implied the displayed figure was the transaction price
   * for that quantity, when the real rate is only settled once the whole cart is priced
   * as one document - quantity rules, mixed conditions, transaction-amount rules and
   * coupons all apply there and cannot be previewed per item. And it made a
   * misconfigured Pricing Rule break the page: a tier conflict at qty 5 turned typing a
   * quantity into "We could not load this item".
   *
   * So the price shown is the customer's **standalone preview** at the backend's default
   * quantity, and choosing a quantity is purely local until Add to cart. Whatever the
   * cart comes back with afterwards is authoritative, and may legitimately differ.
   */
  protected readonly item = rxResource({
    params: () => ({ slug: this.itemSlug() }),
    stream: ({ params }) => this.api.getItem(params.slug),
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
  /**
   * The item currently on screen.
   *
   * A plain read of the resource since Phase 23B-2. It used to retain the previous value
   * across a reload, because a quantity change refetched and a cleared resource would
   * blank the page under the control the buyer was operating. Quantity no longer
   * refetches, so the only reload is a slug change - where retaining the old item would
   * show one product's details under another's URL.
   */
  protected readonly detail = computed(() =>
    this.item.hasValue() ? this.item.value() : undefined,
  );

  /**
   * Stock on hand, or `null` when availability does not apply or is not known.
   *
   * Three different situations, deliberately not collapsed:
   *
   * - **not a stock item** - availability is meaningless, so nothing is shown. Saying
   *   "out of stock" about a service would be wrong, not merely unhelpful.
   * - **stock item, `actual_qty` is `null`** - ERPNext resolved no transaction warehouse,
   *   so the quantity is unknown. Rendering `0` here would invent a stock position the
   *   system never reported, and telling a buyer a stocked product is sold out when it
   *   may not be is the more damaging of the two possible mistakes.
   * - **stock item with a number, including `0`** - a real quantity from a real
   *   warehouse, shown as it is. Zero is a fact worth telling the buyer.
   *
   * Counted in `stock_uom`: `actual_qty` is a stock figure, and labelling it with the
   * selling UOM would misstate it whenever the two differ.
   *
   * Informational only. Nothing here restricts what may be added - ERPNext owns that.
   */
  protected readonly availability = computed(() => {
    const item = this.detail();
    if (item === undefined || item.is_stock_item !== 1 || item.actual_qty === null) {
      return null;
    }
    return { qty: item.actual_qty, uom: item.stock_uom };
  });

  /**
   * Wording for an add whose outcome we could not determine.
   *
   * Deliberately says neither "added" nor "not added". `add_to_cart` applies a delta
   * and is not idempotent, so a lost response may still have been applied - and a
   * buyer told "not added" would add again and buy twice as much.
   */
  protected readonly addUnconfirmedMessage = computed(() => {
    switch (this.cart.addUnconfirmed()) {
      case 'refreshed':
        return $localize`:@@item.add.unconfirmed.refreshed:We couldn't confirm the cart update. Your cart has been refreshed.`;
      case 'unknown':
        return $localize`:@@item.add.unconfirmed.unknown:We couldn't confirm the cart update. Please check your cart before adding this again.`;
      default:
        return null;
    }
  });

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

  /**
   * Commit the typed quantity. Local only - no request of any kind.
   *
   * Kept as a separate handler from `onQuantityInput` because `change` also fires for
   * the spinner buttons and for Enter, and the value should settle the same way however
   * it was entered.
   */
  protected onQuantityCommitted(event: Event): void {
    this.quantity.set(readNumber(event));
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
    return (
      detail !== undefined && detail.rate < detail.base_price && detail.discount_percentage > 0
    );
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
