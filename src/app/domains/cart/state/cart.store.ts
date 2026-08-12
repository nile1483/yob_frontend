import { Service, computed, inject, signal } from '@angular/core';
import { EMPTY, catchError, finalize, switchMap, tap, type Observable } from 'rxjs';

import { normalizeYobFailure, type YobApiError } from '../../../foundation/network/yob-api-error';
import type { CartPayloadDto } from '../contracts/cart.types';
import { CartApi } from '../data/cart.api';

/** Which selection a pending `set_cart_*` call is changing. */
export type CartSelectionKind = 'contact' | 'billing' | 'shipping';

/**
 * The cart, as the server last reported it.
 *
 * ## Why Cart has a store when Catalog does not
 *
 * Catalog data is read by exactly one page and derived entirely from the route, so a
 * page-local `rxResource` is the whole answer - a store there would owe a
 * cache-invalidation policy for a problem that does not exist.
 *
 * The cart has **two real consumers that must agree**: item detail writes to it, the
 * cart page reads it, and after an add the cart page must not show a stale total. That
 * is the trigger for shared state - two consumers of one truth, not "the domain feels
 * important". Nothing here is a store because Cart is a domain; it is a store because
 * removing it would mean duplicating cart truth in two pages.
 *
 * ## One truth, and it is the server's
 *
 * The store never computes a total, never increments a quantity, and never predicts
 * what a mutation did. It holds the latest server payload and replaces it wholesale.
 */
@Service()
export class CartStore {
  private readonly api = inject(CartApi);

  private readonly payloadSignal = signal<CartPayloadDto | null>(null);
  private readonly loadingSignal = signal(false);
  private readonly addingSignal = signal(false);
  private readonly errorSignal = signal<YobApiError | null>(null);
  private readonly addErrorSignal = signal<YobApiError | null>(null);
  private readonly removingSignal = signal<string | null>(null);
  private readonly removeErrorSignal = signal<YobApiError | null>(null);
  private readonly removedSignal = signal(false);
  private readonly loadedSignal = signal(false);
  private readonly selectingSignal = signal<CartSelectionKind | null>(null);
  private readonly selectionErrorSignal = signal<YobApiError | null>(null);

  /** The latest server cart payload, or `null` before the first successful load. */
  readonly payload = this.payloadSignal.asReadonly();
  readonly isLoading = this.loadingSignal.asReadonly();
  readonly isAdding = this.addingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly addError = this.addErrorSignal.asReadonly();

  /** The `item_code` currently being removed, so only that row shows a busy state. */
  readonly removingItemCode = this.removingSignal.asReadonly();
  readonly removeError = this.removeErrorSignal.asReadonly();
  /** True after a removal the user explicitly asked for succeeded. */
  readonly justRemoved = this.removedSignal.asReadonly();
  /** Whether a load has ever completed - distinguishes "empty" from "not yet asked". */
  readonly isLoaded = this.loadedSignal.asReadonly();

  readonly cart = computed(() => this.payloadSignal()?.cart ?? null);
  readonly lines = computed(() => this.cart()?.items ?? []);
  readonly isEmpty = computed(() => this.loadedSignal() && this.lines().length === 0);

  /** Authoritative currency for this cart, when the server has told us one. */
  readonly currency = computed(() => this.cart()?.currency ?? null);

  /** Which selection is currently being changed, if any. */
  readonly selecting = this.selectingSignal.asReadonly();
  readonly selectionError = this.selectionErrorSignal.asReadonly();

  /**
   * The cart's current selections, as record identifiers.
   *
   * Read straight off the cart document. Checkout renders from these rather than
   * keeping its own "chosen" value, so there is exactly one answer to what is selected
   * and it is the server's.
   */
  readonly contactName = computed(() => this.cart()?.contact_person ?? null);
  readonly billingAddressName = computed(() => this.cart()?.billing_address ?? null);
  readonly shippingAddressName = computed(() => this.cart()?.shipping_address ?? null);

  /**
   * Whether this cart needs shipping, entirely as the server decided.
   *
   * The backend recomputes it from `is_stock_item` on every reprice, so it can change
   * with any cart response - which is why this is a `computed` over the current
   * payload and never a stored flag.
   *
   * A Frappe check field, so `0`/`1` rather than a boolean.
   */
  readonly isShippable = computed(() => (this.cart()?.is_shippable ?? 0) !== 0);

  /**
   * Item codes the backend dropped or repriced on the last read.
   *
   * Retained exactly as the contract delivers them - codes, not names. They are kept
   * because they are verified contract data a later phase may need per-line, but the
   * UI reports them as counts: an item code is an internal identifier, not something
   * to explain a surprise to a buyer with.
   */
  readonly removedItemCodes = computed(() => this.payloadSignal()?.removed_items ?? []);
  readonly priceUpdatedItemCodes = computed(() => this.payloadSignal()?.price_updated_items ?? []);
  readonly wasReconciled = computed(() => this.payloadSignal()?.cart_updated ?? false);

  /** Load, or reload, the cart. */
  load(): Observable<CartPayloadDto | never> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.getCart().pipe(
      tap((payload) => this.ingest(payload)),
      catchError((failure: unknown) => {
        this.errorSignal.set(normalizeYobFailure(failure));
        return EMPTY;
      }),
      finalize(() => this.loadingSignal.set(false)),
    );
  }

  /**
   * Add an item, or set its quantity if it is already in the cart.
   *
   * Two calls on purpose. `add_to_cart` answers with the bare cart document: a
   * different shape from `get_cart`, missing `currency`'s companions - the
   * reconciliation fields - and missing the resolved contact and addresses. Ingesting
   * it would leave the store holding a partial, differently-shaped truth, so the
   * mutation is followed by the canonical read and **that** is what the store adopts.
   *
   * A second click while one add is in flight is dropped rather than queued.
   */
  add(itemCode: string, quantity: number): Observable<CartPayloadDto | never> {
    if (this.addingSignal()) {
      return EMPTY;
    }

    this.addingSignal.set(true);
    this.addErrorSignal.set(null);
    this.removedSignal.set(false);

    return this.api.addToCart(itemCode, quantity).pipe(
      // The mutation reply is deliberately discarded - see above.
      switchMap(() => this.api.getCart()),
      tap((payload) => this.ingest(payload)),
      catchError((failure: unknown) => {
        this.addErrorSignal.set(normalizeYobFailure(failure));
        return EMPTY;
      }),
      finalize(() => this.addingSignal.set(false)),
    );
  }

  /**
   * Remove an item from the cart.
   *
   * Keyed on `item_code` because that is what the current backend accepts, and under
   * the current Add behaviour a code identifies exactly one row. Nothing is removed
   * locally first: the line disappears only because the server said so on the
   * following `getCart`, which is also what keeps reconciliation and totals correct.
   *
   * A second removal of the same row while one is in flight is dropped.
   */
  removeItem(itemCode: string): Observable<CartPayloadDto | never> {
    if (this.removingSignal() !== null) {
      return EMPTY;
    }

    this.removingSignal.set(itemCode);
    this.removeErrorSignal.set(null);
    this.removedSignal.set(false);

    return this.api.removeFromCart(itemCode).pipe(
      // The mutation reply is the bare cart document; the canonical read follows.
      switchMap(() => this.api.getCart()),
      tap((payload) => {
        this.ingest(payload);
        this.removedSignal.set(true);
      }),
      catchError((failure: unknown) => {
        this.removeErrorSignal.set(normalizeYobFailure(failure));
        return EMPTY;
      }),
      finalize(() => this.removingSignal.set(null)),
    );
  }

  /**
   * Choose the cart's contact person.
   *
   * @param contactName the Frappe Contact record `name`, never a display label.
   */
  setContact(contactName: string): Observable<CartPayloadDto | never> {
    return this.select('contact', () => this.api.setContact(contactName));
  }

  /**
   * Choose the cart's billing address.
   *
   * The backend may assign this address to shipping as well when shipping is empty.
   * Nothing here anticipates that - the following read simply reports whatever the
   * cart now holds.
   */
  setBillingAddress(addressName: string): Observable<CartPayloadDto | never> {
    return this.select('billing', () => this.api.setBillingAddress(addressName));
  }

  /** Choose the cart's shipping address. */
  setShippingAddress(addressName: string): Observable<CartPayloadDto | never> {
    return this.select('shipping', () => this.api.setShippingAddress(addressName));
  }

  /**
   * The shared shape of the three selection mutations.
   *
   * ## Why a second request
   *
   * The `set_cart_*` endpoints answer with an acknowledgement of the one field they
   * changed - `{"contact_person": "…"}` - not a cart. Totals, `is_shippable`, the
   * resolved blocks and reconciliation exist only on `get_cart`, and a selection can
   * genuinely reprice the cart, so adopting the acknowledgement would leave the store
   * holding stale totals next to a new selection. The mutation's reply is discarded
   * and the canonical read is what the store ingests.
   *
   * ## Why one guard for all three
   *
   * Any selection in flight blocks the others, not just its own kind. Two concurrent
   * selections would each finish with their own `get_cart`, and the store would adopt
   * whichever landed last - so the visible cart could disagree with the visible
   * selections. Serialising is cheap here; a buyer changes an address once.
   *
   * Nothing is applied optimistically: the radio reflects the cart, so a failed
   * selection leaves the previous choice visibly intact with no rollback to write.
   */
  private select(
    kind: CartSelectionKind,
    mutate: () => Observable<unknown>,
  ): Observable<CartPayloadDto | never> {
    if (this.selectingSignal() !== null) {
      return EMPTY;
    }

    this.selectingSignal.set(kind);
    this.selectionErrorSignal.set(null);
    this.removedSignal.set(false);

    return mutate().pipe(
      switchMap(() => this.api.getCart()),
      tap((payload) => this.ingest(payload)),
      catchError((failure: unknown) => {
        this.selectionErrorSignal.set(normalizeYobFailure(failure));
        return EMPTY;
      }),
      finalize(() => this.selectingSignal.set(null)),
    );
  }

  /** Discard a selection failure once the user has been given a way forward. */
  clearSelectionError(): void {
    this.selectionErrorSignal.set(null);
  }

  /** Replace everything with what the server just said. */
  private ingest(payload: CartPayloadDto): void {
    this.payloadSignal.set(payload);
    this.loadedSignal.set(true);
    this.errorSignal.set(null);
  }
}
