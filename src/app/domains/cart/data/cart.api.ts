import { Service, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';

import { YobApiClient } from '../../../foundation/network/yob-api-client';
import type { CartDocDto, CartPayloadDto } from '../contracts/cart.types';

const GET_CART = 'yob_storefront.api.cart.get_cart';
const ADD_TO_CART = 'yob_storefront.api.cart.add_to_cart';
const REMOVE_FROM_CART = 'yob_storefront.api.cart.remove_from_cart';

/**
 * Cart network access.
 *
 * Depends on `YobApiClient` and nothing else - no `HttpClient`, no envelope handling,
 * no mock awareness, and no arithmetic. Every amount comes back computed.
 */
@Service()
export class CartApi {
  private readonly api = inject(YobApiClient);

  /**
   * The canonical cart read.
   *
   * The only endpoint that returns reconciliation (`cart_updated`, `removed_items`,
   * `price_updated_items`) and the resolved contact/addresses, so it is what the store
   * ingests - including after a mutation.
   */
  getCart(): Observable<CartPayloadDto> {
    return this.api.get<CartPayloadDto>(GET_CART).pipe(map((response) => response.data));
  }

  /**
   * Add an item, or set the quantity of one already in the cart.
   *
   * **Set semantics, not increment.** The backend does `existing.quantity = qty` for a
   * line that is already present, so sending 3 for a line holding 2 results in 3, not
   * 5. Source-verified in `cart.py`; pinned by tests here and in the mock.
   *
   * `itemCode` is the Frappe Item code - catalog `name`, never a slug.
   *
   * `qty` is sent as the backend takes it: a float greater than zero. There is no
   * integer, step, maximum or stock rule in the contract, so none is invented here.
   *
   * The reply is the bare cart document - a different shape from `getCart` and
   * without reconciliation - so callers must re-read rather than ingest it.
   * Wire-verified failures: 422 `validation_failed` (no code), 422 `quantity_invalid`
   * (qty <= 0), 404 `item_not_found`.
   */
  addToCart(itemCode: string, qty: number): Observable<CartDocDto> {
    return this.api
      .post<CartDocDto>(ADD_TO_CART, { item_code: itemCode, qty })
      .pipe(map((response) => response.data));
  }

  /**
   * Remove an item from the cart.
   *
   * Takes `item_code`, matching the backend as it exists today: it filters out every
   * row whose code matches. That is safe *because* `add_to_cart` currently keeps one
   * effective row per code, so a code identifies exactly one line.
   *
   * A future contract change will make Add create independent rows, at which point
   * removal must target a per-line identifier instead - see the deferred entry in
   * `docs/PROJECT-STATE.md`. No line identifier is invented here in the meantime.
   *
   * Like `addToCart`, the reply is the bare cart document without reconciliation, so
   * callers re-read with `getCart`. Wire-verified failure: 422 `validation_failed`
   * when `item_code` is blank.
   */
  removeFromCart(itemCode: string): Observable<CartDocDto> {
    return this.api
      .post<CartDocDto>(REMOVE_FROM_CART, { item_code: itemCode })
      .pipe(map((response) => response.data));
  }
}
