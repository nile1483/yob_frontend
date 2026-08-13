import { Injectable } from '@angular/core';

import {
  RazorpayCheckout,
  RazorpayUnavailableError,
  type RazorpayCallbacks,
  type RazorpayOptions,
} from '../../app/domains/payment/razorpay/razorpay-checkout';

/** What the fake modal does when opened. */
export type FakeRazorpayOutcome =
  /** Calls the success handler with deterministic provider identifiers. */
  | 'success'
  /** Calls `ondismiss`, as a buyer closing the modal does. */
  | 'dismiss'
  /** Rejects as though Checkout.js could not be fetched. */
  | 'load-failure'
  /** Opens and then does nothing, so a test can inspect the pending state. */
  | 'hang';

/** Obviously fake, and matching the reference's own example identifiers. */
export const FAKE_RAZORPAY_PAYMENT_ID = 'pay_EXAMPLE0001';
export const FAKE_RAZORPAY_SIGNATURE = 'fake-signature-not-a-secret';

/**
 * A deterministic stand-in for Razorpay Standard Checkout.
 *
 * Automated browser tests must never load the real Checkout.js: it is a third-party
 * script, it opens a real provider modal, and it would make the suite depend on
 * Razorpay's availability. This substitutes for it at the one seam the application
 * already has - the `RazorpayCheckout` token.
 *
 * It lives under `src/mock-api/` for the same reason the mock HTTP layer does: the
 * production environment file never imports this folder, so the fake is **absent** from
 * a production bundle rather than merely unreachable.
 *
 * The outcome is chosen with `?razorpay=` on the page URL, the same idiom as
 * `?mockScenario=`. Defaults to `success`.
 */
@Injectable()
export class FakeRazorpayCheckout extends RazorpayCheckout {
  /** Every option set the page has passed, so a test can assert on them. */
  readonly opens: RazorpayOptions[] = [];

  private outcome: FakeRazorpayOutcome = 'success';

  constructor() {
    super();

    const requested = new URLSearchParams(globalThis.location?.search ?? '').get('razorpay');
    if (
      requested === 'success' ||
      requested === 'dismiss' ||
      requested === 'load-failure' ||
      requested === 'hang'
    ) {
      this.outcome = requested;
    }

    // Exposed so a Playwright test can count opens and read the options the page built
    // from server values - the assertions that matter are about what we passed through,
    // not about Razorpay's own behaviour.
    (globalThis as { __yobFakeRazorpay?: unknown }).__yobFakeRazorpay = this;
  }

  setOutcome(outcome: FakeRazorpayOutcome): void {
    this.outcome = outcome;
  }

  open(options: RazorpayOptions, callbacks: RazorpayCallbacks): Promise<void> {
    if (this.outcome === 'load-failure') {
      // Rejects before recording the open: nothing was shown to the buyer.
      return Promise.reject(new RazorpayUnavailableError());
    }

    this.opens.push(options);

    if (this.outcome === 'hang') {
      return Promise.resolve();
    }

    // Asynchronous, like the real widget: the page must not assume the callback has
    // already run by the time `open` resolves.
    setTimeout(() => {
      if (this.outcome === 'dismiss') {
        callbacks.onDismiss();
        return;
      }

      callbacks.onSuccess({
        razorpay_order_id: options.order_id,
        razorpay_payment_id: FAKE_RAZORPAY_PAYMENT_ID,
        razorpay_signature: FAKE_RAZORPAY_SIGNATURE,
      });
    }, 0);

    return Promise.resolve();
  }
}
