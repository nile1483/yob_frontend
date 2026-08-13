import type { YobApiError } from '../../foundation/network/yob-api-error';

/**
 * How the payment page should react to a failure.
 *
 * A code alone is not enough here: these failures differ in what the buyer can *do*,
 * and two of them are actively dangerous to describe wrongly.
 */
export type PaymentFailureKind =
  /** The link itself is unusable. Terminal on this page. */
  | 'link-unusable'
  /** The cart changed before commitment; a new payment must be started from checkout. */
  | 'stale'
  /** Finished or closed. Nothing to retry, and offering a retry would be wrong. */
  | 'terminal'
  /** The method was refused. Re-read the authoritative method list and let them pick again. */
  | 'method-refused'
  /** The order exists and the provider call failed. Retry is safe and expected. */
  | 'retryable-provider'
  /** Anything else. Generic message, retry allowed. */
  | 'generic';

export interface PaymentFailure {
  readonly kind: PaymentFailureKind;
  readonly message: string;
  /**
   * The Sales Order the server reported alongside a retryable provider failure.
   *
   * Present only for `retryable-provider`. Shown so the buyer can see their order was
   * kept, which is the whole point of distinguishing this case.
   */
  readonly salesOrder: string | null;
}

/**
 * Turn a payment failure into something safe to display and act on.
 *
 * ## The two that must not be got wrong
 *
 * **`payment_provider_error` with `details.retryable`** means the Sales Order was
 * already committed and only the provider call failed. Telling the buyer their order
 * failed - or sending them back to rebuild a cart - would be false, and would invite
 * them to order twice. The wording says the order is saved and offers a retry.
 *
 * **`payment_request_stale`** is the opposite: nothing was committed, and this page
 * cannot issue a replacement obligation. Retrying here would keep failing, so the only
 * honest action is to send the buyer back to checkout.
 *
 * Everything else gets a generic message. No backend `detail` is ever displayed: it can
 * carry provider text, and the token must never appear in an error string.
 */
export function paymentFailure(error: YobApiError): PaymentFailure {
  switch (error.code) {
    case 'checkout_token_invalid':
      // Also what a **revoked** token answers - the server clears it on settlement. So
      // this is very often "you already paid", and the frontend cannot tell the two
      // apart: same code, same status. Wording that told a paying customer their link
      // was invalid would be wrong in the more common case, so it leads with the
      // likely one and stays true for the other.
      return {
        kind: 'terminal',
        message: $localize`:@@payment.error.linkClosed:This payment link is closed. If you have already paid, your order is confirmed - check your orders or contact us.`,
        salesOrder: null,
      };

    case 'checkout_token_expired':
      return {
        kind: 'terminal',
        message: $localize`:@@payment.error.linkExpired:This payment link has expired. Please start checkout again.`,
        salesOrder: null,
      };

    case 'payment_request_stale':
      return {
        kind: 'stale',
        message: $localize`:@@payment.error.stale:Your cart changed after this payment was started, so the amount is no longer current. Please return to checkout and continue again.`,
        salesOrder: null,
      };

    case 'payment_method_unsupported':
      return {
        kind: 'method-refused',
        message: $localize`:@@payment.error.methodUnsupported:That payment method is no longer available for this order. Please choose another.`,
        salesOrder: null,
      };

    case 'payment_provider_error':
    case 'payment_provider_not_configured':
      // One code, three situations. The server says which by way of `retryable`, and
      // guessing wrong is expensive in both directions: claiming a committed order
      // failed invites a duplicate order, and offering a retry that can never succeed
      // strands the buyer.
      if (error.context.retryable === true) {
        return {
          kind: 'retryable-provider',
          // Deliberately not "order failed". The order exists.
          message: $localize`:@@payment.error.provider:We could not start the payment. Your order has been saved - please try paying again.`,
          salesOrder: error.context.salesOrder ?? null,
        };
      }

      if (error.context.salesOrder !== undefined) {
        // retryable false *with* an order: the server wants a human to look at it.
        return {
          kind: 'terminal',
          message: $localize`:@@payment.error.providerReview:This payment needs to be checked before it can continue. Your order has been saved - please contact us.`,
          salesOrder: error.context.salesOrder,
        };
      }

      // retryable false, nothing committed: this gateway cannot take the payment.
      return {
        kind: 'method-refused',
        message: $localize`:@@payment.error.providerUnavailable:That payment method is not available right now. Please choose another.`,
        salesOrder: null,
      };

    case 'payment_signature_invalid':
      // Verification failed against the provider's own signature. Not something a
      // retry from this page can fix.
      return {
        kind: 'terminal',
        message: $localize`:@@payment.error.verify:We could not confirm this payment. If money has left your account, contact support before paying again.`,
        salesOrder: null,
      };

    case 'payment_reference_invalid':
      return {
        kind: 'generic',
        message: $localize`:@@payment.error.verify:We could not confirm this payment. If money has left your account, contact support before paying again.`,
        salesOrder: null,
      };

    case 'payment_already_processed':
      return {
        kind: 'terminal',
        message: $localize`:@@payment.error.alreadyProcessed:This order has already been paid.`,
        salesOrder: null,
      };

    case 'client_network_unavailable':
      return {
        kind: 'generic',
        message: $localize`:@@payment.error.offline:We could not reach the server. Check your connection and try again.`,
        salesOrder: null,
      };

    default:
      return {
        kind: 'generic',
        message: $localize`:@@payment.error.generic:Something went wrong with this payment. Please try again.`,
        salesOrder: null,
      };
  }
}

/** Safe wording for Razorpay Checkout failing to load at all. */
export function razorpayUnavailableMessage(): string {
  return $localize`:@@payment.error.razorpayUnavailable:We could not open the payment window. Check your connection and try again.`;
}

/** Whether the server marked a provider failure as safe to retry. */
export function isRetryableProviderFailure(error: YobApiError): boolean {
  return error.code === 'payment_provider_error' && error.context.retryable === true;
}
