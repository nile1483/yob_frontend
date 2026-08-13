import { Service, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';

import { YobApiClient } from '../../../foundation/network/yob-api-client';
import type { ProceedToPaymentData } from '../contracts/checkout.types';

const PROCEED_TO_PAYMENT = 'yob_storefront.api.checkout.proceed_to_payment';

/**
 * The checkout transition: from a ready cart to a payment obligation.
 *
 * Separate from `AddressBookApi` because it is a different kind of thing. That one
 * reads and writes the customer's master data; this one asks the server to issue a
 * financial obligation. Putting them together would suggest they carry similar risk.
 */
@Service()
export class CheckoutApi {
  private readonly api = inject(YobApiClient);

  /**
   * Ask the server to issue - or reuse - the checkout credential for the current cart.
   *
   * ## The request carries nothing
   *
   * No body at all. Not the cart id, not the customer, not an amount, not a currency,
   * not a fingerprint, not a payment method. The server derives every one of those
   * from the authenticated session and the buyer's open cart.
   *
   * This is the security property of the endpoint, not an incidental detail: a
   * Payment Request is an immutable financial obligation, and a browser that could
   * name the amount could name the wrong one. `post()` defaults the body to `{}`,
   * which is what the endpoint expects.
   *
   * ## 201 and 200 mean the same thing here
   *
   * `201` when an obligation was created (first checkout, or a replacement because
   * the cart changed); `200` when an open one was reused, possibly with a rotated
   * credential. Callers must not distinguish them - created-versus-reused,
   * supersession and token rotation are server implementation details, and the client
   * has nothing useful to do differently. Both resolve here to the same value.
   *
   * ## Failures
   *
   * Documented precondition failures, all `422` except the first:
   * `cart_not_found` (404), `cart_empty`, `contact_required`,
   * `billing_address_required`, `shipping_address_required` (only when the cart is
   * shippable). They are business validation, not session failures - the caller stays
   * on checkout and stays signed in.
   *
   * Contract source: `reference/api/live/verified-responses.json`,
   * `payment.proceed_to_payment` (reference 2.0.0, verification level `test`).
   */
  proceedToPayment(): Observable<ProceedToPaymentData> {
    return this.api.post<ProceedToPaymentData>(PROCEED_TO_PAYMENT).pipe(map((r) => r.data));
  }
}
