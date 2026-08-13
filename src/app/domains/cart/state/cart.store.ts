import { Service, computed, inject, signal } from '@angular/core';
import { EMPTY, catchError, finalize, switchMap, tap, type Observable } from 'rxjs';

import { normalizeYobFailure, type YobApiError } from '../../../foundation/network/yob-api-error';
import type { CartPayloadDto } from '../contracts/cart.types';
import { CartApi } from '../data/cart.api';

/**
 * What we know after an add whose outcome could not be determined.
 *
 * `refreshed` - the cart was re-read successfully, so what is on screen is current;
 * we still cannot say whether the delta applied.
 * `unknown` - even the re-read failed, so nothing on screen can be trusted.
 */
export type AddUnconfirmed = 'refreshed' | 'unknown';

/**
 * Whether a failure leaves the result of a non-idempotent add genuinely unknown.
 *
 * A YOB error envelope means the request reached the endpoint and was refused by it -
 * a definite rejection with nothing applied. A transport failure, a request that never
 * completed, or a server fault after acceptance all leave the delta's fate open.
 *
 * `httpStatus === 0` covers the case that matters most: the request may have been
 * received and applied while the answer was lost.
 */
function isUncertainOutcome(error: YobApiError): boolean {
  return error.httpStatus === 0 || error.httpStatus >= 500;
}

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
  private readonly addUnconfirmedSignal = signal<AddUnconfirmed | null>(null);
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
  /**
   * Set when an add failed in a way that leaves the outcome unknown.
   *
   * Deliberately separate from {@link addError}: that one means "the server refused
   * this", and saying so when we do not know would be a lie in the buyer's favour and
   * against their interest - they might add again and be charged for twice as much.
   */
  readonly addUnconfirmed = this.addUnconfirmedSignal.asReadonly();

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
   * Add a quantity of an item to the cart.
   *
   * ## `quantity` is a DELTA
   *
   * The backend does `existing.quantity = (existing.quantity or 0) + qty`, so a line
   * holding 2 that receives 5 ends at **7** - one row, not two, and never 5. Nothing
   * here computes that: the caller passes what the buyer asked to add, and the
   * canonical quantity comes back from the server.
   *
   * ## The call is not idempotent, which shapes everything below
   *
   * A repeat adds again (2 → 7 → 12). So:
   *
   * - a second call while one is in flight is **dropped**, not queued;
   * - the call is **never retried automatically** - not here, not in the API layer,
   *   not in an interceptor. There is no retry operator anywhere in this path, and a
   *   test pins that.
   *
   * ## Two calls on purpose
   *
   * `add_to_cart` answers with the bare cart document: a different shape from
   * `get_cart`, without the reconciliation fields or the resolved contact and
   * addresses. Ingesting it would leave the store holding a partial, differently
   * shaped truth, so the mutation is followed by the canonical read.
   *
   * ## Definite refusal vs uncertain outcome
   *
   * These are handled differently because they are different facts:
   *
   * - The server answered with an error envelope - `quantity_invalid`,
   *   `item_not_found`, a permission refusal. The request was **received and
   *   rejected**; nothing changed. Keep the cart, show the error.
   * - The request timed out, the connection dropped, or the server failed after
   *   accepting it. Completion is **genuinely unknown** - the delta may already have
   *   applied. Re-read the cart so the buyer sees the truth, and say plainly that we
   *   could not confirm it. Claiming "not added" here would be a guess, and retrying
   *   would risk adding twice.
   */
  add(itemCode: string, quantity: number): Observable<CartPayloadDto | never> {
    if (this.addingSignal()) {
      return EMPTY;
    }

    this.addingSignal.set(true);
    this.addErrorSignal.set(null);
    this.addUnconfirmedSignal.set(null);
    this.removedSignal.set(false);

    return this.api.addToCart(itemCode, quantity).pipe(
      // The mutation reply is deliberately discarded - see above.
      switchMap(() => this.api.getCart()),
      tap((payload) => this.ingest(payload)),
      catchError((failure: unknown) => {
        const error = normalizeYobFailure(failure);

        if (!isUncertainOutcome(error)) {
          this.addErrorSignal.set(error);
          return EMPTY;
        }

        return this.recoverAfterUncertainAdd();
      }),
      finalize(() => this.addingSignal.set(false)),
    );
  }

  /**
   * Re-read the cart after an add whose outcome we cannot determine.
   *
   * This is a read, so repeating it is safe - unlike the add itself, which is why the
   * recovery is a `get_cart` and never another `add_to_cart`.
   */
  private recoverAfterUncertainAdd(): Observable<CartPayloadDto | never> {
    return this.api.getCart().pipe(
      tap((payload) => {
        this.ingest(payload);
        this.addUnconfirmedSignal.set('refreshed');
      }),
      catchError(() => {
        // Recovery failed too, so we know neither what happened nor what the cart
        // holds. The buyer is told to look before trying again; we do not try for them.
        this.addUnconfirmedSignal.set('unknown');
        return EMPTY;
      }),
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
