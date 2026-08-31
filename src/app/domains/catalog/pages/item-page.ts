import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { Alert } from '../../../design/alert/alert';
import { Badge } from '../../../design/badge/badge';
import { Button } from '../../../design/button/button';
import { Field } from '../../../design/field/field';
import { EmptyState } from '../../../design/empty-state/empty-state';
import { Spinner } from '../../../design/spinner/spinner';
import { YobApiError, normalizeYobFailure } from '../../../foundation/network/yob-api-error';
import { CART_ITEM_UOM_CHANGED } from '../../cart/contracts/cart.types';
import { CartStore } from '../../cart/state/cart.store';
import { CATALOG_CURRENCY } from '../catalog.currency';
import {
  VARIANT_ERROR_CODES,
  isItemFamily,
  type ItemDetailDto,
  type ItemVariantDto,
} from '../contracts/catalog.types';
import { CatalogApi } from '../data/catalog.api';
import { ProductContent } from '../parts/product-content/product-content';
import { ProductGallery } from '../parts/product-gallery';
import { ContentSlot } from '../../content/parts/content-slot';

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
  imports: [Alert, Badge, Button, CurrencyPipe, EmptyState, Field, ProductContent, ProductGallery, RouterLink, Spinner, ContentSlot],
  template: `
    <!-- Application band: full width outside, the storefront's one column inside.
         The hook is source-owned - a Content Placement can style its own band,
         but nothing a merchant configures reaches this page's own functionality. -->
    <section class="yob-page-section product-section">
      <div class="yob-content-container">
        <nav aria-label="Breadcrumb" i18n-aria-label="@@item.breadcrumb.label">
          <a routerLink="/catalog" class="text-sm text-slate-600 underline underline-offset-4"
            ><ng-container i18n="@@item.breadcrumb.back">Back to catalog</ng-container></a
          >
        </nav>

      </div>
    </section>

    <!-- Merchant content for this route. The position is ours; what appears
         in it is the merchant's, and an empty slot renders nothing. -->
    <yob-content-slot routeKey="product" slotKey="above_product" />

    <!-- Application band: full width outside, the storefront's one column inside.
         The hook is source-owned - a Content Placement can style its own band,
         but nothing a merchant configures reaches this page's own functionality. -->
    <section class="yob-page-section product-section">
      <div class="yob-content-container">

        @if (item.isLoading() && payload() === undefined) {
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
        } @else if (familyUnsupported()) {
          <!-- A Manufacturer-based family. API 3.3.0 refuses it at get_item with
               variant_family_unsupported, so there is no matrix to render - and "please try
               again" would be false advice, because trying again cannot help. -->
          <div class="mt-6" data-testid="item-family-unavailable">
            <app-alert tone="info">
              <span i18n="@@item.family.unavailable"
                >This product cannot be configured online. Please contact us to order it.</span
              >
            </app-alert>
          </div>
        } @else if (item.error()) {
          <div class="mt-6" data-testid="item-error">
            <app-alert tone="error">
              <span i18n="@@item.error">We could not load this item. Please try again.</span>
            </app-alert>
          </div>
        } @else if (payload(); as payload) {
          <article class="mt-4 grid grid-cols-1 gap-8 md:grid-cols-2 md:items-start lg:gap-12">
            <!-- Sticky on desktop so the product stays in view while the buy box and the
                 specifications below it are read. Unchanged by Phase 27C: the gallery owns
                 its own combined height budget so this column is no taller than the single
                 hero image it replaced. -->
            <div class="md:sticky md:top-24">
              <!-- The merchandising image area, and it belongs to the PAGE PRODUCT: a
                   simple Item's own gallery, or a family's template gallery.
                   resolvedVariant() is deliberately not passed and deliberately not
                   consulted - see galleryFallbackImage below. -->
              <app-product-gallery
                [gallery]="gallery()"
                [fallbackImage]="galleryFallbackImage()"
                [productName]="galleryProductName()"
                [ownerKey]="itemSlug()"
              />
            </div>

            <div class="flex flex-col gap-5">
              <header>
                <h1
                  class="text-2xl font-semibold tracking-tight break-words sm:text-3xl"
                  data-testid="item-title"
                >
                  {{ displayName() }}
                </h1>
                <!-- The identity of what is actually being bought: the resolved variant's own
                     SKU once one exists, the template's code while the buyer is still
                     choosing. The template code is a label here and nowhere else - it is
                     never sent as a purchase. -->
                <p class="mt-1 text-sm break-words text-slate-500">
                  <span class="sr-only" i18n="@@item.code">Item code</span>
                  {{ displayCode() }}
                </p>
              </header>

              @if (family(); as family) {
                @if (isConfigurable()) {
                  <!-- One control group per attribute, in the backend's order. A group of
                       radio-style choices, not a select: the options are few, comparing them
                       matters, and a disabled option must stay visible so the buyer can see
                       that Large exists but not in Orange. -->
                  <div class="flex flex-col gap-4" data-testid="item-attributes">
                    @for (group of attributeGroups(); track group.attribute) {
                      <fieldset data-testid="item-attribute">
                        <legend class="text-sm font-medium text-slate-900" data-testid="item-attribute-name">
                          {{ group.attribute }}
                        </legend>

                        <div class="mt-2 flex flex-wrap gap-2">
                          @for (option of group.options; track option.value) {
                            <!-- Disabled, never hidden: a combination that does not exist is
                                 information the buyer needs. Availability comes only from the
                                 backend's variants[] - no combination is generated here. -->
                            <button
                              type="button"
                              role="radio"
                              [attr.aria-checked]="option.selected"
                              [disabled]="option.disabled"
                              [class]="attributeOptionClass(option)"
                              (click)="selectAttribute(group.attribute, option.value)"
                              data-testid="item-attribute-value"
                              [attr.data-attribute]="group.attribute"
                              [attr.data-value]="option.value"
                              [attr.data-state]="option.disabled ? 'disabled' : option.selected ? 'selected' : 'available'"
                            >
                              {{ option.value }}
                            </button>
                          }
                        </div>
                      </fieldset>
                    }
                  </div>

                  @if (isResolving()) {
                    <p class="text-sm text-slate-600" data-testid="item-variant-resolving">
                      <ng-container i18n="@@item.variant.resolving"
                        >Checking availability&hellip;</ng-container
                      >
                    </p>
                  }

                  @if (resolveErrorMessage(); as message) {
                    <div data-testid="item-variant-error">
                      <app-alert tone="error">{{ message }}</app-alert>
                    </div>
                  }

                  @if (!purchasable() && !isResolving() && resolveErrorMessage() === null) {
                    <!-- No price, no quantity box and no Add button until the backend has
                         named a variant: a price here would be invented, and a quantity would
                         be counted in a unit nobody has established yet. -->
                    <p class="text-sm text-slate-600" data-testid="item-variant-prompt">
                      {{ selectPrompt() }}
                    </p>
                  }
                } @else {
                  <!-- A family the storefront cannot offer - a Manufacturer-based one, or a
                       template with nothing salable under it. The safe existing pattern, and
                       deliberately no bespoke UI. -->
                  <div data-testid="item-family-unavailable">
                    <app-alert tone="info">
                      <span i18n="@@item.family.unavailable"
                        >This product cannot be configured online. Please contact us to
                        order it.</span
                      >
                    </app-alert>
                  </div>
                }
              }

              <!-- Everything from here down needs a real, priced item: the resolved variant,
                   or the simple item this page was loaded for. A family on its own has no
                   rate, no UOM and no stock, so none of it is rendered speculatively. -->
              @if (purchasable(); as detail) {
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

              @if (displayMrp(); as mrp) {
                <!-- Informational, and deliberately quiet: small, muted, and subordinate
                     to the rate above it. No badge, no strike-through and no computed
                     saving - the contract says the MRP is not validated against the
                     selling price and may be lower, so any derived percentage would
                     sometimes be a negative discount. Same currency context as the rate;
                     there is no separate MRP currency. -->
                <p class="-mt-4 text-sm text-slate-500" data-testid="item-mrp">
                  <ng-container i18n="@@item.mrp">MRP</ng-container>
                  {{ mrp | currency: currency }}
                </p>
              }

              <div class="-mt-3 flex flex-col gap-1">
                <!-- The **selling** UOM: the unit the price above is for, and the unit the
                     quantity below is counted in. ERPNext resolves it; the buyer never
                     picks it, and there is no selector here for them to pick it with. -->
                <p class="text-sm text-slate-600" data-testid="item-uom">
                  <ng-container i18n="@@item.pricedPer">Priced per</ng-container>
                  {{ detail.uom }}
                </p>

                <!-- Counted in the STOCK unit, which is a different unit from the one
                     above whenever ERPNext sells in one and stocks in another: "Priced per
                     Box" over "Available: 25 Nos" is a correct pair, not a mismatch.
                     Nothing here restates it in the selling unit - that would be a
                     conversion, and the backend owns those. -->
                @if (availability(); as available) {
                  <p class="text-sm text-slate-600" data-testid="item-availability">
                    <ng-container i18n="@@item.available">Available</ng-container>:
                    {{ available.qty }} <span data-testid="item-availability-uom">{{ available.uom }}</span>
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
                <!-- The label carries the selling UOM, so the accessible name is
                     "Quantity to add (Box)" and a screen-reader user is told what they are
                     counting before they type. The unit beside the box repeats it visually
                     and is aria-hidden for exactly that reason. -->
                <app-field
                  [label]="quantityLabel(detail.uom)"
                  hint="Added to whatever is already in your cart."
                  i18n-hint="@@item.quantity.hint"
                  [error]="quantityError()"
                >
                  <div class="flex items-baseline gap-2">
                    <!-- The same control as before, given min and step when the Item
                         Price configured guidance. With both set, the browser's own
                         spinner counts FROM min - 10, 16, 22 - which is the contract's
                         rule for free. step falls back to &quot;any&quot; and min to nothing,
                         so an item without guidance behaves exactly as it always has.
                         Typing is handled by the normalisation on commit. -->
                    <input
                      type="number"
                      [attr.step]="quantityStepAttr()"
                      [attr.min]="quantityMinAttr()"
                      inputmode="decimal"
                      [value]="quantity()"
                      (input)="onQuantityInput($event)"
                      (change)="onQuantityCommitted($event)"
                      data-testid="item-quantity"
                      [attr.data-moq]="quantityMinAttr()"
                      [attr.data-step]="quantityStepAttr()"
                      class="w-32 rounded-md border border-slate-300 px-3 py-2 text-base sm:text-sm"
                    />
                    <span
                      aria-hidden="true"
                      class="text-sm font-medium text-slate-700"
                      data-testid="item-quantity-uom"
                      >{{ detail.uom }}</span
                    >
                  </div>
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

                @if (uomChangedMessage(); as message) {
                  <!-- The backend refused because the cart still holds this item in the unit
                       it used to sell in. Nothing is retried, nothing is converted, and no
                       unit is submitted - the buyer removes the old line and adds the
                       product again, which is the only way to adopt the new selling UOM. -->
                  <div data-testid="add-to-cart-uom-changed">
                    <app-alert tone="error">
                      <span>{{ message }}</span>
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
              }
            </div>
          </article>
        }

      </div>
    </section>

    <!-- Merchant-authored product information, below both columns and at the page's
         full width - never inside the gallery/buying grid, which is a two-column
         arrangement for one product and one buy box. Owned by the PAGE PRODUCT exactly
         as the gallery is: a simple Item's own sections, or a family template's, and
         never a resolved variant's. Empty renders nothing at all. -->
    <app-product-content [sections]="sections()" />

    <yob-content-slot routeKey="product" slotKey="below_product" />
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

  /**
   * Live value, updated per keystroke. Drives validation and the add payload.
   *
   * Reset to {@link DEFAULT_QUANTITY} whenever the resolved variant changes, so a
   * quantity entered against one variant's selling unit can never be submitted against
   * another's - the two variants may not even be sold in the same unit.
   */
  /**
   * The quantity in the box.
   *
   * A `linkedSignal` keyed on **which item is being bought and where its guidance
   * starts**. Typing leaves the source untouched, so a buyer's value is theirs to keep;
   * but a new product, a newly resolved variant, or a variant whose Item Price starts
   * somewhere else all change the source and reset the box to that item's own start.
   *
   * Keyed on the code as well as the number so two variants that happen to share a start
   * still reset - the reset is about the SKU changing, not about the number changing.
   *
   * This is also what gives a simple product its MOQ: the payload arrives asynchronously,
   * the source changes when it does, and the box moves from 1 to 10 without the page
   * needing to know whether it loaded a product or resolved a variant.
   */
  protected readonly quantity = linkedSignal<
    { code: string | null; start: number },
    number
  >({
    source: () => ({
      code: this.purchasable()?.name ?? null,
      start: this.effectiveStart(),
    }),
    computation: (source) => source.start,
  });

  /**
   * The quantity guidance in force, or `null` when there is none to apply.
   *
   * `null` covers three cases the page treats identically: no purchasable item yet, an
   * item whose Item Price configured neither value, and - the one that matters - an item
   * whose pricing preview applied a Pricing Rule, which the backend reports as
   * `allowed: false`.
   *
   * The flag governs the **pair**. When it is false neither value is applied, because a
   * rule may change behaviour at a quantity threshold and stepping is no longer a promise
   * the storefront can keep. Applying the MOQ but not the multiplier - or vice versa -
   * would be inventing a third behaviour the contract does not describe.
   */
  private readonly guidance = computed(() => {
    const control = this.purchasable()?.quantity_control;
    if (control === undefined || !control.allowed) {
      return null;
    }

    const moq = positiveOrNull(control.moq);
    const step = positiveOrNull(control.quantity_multiplier);
    return moq === null && step === null ? null : { moq, step };
  });

  /**
   * The quantity the input starts at, and the floor it will not go below.
   *
   * The MOQ when one is configured; otherwise the ordinary default this page has always
   * used. Nothing else changes: with no MOQ, a multiplier steps from 1 rather than
   * forcing the start up to the multiplier.
   */
  protected readonly effectiveStart = computed(() => this.guidance()?.moq ?? DEFAULT_QUANTITY);

  /**
   * The step, or `null` to leave the input exactly as unconstrained as it was.
   *
   * `null` becomes `step="any"` in the template - the existing behaviour - rather than a
   * step of 1, because the backend's rule is any float greater than zero and this page
   * has never restricted that.
   */
  protected readonly effectiveStep = computed(() => this.guidance()?.step ?? null);

  /** `step` for the native control: the multiplier, or the unconstrained default. */
  protected readonly quantityStepAttr = computed(() => {
    const step = this.effectiveStep();
    return step === null ? 'any' : String(step);
  });

  /**
   * `min` for the native control whenever guidance applies, or `null`.
   *
   * ## Why this is set even without an MOQ
   *
   * HTML computes a step from a **step base**, and that base is `min` - or **zero** when
   * no `min` is given. So `step="5"` on its own makes 0, 5, 10 the valid values, and the
   * browser rejects a starting quantity of 1 with its own validation bubble, blocking
   * submission entirely. That is not the contract's rule: a multiplier with no MOQ steps
   * from the ordinary start, giving 1, 6, 11.
   *
   * Setting `min` to the effective start fixes the base, so the native spinner and the
   * native validator both agree with `normalizeQuantity`. It also makes the start a real
   * floor for the MOQ case, which is the other half of what the guidance means.
   *
   * `null` when there is no guidance at all, so an ordinary item keeps an input with no
   * `min` and no `step`, exactly as before.
   */
  protected readonly quantityMinAttr = computed(() =>
    this.guidance() === null ? null : String(this.effectiveStart()),
  );

  protected readonly isQuantityValid = computed(() => isPositiveFinite(this.quantity()));

  protected readonly quantityError = computed(() =>
    this.quantityTouched() && !this.isQuantityValid()
      ? $localize`:@@item.quantity.invalid:Enter a quantity greater than zero.`
      : '',
  );

  /**
   * The quantity field's label, naming the unit the buyer is counting in.
   *
   * A parameterised label rather than a bare "Quantity to add": the number in the box
   * means nothing without its unit, and putting the unit in the label is what makes the
   * control's accessible name carry it too.
   */
  protected quantityLabel(uom: string): string {
    return $localize`:@@item.quantity.label:Quantity to add (${uom}:uom:)`;
  }

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
  protected readonly payload = computed(() =>
    this.item.hasValue() ? this.item.value() : undefined,
  );

  /** The template being configured, when this page loaded one. */
  protected readonly family = computed(() => {
    const payload = this.payload();
    return payload !== undefined && isItemFamily(payload) ? payload : null;
  });

  /** The ordinary salable item this page loaded, when it was not a family. */
  private readonly simpleItem = computed(() => {
    const payload = this.payload();
    return payload !== undefined && !isItemFamily(payload) ? payload : null;
  });

  /**
   * The item that can actually be priced and bought right now.
   *
   * A simple product from the moment it loads; a family only once the **backend** has
   * resolved the chosen attributes into a real SKU. Everything downstream - price, UOM,
   * availability, tax, the quantity box and Add to cart - reads this and nothing else,
   * which is what makes the two flows one page rather than two implementations.
   */
  protected readonly purchasable = computed(() => this.resolvedVariant() ?? this.simpleItem());

  /**
   * Whether this family can be configured here at all.
   *
   * A Manufacturer-based family, or a template with no salable children, arrives with
   * nothing to choose. There is deliberately no bespoke UI for that case: the page says
   * so with the ordinary alert and offers no controls.
   */
  protected readonly isConfigurable = computed(() => {
    const family = this.family();
    return family !== null && family.attributes.length > 0 && family.variants.length > 0;
  });


  // ------------------------------------------------------------ variant family

  /**
   * The buyer's current attribute choices, by attribute name.
   *
   * **Presentation state only.** It records what has been clicked; it authorises
   * nothing. A selection becomes a purchasable SKU exclusively by way of
   * `resolve_variant`, and until the backend answers there is no item to buy.
   *
   * Keyed on the slug so navigating to another product starts empty rather than
   * carrying one product's Colour onto another's.
   */
  private readonly selection = linkedSignal<string, Readonly<Record<string, string>>>({
    source: () => this.itemSlug(),
    computation: () => ({}),
  });

  /** The SKU the backend resolved, or `null` while the buyer is still choosing. */
  private readonly resolvedSignal = signal<ItemDetailDto | null>(null);
  protected readonly resolvedVariant = this.resolvedSignal.asReadonly();

  private readonly resolvingSignal = signal(false);
  protected readonly isResolving = this.resolvingSignal.asReadonly();

  private readonly resolveErrorSignal = signal<YobApiError | null>(null);

  /**
   * The attribute controls, in the backend's order, with each value's availability.
   *
   * ## Availability comes only from `variants[]`
   *
   * A value is offered when **at least one real variant row** carries it alongside every
   * other attribute the buyer has already chosen. Nothing is generated: with only
   * `Orange/Medium` and `Yellow/Large` in the matrix, choosing Orange leaves Large
   * disabled, because no row has both - even though Orange and Large each exist.
   *
   * The attribute currently being considered is excluded from that comparison, so its own
   * chosen value never disqualifies its siblings: after choosing Orange, the other
   * colours stay clickable and simply switch the selection.
   */
  protected readonly attributeGroups = computed(() => {
    const family = this.family();
    if (family === null) {
      return [];
    }

    const selection = this.selection();

    return family.attributes.map((attribute) => {
      const name = attribute.attribute;
      const chosen = selection[name];

      // A value the buyer has already chosen can always be changed. Under the rule below
      // a complete selection disqualifies every alternative - Yellow is not available
      // "with Medium" once Medium is chosen - which would strand the buyer on the first
      // variant they landed on with no way back. So when an already-chosen attribute has
      // no alternative left, its values are offered on their own terms: choosing one
      // re-anchors the selection and drops whatever it contradicts.
      const strict = attribute.values.filter((value) =>
        this.hasVariantFor(family.variants, selection, name, value),
      );
      const stranded = chosen !== undefined && strict.every((value) => value === chosen);

      return {
        attribute: name,
        options: attribute.values.map((value) => ({
          value,
          selected: chosen === value,
          disabled: stranded
            ? !this.existsInAnyVariant(family.variants, name, value)
            : !strict.includes(value),
        })),
      };
    });
  });

  /**
   * Whether any real variant carries this value at all.
   *
   * The weaker question, asked only for an attribute the buyer is re-choosing. It is
   * still a lookup in `variants[]`: a value that exists in no variant is never offered,
   * however the buyer arrived at it.
   */
  private existsInAnyVariant(
    variants: readonly ItemVariantDto[],
    attribute: string,
    value: string,
  ): boolean {
    return variants.some((variant) => variant.attributes[attribute] === value);
  }

  /**
   * Whether any real variant matches this candidate value plus the rest of the selection.
   *
   * The whole availability rule, and it is a lookup rather than a calculation: no
   * combination is constructed, and a row that does not exist can never become
   * selectable.
   */
  private hasVariantFor(
    variants: readonly ItemVariantDto[],
    selection: Readonly<Record<string, string>>,
    attribute: string,
    value: string,
  ): boolean {
    return variants.some((variant) => {
      if (variant.attributes[attribute] !== value) {
        return false;
      }
      return Object.entries(selection).every(
        ([name, chosen]) => name === attribute || variant.attributes[name] === chosen,
      );
    });
  }

  /** Whether every attribute the family declares now has a chosen value. */
  private readonly isSelectionComplete = computed(() => {
    const family = this.family();
    if (family === null) {
      return false;
    }
    const selection = this.selection();
    return family.attributes.every((attribute) => selection[attribute.attribute] !== undefined);
  });

  /** What is still needed, named so the buyer knows what to do next. */
  protected readonly selectPrompt = computed(() => {
    const family = this.family();
    const selection = this.selection();
    const remaining = (family?.attributes ?? [])
      .filter((attribute) => selection[attribute.attribute] === undefined)
      .map((attribute) => attribute.attribute)
      .join(', ');

    return remaining === ''
      ? $localize`:@@item.variant.selectPrompt.generic:Choose the options above to see the price and availability.`
      : $localize`:@@item.variant.selectPrompt:Choose ${remaining}:attributes: to see the price and availability.`;
  });

  /**
   * Record a choice, and resolve it when the selection is complete.
   *
   * Everything the previous selection produced is dropped first - the resolved variant,
   * its error, the acknowledgement, and the quantity. **The quantity reset is not
   * cosmetic**: 3 Box of one variant must never silently become 3 of another whose
   * selling unit is Nos, and only the backend knows what a resolved variant sells in.
   */
  protected selectAttribute(attribute: string, value: string): void {
    const family = this.family();
    if (family === null) {
      return;
    }

    this.selection.set(this.pruneSelection(family, this.selection(), attribute, value));

    this.resolveSelection();
  }

  /**
   * Apply a choice, dropping any earlier choice it has made impossible.
   *
   * Switching Colour from Orange to Yellow leaves `Size: Medium` behind, and
   * `Yellow/Medium` is not a product. Keeping it would put the page in a state the matrix
   * says cannot exist and - worse - would look complete, so the page would ask the
   * resolver to price a combination it had just been told does not exist.
   *
   * So compatible earlier choices are kept and impossible ones are dropped, leaving the
   * buyer to pick that attribute again. Nothing is chosen on their behalf: dropping a
   * choice asks a question, whereas substituting one answers it for them.
   */
  private pruneSelection(
    family: { attributes: readonly { attribute: string }[]; variants: readonly ItemVariantDto[] },
    current: Readonly<Record<string, string>>,
    attribute: string,
    value: string,
  ): Readonly<Record<string, string>> {
    let next: Record<string, string> = { [attribute]: value };

    for (const other of family.attributes) {
      const chosen = current[other.attribute];
      if (other.attribute === attribute || chosen === undefined) {
        continue;
      }

      const candidate = { ...next, [other.attribute]: chosen };
      const exists = family.variants.some((variant) =>
        Object.entries(candidate).every(([name, wanted]) => variant.attributes[name] === wanted),
      );

      if (exists) {
        next = candidate;
      }
    }

    return next;
  }

  /**
   * Ask the backend which SKU this selection is.
   *
   * A partial selection asks nothing: an incomplete combination is not a product, and
   * sending one would invite the backend to guess. `qty` is the contract's pricing input,
   * sent once here at the reset default of 1 - choosing a quantity afterwards is local
   * and never re-resolves, so this cannot become a client-side pricing loop.
   */
  private resolveSelection(): void {
    const family = this.family();

    // Cleared first, so nothing of the previous variant survives while the resolver is
    // in flight - not its MRP, not its guidance and not its quantity. `effectiveStart`
    // reads `purchasable()`, which is null the moment `resolvedSignal` is cleared, so the
    // box returns to the ordinary default until the new SKU arrives with its own.
    this.resolvedSignal.set(null);
    this.resolveErrorSignal.set(null);
    this.addedSignal.set(false);
    this.quantityTouched.set(false);

    if (family === null || !this.isSelectionComplete()) {
      return;
    }

    this.resolvingSignal.set(true);

    this.api
      .resolveVariant({
        template: family.name,
        attributes: this.selection(),
        qty: DEFAULT_QUANTITY,
      })
      .pipe(finalize(() => this.resolvingSignal.set(false)))
      .subscribe({
        next: (variant) => {
          this.resolvedSignal.set(variant);
          // No quantity assignment here: `quantity` is linked to the purchasable item and
          // its start, so setting the resolved variant already moved the box to that
          // SKU's own starting quantity. Variant A at MOQ 10 followed by Variant B at
          // MOQ 2 lands on 2, and B never inherits A's sequence.
          this.quantityTouched.set(false);
        },
        error: (failure: unknown) => {
          this.resolveErrorSignal.set(normalizeYobFailure(failure));
        },
      });
  }

  /**
   * Wording for a refused resolution.
   *
   * Our text for the backend's codes, as everywhere else on this page - the server's own
   * `detail` is never rendered. A rejection is taken at face value and nothing is
   * retried or substituted: if the matrix offered a combination the resolver refuses,
   * the matrix was stale, and the answer is to say so rather than to look for another
   * SKU on the buyer's behalf.
   */
  protected readonly resolveErrorMessage = computed(() => {
    const error = this.resolveErrorSignal();
    if (error === null) {
      return null;
    }
    switch (error.code) {
      case VARIANT_ERROR_CODES.notAvailable:
        return $localize`:@@item.variant.notAvailable:That combination is not available. Please choose different options.`;
      case VARIANT_ERROR_CODES.attributesRequired:
        return $localize`:@@item.variant.attributesRequired:Please choose an option for every field.`;
      case VARIANT_ERROR_CODES.familyUnsupported:
        return $localize`:@@item.variant.unsupported:This product cannot be configured online. Please contact us to order it.`;
      default:
        return $localize`:@@item.variant.failed:We could not check that combination. Please try again.`;
    }
  });

  /** Tailwind for one attribute choice, by state. */
  protected attributeOptionClass(option: { selected: boolean; disabled: boolean }): string {
    const base =
      'rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2';

    if (option.disabled) {
      // Visible and legible, but plainly not offered - and still readable at AA.
      return `${base} cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 line-through`;
    }
    return option.selected
      ? `${base} border-slate-900 bg-slate-900 font-medium text-white`
      : `${base} border-slate-300 bg-white text-slate-900 hover:border-slate-500`;
  }

  // --------------------------------------------------------------- presentation

  /**
   * The page product's gallery: this Item's own, or this family's template gallery.
   *
   * ## Why there is no resolved-variant branch here
   *
   * Until Phase 27C the image on this page was `resolvedVariant()?.image ?? payload.image`
   * - the resolved child's photograph won. That was right when a product had exactly one
   * picture and nothing owned a gallery. It is wrong now, and wrong on ownership rather
   * than on mechanics: merchandising belongs to the **public storefront entity**, which is
   * the simple Item or the template. A generated variant owns neither a gallery nor
   * content, `resolve_variant` carries neither, and 3.9.1 split the schemas so that a
   * resolved SKU has no type on which one could arrive.
   *
   * So choosing Orange/Medium changes the item code, the price, the UOM, the stock and the
   * availability - and leaves this column exactly as the buyer left it, including which
   * thumbnail they had selected. `ProductGallery` is never handed a resolved variant, so
   * that is structural rather than a rule someone has to remember.
   *
   * Empty is ordinary: the gallery then falls back to the product's own `image`.
   */
  protected readonly gallery = computed(() => this.payload()?.gallery ?? []);

  /**
   * The single image shown when no gallery is configured.
   *
   * The **page product's** `image` - the simple Item's, or the template's for a family.
   * Never `resolvedVariant()?.image`: a family whose template has no gallery still shows
   * the template's photograph after a variant resolves, because the merchandising area
   * belongs to the family throughout.
   */
  protected readonly galleryFallbackImage = computed(() => this.payload()?.image ?? null);

  /**
   * The name describing the merchandising images.
   *
   * The page product's, not {@link displayName} - the pictures are the owner's, so a
   * template gallery is described by the family's name even after a variant resolves.
   * Used only where a gallery row supplies no `alt_text` of its own.
   */
  protected readonly galleryProductName = computed(() => this.payload()?.item_name ?? '');

  /**
   * The page product's content sections: this Item's own, or this family's template's.
   *
   * The same ownership rule the gallery follows, and for the same reason. Merchandising
   * belongs to the public storefront entity; `resolve_variant` carries no sections, and
   * 3.9.1 gives a resolved SKU no shape one could arrive on. So choosing an attribute
   * changes the price and the stock and leaves every word of this content alone - it is
   * not refetched, not reset and not reordered.
   *
   * Read from the same payload the page already has. Rendering content issues no request
   * of any kind: it arrived with `get_item`.
   */
  protected readonly sections = computed(() => this.payload()?.sections ?? []);

  /** The resolved variant's name once there is one, the family's or item's until then. */
  protected readonly displayName = computed(
    () => this.resolvedVariant()?.item_name ?? this.payload()?.item_name ?? '',
  );

  /**
   * The code on screen: the resolved SKU, or the template's while choosing.
   *
   * A label only. The template code is never used as a purchase - Add to cart sends
   * `purchasable().name`, which exists only after the resolver has named a variant.
   */
  protected readonly displayCode = computed(
    () => this.resolvedVariant()?.name ?? this.payload()?.name ?? '',
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
  /**
   * The MRP to show, or `null` to show nothing at all.
   *
   * Displayed only when the backend published a positive figure. Zero, negative and
   * unconfigured all arrive as `null` already; the `> 0` check is belt and braces for a
   * payload that predates the field.
   *
   * **Nothing is derived from it.** No saving, no percentage, no comparison with the
   * rate - the contract says it is not validated against the selling price and may be
   * lower, so a computed "discount" would sometimes be negative. It is a number with a
   * label, and that is the whole feature.
   *
   * Independent of the quantity guidance: an item whose Pricing Rule disallows stepping
   * still shows its MRP, because an MRP has no quantity behaviour to conflict with.
   */
  protected readonly displayMrp = computed(() => {
    const mrp = this.purchasable()?.mrp ?? null;
    return mrp !== null && mrp > 0 ? mrp : null;
  });

  protected readonly availability = computed(() => {
    const item = this.purchasable();
    if (item === null || item.is_stock_item !== 1 || item.actual_qty === null) {
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
    if (error === null || error.code === CART_ITEM_UOM_CHANGED) {
      return null;
    }
    switch (error.code) {
      case 'quantity_invalid':
        return $localize`:@@item.add.quantityInvalid:Enter a quantity greater than zero.`;
      case 'item_not_found':
        return $localize`:@@item.add.itemNotFound:This item is no longer available.`;
      // The server revalidates the SKU on every add. These two say the code was real but
      // not sellable - a template, or a variant that is disabled, discontinued or
      // orphaned. Neither is retryable, so neither says "try again", and neither is
      // followed by an attempt at some other SKU.
      case 'item_is_template':
        return $localize`:@@item.add.isTemplate:Choose the options for this product before adding it to your cart.`;
      case 'item_not_purchasable':
        return $localize`:@@item.add.notPurchasable:This item cannot be ordered at the moment.`;
      default:
        return $localize`:@@item.add.failed:We could not add this item to your cart. Please try again.`;
    }
  });

  /**
   * The cart holds this item in a unit ERPNext no longer sells it in.
   *
   * Its own message rather than a line in {@link addErrorMessage}, because it is the one
   * add failure with a specific thing for the buyer to *do*, and the alert carries a link
   * to the cart to do it with.
   *
   * The wording is ours, not the server's `detail` - the same rule as every other error
   * on this page. The backend's `details.existing_uom` / `current_uom` are deliberately
   * not shown: `YobApiError.context` is a three-key allow-list at the network boundary,
   * and naming the two units is a nicety that does not change what the buyer must do.
   * Nothing is retried and no quantity is converted; the old line has to go.
   */
  protected readonly uomChangedMessage = computed(() =>
    this.cart.addError()?.code === CART_ITEM_UOM_CHANGED
      ? $localize`:@@item.add.uomChanged:This item is now sold in a different unit. Remove it from your cart and add it again.`
      : null,
  );

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
    this.quantity.set(this.normalizeQuantity(readNumber(event)));
  }

  /**
   * Bring a committed quantity onto the guided sequence.
   *
   * ## The rule, chosen and stated
   *
   * With guidance active the valid values are `start + n*step`. A committed value is
   * **clamped up to the start** and then **rounded DOWN** to the nearest valid value.
   * With start 10 and step 6, a typed 19 settles at 16, and a typed 5 settles at 10.
   *
   * Rounding down rather than to the nearest: the alternative silently increases what a
   * buyer is about to commit to buying, and for a guidance-only feature that is the more
   * expensive way to be wrong. The start is the one exception - it is a floor, so a value
   * below it moves up, because there is nothing valid beneath it to round down to.
   *
   * There is no error message and no request. The contract is explicit that these values
   * are never enforced by the backend, so a rejection here would be the storefront
   * inventing a refusal that the cart itself would not make.
   *
   * A blank or unparseable field is left exactly as it was - `NaN` flows through to the
   * existing validation, which is what already tells the buyer to enter a quantity.
   */
  private normalizeQuantity(value: number): number {
    if (!Number.isFinite(value)) {
      return value;
    }

    const start = this.effectiveStart();
    const step = this.effectiveStep();

    if (this.guidance() === null) {
      return value;
    }

    if (value <= start) {
      return start;
    }

    if (step === null) {
      return value;
    }

    // Floating-point tolerance: a value the buyer stepped to with the spinner can land a
    // hair under an exact multiple, and flooring that would drop a whole step.
    const steps = Math.floor((value - start) / step + EPSILON);
    return start + steps * step;
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

  /**
   * Whether the load was refused because this family cannot be configured online.
   *
   * Its own state rather than the generic load error: the published contract raises
   * `variant_family_unsupported` from `get_item` for a Manufacturer-based family, and
   * that is a permanent property of the product, not a transient failure to retry.
   */
  protected readonly familyUnsupported = computed(() => {
    const error = this.item.error();
    return (
      error instanceof YobApiError && error.code === VARIANT_ERROR_CODES.familyUnsupported
    );
  });

  protected readonly hasDiscount = computed(() => {
    const detail = this.purchasable();
    return detail !== null && detail.rate < detail.base_price && detail.discount_percentage > 0;
  });

  protected readonly showsTaxBreakdown = computed(() => {
    const detail = this.purchasable();
    return detail !== null && (detail.tax_amount !== 0 || detail.tax_label !== null);
  });
}

/**
 * What the quantity box starts at, and returns to whenever the variant changes.
 *
 * Also the `qty` sent to `resolve_variant`: the resolver needs one for pricing, and
 * sending the reset default keeps resolution independent of whatever the buyer types
 * afterwards - which is what stops this becoming a quantity-driven pricing loop.
 */
const DEFAULT_QUANTITY = 1;

/**
 * Slack for the guided-sequence arithmetic.
 *
 * `10 + 3*0.1` is not exactly `10.3` in binary floating point, and flooring the raw
 * division would drop a whole step for a value the buyer had legitimately stepped to.
 * Small enough that it can never absorb a real step, since the backend's own rule is
 * simply "greater than zero".
 */
const EPSILON = 1e-9;

/** A configured positive number, or `null`. Blank, zero and negative are all "unset". */
function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** The verified backend rule, and nothing more: a finite number greater than zero. */
function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** `NaN` for a blank or unparseable field, which `isPositiveFinite` then rejects. */
function readNumber(event: Event): number {
  return Number((event.target as HTMLInputElement).value);
}
