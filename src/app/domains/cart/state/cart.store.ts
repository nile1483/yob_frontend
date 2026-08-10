import { Service, computed, inject, signal } from '@angular/core';
import { EMPTY, catchError, finalize, switchMap, tap, type Observable } from 'rxjs';

import { normalizeYobFailure, type YobApiError } from '../../../foundation/network/yob-api-error';
import type { CartPayloadDto } from '../contracts/cart.types';
import { CartApi } from '../data/cart.api';

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

  /** Replace everything with what the server just said. */
  private ingest(payload: CartPayloadDto): void {
    this.payloadSignal.set(payload);
    this.loadedSignal.set(true);
    this.errorSignal.set(null);
  }
}
