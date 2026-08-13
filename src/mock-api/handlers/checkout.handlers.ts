import type { MockContext, MockHandler } from '../core/mock-handler';
import { type MockReply, mockPermissionError, mockSuccess, mockYobError } from '../core/mock-reply';
import { MOCK_CHECKOUT_TOKEN, MOCK_PAYMENT_REQUEST } from '../fixtures/payment.fixture';

/**
 * Checkout transition handlers.
 *
 * Reproduces `checkout.proceed_to_payment` from reference 2.0.0
 * (`payment.proceed_to_payment`, verification level `test`).
 *
 * ## What the mock deliberately does not model
 *
 * No fingerprints, no supersession, no obligation lifecycle state, no created-versus-
 * reused bookkeeping beyond the status code. Those are backend internals, and a mock
 * that simulated them would invite frontend code to depend on them - which is exactly
 * what the contract says must not happen. The `201` and `200` scenarios return the
 * **same body**, so a test can prove the client treats them identically.
 */

// One definition, shared with the payment handlers: the token this endpoint issues must
// be the one `/payment/:token` accepts, and two constants would drift apart silently.

const proceedToPayment: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  // Stands in for the cart having changed since the page rendered - the server
  // re-validates at the moment of issue, so a page that looked ready can still be
  // refused. A real documented envelope, not an invented one.
  if (ctx.scenario === 'payment-refused') {
    return mockYobError('cart_empty', 'The cart is empty.', { status: 422 });
  }

  // The real endpoint validates the cart's checkout state before issuing anything, in
  // this order. Reproduced so the frontend's failure path is exercised against real
  // codes rather than a generic error.
  if (ctx.cart.isEmpty()) {
    return mockYobError('cart_empty', 'The cart is empty.', { status: 422 });
  }

  if (ctx.cart.currentContactPerson() === null) {
    return mockYobError('contact_required', 'Contact is required.', {
      field: 'contact_person',
      status: 422,
    });
  }

  if (ctx.cart.currentBillingAddress() === null) {
    return mockYobError('billing_address_required', 'Billing address is required.', {
      field: 'billing_address',
      status: 422,
    });
  }

  if (ctx.cart.isShippable() && ctx.cart.currentShippingAddress() === null) {
    return mockYobError('shipping_address_required', 'Shipping address is required.', {
      field: 'shipping_address',
      status: 422,
    });
  }

  // 201 created, or 200 reused. The body is identical; only the status differs, and
  // the frontend must not care which it got.
  const status = ctx.scenario === 'payment-reused' ? 200 : 201;

  return mockSuccess(
    {
      payment_request: MOCK_PAYMENT_REQUEST,
      payment_url: `/payment/${MOCK_CHECKOUT_TOKEN}`,
      token: MOCK_CHECKOUT_TOKEN,
    },
    { notice: 'Proceed to payment', status },
  );
};

function requireSession(ctx: MockContext): MockReply | null {
  return ctx.session.isAuthenticated() ? null : mockPermissionError(ctx.rpcMethod);
}

export const CHECKOUT_HANDLERS: Readonly<Record<string, MockHandler>> = {
  'yob_storefront.api.checkout.proceed_to_payment': proceedToPayment,
};
