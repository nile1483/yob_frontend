import { isRecord } from '../../app/foundation/network/yob-api.types';
import { MOCK_COUPON_REJECTIONS, MOCK_COUPON_VALID } from '../fixtures/coupon.fixture';
import type { MockContext, MockHandler } from '../core/mock-handler';
import { type MockReply, mockPermissionError, mockSuccess, mockYobError } from '../core/mock-reply';

/**
 * Cart handlers.
 *
 * Reproduce the verified contract, including the parts that are inconvenient:
 * `add_to_cart` answers with the bare cart document and **no** reconciliation fields,
 * which is precisely why the client re-reads afterwards. Making the mutation return
 * the tidy `get_cart` shape would hide that from every test.
 */

/** The canonical read: cart, resolved blocks, and reconciliation. */
const getCart: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  applyShippabilityScenario(ctx);

  const payload = ctx.cart.buildPayload({
    reprice: ctx.scenario === 'cart-repriced',
    withdraw: ctx.scenario === 'cart-item-removed',
  });

  // The backend varies its notice with the outcome; the client ignores the text and
  // drives its messages off the arrays, but the shape is reproduced faithfully.
  let notice = 'Cart loaded';
  if (payload.removed_items.length > 0) {
    notice = 'Some items were removed because they are no longer available.';
  } else if (payload.price_updated_items.length > 0) {
    notice = 'Some items were updated due to pricing changes.';
  }

  return mockSuccess(payload, { notice });
};

/**
 * Add a quantity to an item's line.
 *
 * **`qty` is a DELTA.** `cart.py` does `existing.quantity = (existing.quantity or 0)
 * + qty`, so a line holding 2 that receives 5 ends at **7** - never 5, and never a
 * second row. The call is therefore **not idempotent**: repeating it adds again.
 *
 * Validation order and codes are wire-verified: missing `item_code` is 422
 * `validation_failed`, `qty <= 0` is 422 `quantity_invalid`, and an unknown code is
 * 404 `item_not_found`.
 */
const addToCart: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  const body: unknown = ctx.request.body;
  const record = isRecord(body) ? body : {};
  const itemCode = typeof record['item_code'] === 'string' ? record['item_code'] : '';
  const rawQty = record['qty'];
  const qty = typeof rawQty === 'number' ? rawQty : Number(rawQty);

  if (itemCode === '') {
    return mockYobError('validation_failed', 'Item code is required.', {
      field: 'item_code',
      status: 422,
    });
  }

  if (!Number.isFinite(qty) || qty <= 0) {
    return mockYobError('quantity_invalid', 'Quantity must be greater than zero.', {
      field: 'qty',
      status: 422,
    });
  }

  const item = ctx.cart.findItemByCode(itemCode);
  if (item === undefined) {
    return mockYobError('item_not_found', 'Item not found.', {
      field: 'item_code',
      status: 404,
    });
  }

  // The cart already holds this item in a unit ERPNext no longer sells it in. A 409, and
  // a refusal rather than a fix: the backend will not restate the line in the new unit,
  // because deciding what quantity `2 Nos` becomes in `Box` is a conversion nobody has
  // authorised. `existing_uom` stands in for the unit the line was created with - here
  // the stock unit, which is what the item used to sell in.
  if (ctx.scenario === 'cart-item-uom-changed' && ctx.cart.has(itemCode)) {
    return mockYobError(
      'cart_item_uom_changed',
      'This item is now sold in a different unit. Remove it from your cart and add it again.',
      {
        field: 'item_code',
        status: 409,
        details: {
          item_code: itemCode,
          existing_uom: item.stock_uom,
          current_uom: item.uom,
        },
      },
    );
  }

  ctx.cart.addQuantity(itemCode, qty);

  // The bare cart document, exactly as the backend replies - no reconciliation, no
  // contact, no addresses. The client must re-read to get those.
  return mockSuccess(ctx.cart.buildPayload().cart, { notice: 'Item added' });
};

/**
 * Remove an item from the cart, by `item_code`.
 *
 * Current backend semantics: it filters rows on the code, so nothing distinguishes
 * "removed one row" from "removed several" - today Add guarantees there is only one.
 * Reproduced as-is; the future line-identity contract is deliberately not simulated.
 *
 * Wire-verified failure: 422 `validation_failed` when `item_code` is blank. The real
 * backend does not 404 an unknown code - it simply filters nothing out - so neither
 * does this.
 */
const removeFromCart: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  const body: unknown = ctx.request.body;
  const record = isRecord(body) ? body : {};
  const itemCode = typeof record['item_code'] === 'string' ? record['item_code'] : '';

  if (itemCode === '') {
    return mockYobError('validation_failed', 'Item code is required.', {
      field: 'item_code',
      status: 422,
    });
  }

  ctx.cart.removeItem(itemCode);

  // Bare cart document, as the backend replies - the client re-reads for the rest.
  return mockSuccess(ctx.cart.buildPayload().cart, { notice: 'Item removed' });
};

/**
 * Set the cart's contact person.
 *
 * ## The reply is an acknowledgement, not a cart
 *
 * Wire-verified: `{"contact_person": "…"}`. Only `get_cart` runs
 * `build_cart_response`, so only `get_cart` carries totals, `is_shippable` and the
 * resolved blocks. Reproducing that faithfully is what forces the client to re-read -
 * a mock that returned the full cart here would let a client that ingested the
 * acknowledgement pass its tests and then hold a two-field object in production.
 *
 * Ownership is checked against the mock customer's own records, so `contact_invalid`
 * is reachable. A record that does not exist and one belonging to someone else answer
 * identically, exactly as the backend does - the mock must not be more informative
 * than the thing it stands in for.
 */
const setCartContact: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  const contact = readField(ctx, 'contact_person');

  if (contact === '') {
    return mockYobError('contact_required', 'Contact is required.', {
      field: 'contact_person',
      status: 422,
    });
  }

  if (!ctx.addressBook.hasContact(contact)) {
    return mockYobError(
      'contact_invalid',
      'The selected contact does not belong to this customer.',
      {
        field: 'contact_person',
        status: 422,
      },
    );
  }

  ctx.cart.setContactPerson(contact);
  return mockSuccess({ contact_person: contact }, { notice: 'Contact updated' });
};

/**
 * Set the cart's billing address.
 *
 * Also adopts it for shipping when shipping is empty, and echoes both fields - the
 * backend's own behaviour, wire-verified. The frontend does not predict this; it
 * re-reads the cart and displays what came back.
 */
const setCartBillingAddress: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  const address = readField(ctx, 'billing_address');

  if (address === '') {
    return mockYobError('billing_address_required', 'Billing address is required.', {
      field: 'billing_address',
      status: 422,
    });
  }

  if (!ctx.addressBook.hasAddress(address)) {
    return mockYobError(
      'billing_address_invalid',
      'The selected billing address does not belong to this customer.',
      { field: 'billing_address', status: 422 },
    );
  }

  ctx.cart.setBillingAddress(address);

  return mockSuccess(
    {
      billing_address: ctx.cart.currentBillingAddress(),
      shipping_address: ctx.cart.currentShippingAddress(),
    },
    { notice: 'Billing address updated' },
  );
};

/**
 * Set the cart's shipping address.
 *
 * Refused with `shipping_not_applicable` when the cart does not need shipping. Note
 * the ordering: the backend checks shippability *before* ownership, so a
 * non-shippable cart reports that rather than validating the address - and this has
 * no `field`, because no input is at fault.
 */
const setCartShippingAddress: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  applyShippabilityScenario(ctx);

  const address = readField(ctx, 'shipping_address');

  if (address === '') {
    return mockYobError('shipping_address_required', 'Shipping address is required.', {
      field: 'shipping_address',
      status: 422,
    });
  }

  if (!ctx.cart.isShippable()) {
    return mockYobError('shipping_not_applicable', 'Shipping is not required for this cart.', {
      status: 422,
    });
  }

  if (!ctx.addressBook.hasAddress(address)) {
    return mockYobError(
      'shipping_address_invalid',
      'The selected shipping address does not belong to this customer.',
      { field: 'shipping_address', status: 422 },
    );
  }

  ctx.cart.setShippingAddress(address);
  return mockSuccess({ shipping_address: address }, { notice: 'Shipping address updated' });
};

/**
 * Apply a coupon.
 *
 * The parameter is **`code`**, not `coupon_code` - the backend signature is
 * `apply_coupon(code=None)` while the cart *field* is `coupon_code`. Sending the wrong
 * one answers `coupon_code_required`, and reproducing that faithfully is what stops a
 * client shipping the confusion.
 *
 * The server trims and upper-cases the code, so `"  save10 "` is `SAVE10`. Every
 * refusal is 422 with `field: "code"`, matching the running backend.
 *
 * The reply is `{cart, coupon_code, removed_items, price_updated_items}` - a different
 * shape from `get_cart`, which is why the client re-reads. Reproduced rather than
 * tidied, for the same reason `add_to_cart` returns the bare document here.
 */
const applyCoupon: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  // Stands in for "the request was accepted but the answer was lost". The client must
  // recover by READING the cart, never by applying again - and `get_cart` deliberately
  // keeps working under this scenario so that recovery is observable.
  if (ctx.scenario === 'coupon-uncertain') {
    return mockYobError('internal_server_error', 'Something went wrong. Please try again.', {
      status: 500,
    });
  }

  const code = readField(ctx, 'code').toUpperCase();

  if (code === '') {
    return mockYobError('coupon_code_required', 'Coupon code is required.', {
      field: 'code',
      status: 422,
    });
  }

  const rejection = MOCK_COUPON_REJECTIONS[code];
  if (rejection) {
    return mockYobError(rejection.code, rejection.detail, {
      field: 'code',
      status: 422,
      ...(rejection.details ? { details: rejection.details } : {}),
    });
  }

  if (code !== MOCK_COUPON_VALID) {
    return mockYobError('coupon_invalid', 'The coupon is invalid or expired.', {
      field: 'code',
      status: 422,
    });
  }

  ctx.cart.setCoupon(code);

  const payload = ctx.cart.buildPayload();
  return mockSuccess(
    {
      cart: payload.cart,
      coupon_code: ctx.cart.currentCouponCode(),
      removed_items: payload.removed_items,
      price_updated_items: payload.price_updated_items,
    },
    { notice: 'Coupon applied successfully' },
  );
};

/**
 * Remove the cart's coupon.
 *
 * Takes no fields - the cart holds at most one coupon, so there is nothing to identify.
 * Refused with `coupon_not_applied` when there is none, which is worth reproducing: it
 * means a second Remove answers an error rather than quietly succeeding twice.
 */
const removeCoupon: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  if (ctx.scenario === 'coupon-uncertain') {
    return mockYobError('internal_server_error', 'Something went wrong. Please try again.', {
      status: 500,
    });
  }

  if (ctx.cart.currentCouponCode() === null) {
    return mockYobError('coupon_not_applied', 'No coupon is applied to this cart.', {
      field: 'code',
      status: 422,
    });
  }

  ctx.cart.clearCoupon();

  const payload = ctx.cart.buildPayload();
  return mockSuccess(
    {
      cart: payload.cart,
      removed_items: payload.removed_items,
      price_updated_items: payload.price_updated_items,
    },
    { notice: 'Coupon removed successfully' },
  );
};

/**
 * Mirror the scenario onto the mock server's cart.
 *
 * Applied by every handler that depends on shippability rather than once at dispatch,
 * so the setter refuses correctly even if it is called before any `get_cart` - the
 * real backend reads the stored flag on each call and does not care about ordering.
 */
function applyShippabilityScenario(ctx: MockContext): void {
  ctx.cart.setNotShippable(ctx.scenario === 'cart-not-shippable');
}

function readField(ctx: MockContext, key: string): string {
  const body: unknown = ctx.request.body;
  const record = isRecord(body) ? body : {};
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function requireSession(ctx: MockContext): MockReply | null {
  return ctx.session.isAuthenticated() ? null : mockPermissionError(ctx.rpcMethod);
}

export const CART_HANDLERS: Readonly<Record<string, MockHandler>> = {
  'yob_storefront.api.cart.get_cart': getCart,
  'yob_storefront.api.cart.add_to_cart': addToCart,
  'yob_storefront.api.cart.remove_from_cart': removeFromCart,
  'yob_storefront.api.cart.set_cart_contact': setCartContact,
  'yob_storefront.api.cart.set_cart_billing_address': setCartBillingAddress,
  'yob_storefront.api.cart.set_cart_shipping_address': setCartShippingAddress,
  'yob_storefront.api.cart.apply_coupon': applyCoupon,
  'yob_storefront.api.cart.remove_coupon': removeCoupon,
};
