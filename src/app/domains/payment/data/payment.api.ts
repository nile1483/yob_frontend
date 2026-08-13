import { Service, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';

import { YobApiClient } from '../../../foundation/network/yob-api-client';
import type {
  PaymentCheckoutDto,
  PaymentMethodDto,
  ProcessPaymentDto,
  RazorpayVerificationRequest,
  VerifyPaymentDto,
} from '../contracts/payment.types';

const GET_CHECKOUT_DATA = 'yob_storefront.api.payment.get_checkout_data';
const PROCESS_PAYMENT = 'yob_storefront.api.payment.process_payment';
const VERIFY_PAYMENT = 'yob_storefront.api.payment.verify_payment';

/**
 * The public payment endpoints.
 *
 * All three are guest-accessible: the checkout token is the credential, and the buyer
 * may have no session at all. The token is passed to the calls that need it and is not
 * held anywhere in this service.
 */
@Service()
export class PaymentApi {
  private readonly api = inject(YobApiClient);

  /**
   * Read what is being paid for.
   *
   * Returns one of two shapes, discriminated by `source_doctype`. Which one you get
   * depends on whether payment has been initiated yet, so the *same* token can answer
   * `Cart` now and `Sales Order` after a refresh. Callers must handle both.
   *
   * Failures: 404 `checkout_token_invalid` (blank or unknown), 422
   * `checkout_token_expired`, 409 `payment_request_stale` (the cart changed before
   * commitment).
   */
  getCheckoutData(token: string): Observable<PaymentCheckoutDto> {
    return this.api.get<PaymentCheckoutDto>(GET_CHECKOUT_DATA, { token }).pipe(map((r) => r.data));
  }

  /**
   * Commit the order and start the chosen payment method.
   *
   * ## Sends the method's `name`, never its `method_code`
   *
   * The contract is explicit: `payment_method` is the Payment Method record name -
   * `"Razorpay"`, `"Pay Later"` - and `method_code` is only for choosing which browser
   * integration runs afterwards. Sending the code answers 422
   * `payment_method_unsupported`. This method takes the whole {@link PaymentMethodDto}
   * rather than a string precisely so the two cannot be confused at the call site.
   *
   * ## Sends nothing else
   *
   * Only `token` and `payment_method`. No amount, currency, cart, sales order,
   * customer, payment request or provider order id - every one of those is derived
   * server-side from the immutable Payment Request.
   *
   * ## What it does
   *
   * Commits the cart to exactly **one** Draft Sales Order, idempotently: repeated calls
   * - Pay Later then Razorpay, or a retry after a provider failure - converge on the
   * same Sales Order and the same provider order. Eligibility is re-checked on every
   * call, so a method offered a moment ago can still be refused.
   *
   * Failures: 422 `validation_failed` (no method), 422 `payment_method_unsupported`
   * (unknown or no longer eligible), 409 `payment_request_stale`, and 500
   * `payment_provider_error` - which carries `details.retryable` and
   * `details.sales_order`, and means the order **was** created and the provider call
   * failed afterwards.
   */
  processPayment(token: string, method: PaymentMethodDto): Observable<ProcessPaymentDto> {
    return this.api
      .post<ProcessPaymentDto>(PROCESS_PAYMENT, { token, payment_method: method.name })
      .pipe(map((r) => r.data));
  }

  /**
   * Settle a Razorpay payment.
   *
   * Exactly the three fields Razorpay's success handler provides, and **no checkout
   * token**: the server resolves the obligation through the provider order id and
   * authorises the call by verifying the HMAC signature itself. Adding the token would
   * be sending a bearer credential the endpoint neither wants nor checks.
   *
   * The frontend's claim of success is never trusted - the server independently fetches
   * and validates the provider order and payment. So nothing may be presented to the
   * buyer as paid until this succeeds.
   *
   * Idempotent: re-verifying the same payment id returns the same body. A *different*
   * payment against a settled obligation answers 409 `payment_already_processed`.
   *
   * Failures: 422 `validation_failed` (a missing field, named in `field`), 422
   * `payment_signature_invalid`, 422 `payment_reference_invalid`.
   */
  verifyPayment(verification: RazorpayVerificationRequest): Observable<VerifyPaymentDto> {
    return this.api
      .post<VerifyPaymentDto>(VERIFY_PAYMENT, { ...verification })
      .pipe(map((r) => r.data));
  }
}
