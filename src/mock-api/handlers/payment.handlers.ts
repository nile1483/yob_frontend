import { isRecord } from '../../app/foundation/network/yob-api.types';
import type { MockContext, MockHandler } from '../core/mock-handler';
import { type MockReply, mockSuccess, mockYobError } from '../core/mock-reply';
import {
  MOCK_AMOUNT,
  MOCK_AMOUNT_PAISE,
  MOCK_CHECKOUT_TOKEN,
  MOCK_CURRENCY,
  MOCK_METHOD_PAY_LATER,
  MOCK_METHOD_RAZORPAY,
  MOCK_PAYMENT_REQUEST,
  MOCK_RAZORPAY_KEY,
  MOCK_RAZORPAY_ORDER_ID,
  MOCK_SALES_ORDER,
} from '../fixtures/payment.fixture';

/**
 * Public payment handlers, from reference 2.0.0.
 *
 * All three endpoints are **guest** - no session check, because the checkout token is
 * the credential. That is not an oversight to be tightened later; requiring a session
 * here would make the mock reject exactly the case the real page must support.
 *
 * The one lifecycle rule modelled is the source transition: `process_payment` commits,
 * and every subsequent `get_checkout_data` answers with the Sales-Order-backed shape
 * against the same token.
 */

/** Read what is being paid for. Shape depends on whether payment has been initiated. */
const getCheckoutData: MockHandler = (ctx) => {
  applyPaymentScenario(ctx);
  const token = ctx.params.get('token') ?? '';

  const tokenFailure = checkToken(ctx, token);
  if (tokenFailure) {
    return tokenFailure;
  }

  if (ctx.scenario === 'payment-stale') {
    return staleError();
  }

  return mockSuccess(ctx.payment.checkoutData(), {
    notice: 'Checkout data retrieved successfully',
  });
};

/**
 * Commit the order and start the method.
 *
 * Validation order follows the backend: token, then method presence, then eligibility.
 * Eligibility is re-checked here on every call, which is what makes the "method offered
 * a moment ago is now refused" case reachable.
 */
const processPayment: MockHandler = (ctx) => {
  applyPaymentScenario(ctx);
  const body = readBody(ctx);
  const token = readString(body, 'token');
  const paymentMethod = readString(body, 'payment_method');

  const tokenFailure = checkToken(ctx, token);
  if (tokenFailure) {
    return tokenFailure;
  }

  if (ctx.scenario === 'payment-stale') {
    return staleError();
  }

  if (paymentMethod === '') {
    return mockYobError('validation_failed', 'Payment method is required.', {
      field: 'payment_method',
      status: 422,
    });
  }

  // Matched on `name`, exactly as the backend does. Sending `method_code` - `razorpay`
  // rather than `Razorpay` - therefore fails here too, which is the point: a client
  // that confuses the two must not pass its tests.
  const method = ctx.payment
    .eligibleMethods()
    .find((candidate) => candidate.name === paymentMethod);

  if (method === undefined || ctx.scenario === 'payment-method-ineligible') {
    // The server drops the method from the eligible set as it refuses it, so the
    // client's reload sees the authoritative list rather than the one it just used.
    if (ctx.scenario === 'payment-method-ineligible') {
      ctx.payment.setEligibleMethods([MOCK_METHOD_PAY_LATER]);
    }

    return mockYobError(
      'payment_method_unsupported',
      'This payment method is not available for this order.',
      { field: 'payment_method', status: 422 },
    );
  }

  // Commitment happens BEFORE the provider call, which is why a provider failure below
  // still leaves a Sales Order behind.
  ctx.payment.commit();

  if (ctx.scenario === 'payment-provider-unavailable') {
    // retryable false and NO sales order: the gateway could never take this payment,
    // and nothing was committed. A retry would fail identically.
    return mockYobError(
      'payment_provider_error',
      'This payment method cannot be used for this order.',
      { details: { retryable: false }, status: 422 },
    );
  }

  if (ctx.scenario === 'payment-provider-error') {
    return mockYobError(
      'payment_provider_error',
      'We could not reach the payment provider. Your order is saved -- please try paying again.',
      {
        details: { retryable: true, sales_order: MOCK_SALES_ORDER },
        status: 500,
      },
    );
  }

  if (method.method_code === MOCK_METHOD_RAZORPAY.method_code) {
    return mockSuccess(
      {
        payment_method: 'razorpay',
        razorpay_key: MOCK_RAZORPAY_KEY,
        order_id: MOCK_RAZORPAY_ORDER_ID,
        // PROVIDER UNITS. 13500 paise == INR 135.00. Different scale from the amount
        // `get_checkout_data` reports, on purpose.
        amount: MOCK_AMOUNT_PAISE,
        currency: MOCK_CURRENCY,
        sales_order: MOCK_SALES_ORDER,
        payment_request: MOCK_PAYMENT_REQUEST,
      },
      { status: 201 },
    );
  }

  return mockSuccess(
    {
      payment_method: 'paylater',
      sales_order: MOCK_SALES_ORDER,
      payment_request: MOCK_PAYMENT_REQUEST,
      // Business units here, unlike Razorpay above.
      amount: MOCK_AMOUNT,
      currency: MOCK_CURRENCY,
      payment_status: 'Unpaid',
    },
    { notice: 'Order created with Pay Later', status: 201 },
  );
};

/**
 * Settle a Razorpay payment.
 *
 * Takes the three provider fields and **no token** - the real endpoint resolves the
 * obligation through the provider order id and authorises by HMAC. A client that sent a
 * token would be sending a bearer credential this endpoint never asked for, so the mock
 * ignores it rather than quietly accepting it.
 */
const verifyPayment: MockHandler = (ctx) => {
  const body = readBody(ctx);

  for (const field of ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature']) {
    if (readString(body, field) === '') {
      return mockYobError('validation_failed', 'Payment verification details are incomplete.', {
        field,
        status: 422,
      });
    }
  }

  if (ctx.scenario === 'payment-already-processed') {
    return mockYobError('payment_already_processed', 'This order has already been paid.', {
      status: 409,
    });
  }

  if (ctx.scenario === 'payment-signature-invalid') {
    return mockYobError('payment_signature_invalid', 'Invalid payment signature.', {
      status: 422,
    });
  }

  return mockSuccess(
    {
      sales_order: MOCK_SALES_ORDER,
      payment_request: MOCK_PAYMENT_REQUEST,
      payment_id: readString(body, 'razorpay_payment_id'),
    },
    { notice: 'Payment verified and order created successfully.' },
  );
};

/**
 * Put the mock server into the position the scenario describes.
 *
 * Applied on each call rather than once at startup, because the scenario is read from
 * the URL and these handlers are the first thing a payment page touches. Only the
 * server's *configuration* is set here - the committed flag is never cleared, so a
 * commitment made by an earlier `process_payment` survives, which is exactly the
 * transition the page has to cope with.
 */
function applyPaymentScenario(ctx: MockContext): void {
  if (ctx.scenario === 'payment-razorpay-only') {
    ctx.payment.setEligibleMethods([MOCK_METHOD_RAZORPAY]);
  } else if (ctx.scenario === 'payment-paylater-only') {
    ctx.payment.setEligibleMethods([MOCK_METHOD_PAY_LATER]);
  }

  if (ctx.scenario === 'payment-committed') {
    ctx.payment.commit();
  }
}

/** Blank and unknown tokens answer identically, as the backend does. */
function checkToken(ctx: MockContext, token: string): MockReply | null {
  if (ctx.scenario === 'payment-token-expired') {
    return mockYobError('checkout_token_expired', 'This payment link has expired.', {
      field: 'token',
      status: 422,
    });
  }

  if (token !== MOCK_CHECKOUT_TOKEN) {
    return mockYobError('checkout_token_invalid', 'This checkout link is not valid.', {
      field: 'token',
      status: 404,
    });
  }

  return null;
}

function staleError(): MockReply {
  return mockYobError(
    'payment_request_stale',
    'Your cart has changed since this payment was started. Please return to the cart and continue again.',
    { status: 409 },
  );
}

function readBody(ctx: MockContext): Record<string, unknown> {
  const body: unknown = ctx.request.body;
  return isRecord(body) ? body : {};
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

export const PAYMENT_HANDLERS: Readonly<Record<string, MockHandler>> = {
  'yob_storefront.api.payment.get_checkout_data': getCheckoutData,
  'yob_storefront.api.payment.process_payment': processPayment,
  'yob_storefront.api.payment.verify_payment': verifyPayment,
};
