import { isRecord } from '../../app/foundation/network/yob-api.types';
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
 * Add an item, or set the quantity of one already present.
 *
 * **Set semantics.** `cart.py` does `existing.quantity = qty`, so a line holding 2
 * that receives 3 ends at 3 - never 5. Reproduced exactly; a test pins it.
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

  if (ctx.cart.findItemByCode(itemCode) === undefined) {
    return mockYobError('item_not_found', 'Item not found.', {
      field: 'item_code',
      status: 404,
    });
  }

  ctx.cart.setQuantity(itemCode, qty);

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

function requireSession(ctx: MockContext): MockReply | null {
  return ctx.session.isAuthenticated() ? null : mockPermissionError(ctx.rpcMethod);
}

export const CART_HANDLERS: Readonly<Record<string, MockHandler>> = {
  'yob_storefront.api.cart.get_cart': getCart,
  'yob_storefront.api.cart.add_to_cart': addToCart,
  'yob_storefront.api.cart.remove_from_cart': removeFromCart,
};
