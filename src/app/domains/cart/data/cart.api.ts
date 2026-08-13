import { Service, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';

import { YobApiClient } from '../../../foundation/network/yob-api-client';
import type { CartDocDto, CartPayloadDto } from '../contracts/cart.types';

const GET_CART = 'yob_storefront.api.cart.get_cart';
const ADD_TO_CART = 'yob_storefront.api.cart.add_to_cart';
const REMOVE_FROM_CART = 'yob_storefront.api.cart.remove_from_cart';
const SET_CART_CONTACT = 'yob_storefront.api.cart.set_cart_contact';
const SET_CART_BILLING_ADDRESS = 'yob_storefront.api.cart.set_cart_billing_address';
const SET_CART_SHIPPING_ADDRESS = 'yob_storefront.api.cart.set_cart_shipping_address';

/**
 * What a `set_cart_*` endpoint actually replies with.
 *
 * An acknowledgement of the field it changed - **not** a cart. Wire-verified
 * 2026-08-12; see the note on the setter methods below.
 */
export interface CartSelectionAckDto {
  readonly contact_person?: string;
  readonly billing_address?: string;
  readonly shipping_address?: string;
}

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
   * Add a quantity of an item to the cart.
   *
   * ## `qty` is a DELTA, and this call is not idempotent
   *
   * The backend does `existing.quantity = (existing.quantity or 0) + qty`, so sending
   * 5 for a line holding 2 results in **7** - one row, never 5 and never two rows.
   * Sending it again gives 12.
   *
   * Verified by execution against the running backend and recorded in the backend
   * handoff (`docs/frontend-api-handoff.zip`, `API-CHANGELOG.md` item 16). An earlier
   * revision of this file claimed SET semantics; that was wrong.
   *
   * Consequences that are not optional:
   *
   * - **Never retry this call automatically.** A timeout may already have applied the
   *   delta, and a retry would apply it twice. There is no retry operator anywhere in
   *   this path and a test pins that.
   * - **Guard the control.** `CartStore.add` drops a second call while one is in
   *   flight; a double click or held Enter must not produce two requests.
   * - There is **no absolute set-quantity endpoint**. The cart UI is read-only by
   *   product decision, so no client-side delta arithmetic is required anywhere - the
   *   buyer's input on item detail *is* the delta.
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

  /**
   * Set the cart's contact person.
   *
   * ## These setters do not return the cart
   *
   * Wire-verified 2026-08-12, and worth stating plainly because the opposite is easy
   * to assume: `set_cart_contact` answers `{"contact_person": "…"}` and nothing else.
   * Only `get_cart` calls `build_cart_response`, so only `get_cart` carries totals,
   * lines, `is_shippable`, the resolved blocks and reconciliation.
   *
   * A selection can therefore reprice the cart without the reply showing it, which is
   * why every setter is followed by the canonical read - the same rule as
   * `addToCart`/`removeFromCart`, for the same reason.
   *
   * `contactName` is the Frappe Contact record `name`, never a display label.
   *
   * Wire-verified failures, both 422 with `field: "contact_person"`:
   * `contact_required` when blank, `contact_invalid` when the record is not the
   * customer's. A record that does not exist and one belonging to someone else answer
   * identically - the backend refuses to confirm existence, and the UI must not undo
   * that.
   */
  setContact(contactName: string): Observable<CartSelectionAckDto> {
    return this.api
      .post<CartSelectionAckDto>(SET_CART_CONTACT, { contact_person: contactName })
      .pipe(map((response) => response.data));
  }

  /**
   * Set the cart's billing address.
   *
   * The reply also echoes `shipping_address`, because the backend assigns billing to
   * shipping when shipping is empty. That is the server's behaviour, wire-verified -
   * the frontend neither predicts nor imitates it, it just re-reads the cart and shows
   * what came back.
   *
   * Failures: 422 `billing_address_required` / `billing_address_invalid`.
   */
  setBillingAddress(addressName: string): Observable<CartSelectionAckDto> {
    return this.api
      .post<CartSelectionAckDto>(SET_CART_BILLING_ADDRESS, { billing_address: addressName })
      .pipe(map((response) => response.data));
  }

  /**
   * Set the cart's shipping address.
   *
   * Refused with 422 `shipping_not_applicable` when the cart is not shippable - the
   * one failure here with no `field`, since no input is at fault.
   *
   * Otherwise: 422 `shipping_address_required` / `shipping_address_invalid`.
   */
  setShippingAddress(addressName: string): Observable<CartSelectionAckDto> {
    return this.api
      .post<CartSelectionAckDto>(SET_CART_SHIPPING_ADDRESS, { shipping_address: addressName })
      .pipe(map((response) => response.data));
  }
}
