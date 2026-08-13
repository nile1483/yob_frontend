import { Injectable, inject } from '@angular/core';

/** The Razorpay success callback payload. Exactly what `verify_payment` takes. */
export interface RazorpayHandlerResponse {
  readonly razorpay_order_id: string;
  readonly razorpay_payment_id: string;
  readonly razorpay_signature: string;
}

/**
 * The Razorpay Checkout options this application actually sets.
 *
 * Deliberately minimal. Razorpay accepts a great many options; declaring only the ones
 * used keeps the type honest about our surface area and stops an unused field being
 * added without thought. Every value here comes from the server.
 */
export interface RazorpayOptions {
  /** The **publishable** key from `process_payment`. There is no secret in the browser. */
  readonly key: string;
  /** Provider units (paise), passed through from the server untouched. */
  readonly amount: number;
  readonly currency: string;
  readonly order_id: string;
  readonly name?: string;
  readonly description?: string;
  readonly prefill?: {
    readonly name?: string;
    readonly email?: string;
    readonly contact?: string;
  };
}

/** What the caller wants to know about. */
export interface RazorpayCallbacks {
  readonly onSuccess: (response: RazorpayHandlerResponse) => void;
  /** The buyer closed the modal. Not a failure, and nothing was rolled back. */
  readonly onDismiss: () => void;
}

/** Thrown when Checkout.js cannot be loaded at all. */
export class RazorpayUnavailableError extends Error {
  constructor() {
    super('Razorpay Checkout could not be loaded');
    this.name = 'RazorpayUnavailableError';
  }
}

/**
 * Opens Razorpay Standard Checkout.
 *
 * An abstract class rather than an interface so it doubles as the DI token. The mock
 * build swaps in a deterministic fake through `environment.providers`; production has
 * only the real implementation below, and the fake lives under `src/mock-api/`, which a
 * production build never imports.
 */
// `useFactory` rather than `useClass`: the implementation is declared below this
// point, and a `useClass` reference would be evaluated while the class is still in its
// temporal dead zone. The factory runs at injection time instead.
@Injectable({ providedIn: 'root', useFactory: () => inject(RazorpayCheckoutLoader) })
export abstract class RazorpayCheckout {
  /**
   * Open the modal and resolve once it has been handed control.
   *
   * Rejects with {@link RazorpayUnavailableError} if the script cannot load. Success
   * and dismissal arrive through {@link RazorpayCallbacks}, because Razorpay reports
   * them through its own callbacks rather than through the open call.
   */
  abstract open(options: RazorpayOptions, callbacks: RazorpayCallbacks): Promise<void>;
}

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

/** The minimum of Razorpay's global surface this file touches. */
interface RazorpayGlobal {
  new (
    options: RazorpayOptions & {
      handler: (response: RazorpayHandlerResponse) => void;
      modal: { ondismiss: () => void };
    },
  ): { open: () => void };
}

/**
 * The real integration: Checkout.js, loaded on demand.
 *
 * ## Why a service and not a script tag in `index.html`
 *
 * Most visitors never reach the payment page, and a third-party script in the document
 * head runs for all of them. Loading it when a payment is actually being made keeps it
 * off every other page, and keeps the failure contained to the one screen that can do
 * something about it.
 *
 * ## Loaded once
 *
 * The in-flight promise is cached, so concurrent callers share one `<script>`. An
 * existing tag from a previous navigation is adopted rather than duplicated - injecting
 * a second copy would re-register Razorpay's globals.
 *
 * A failed load clears the cache so a retry can try again; a permanently poisoned
 * promise would make a transient network failure fatal for the session.
 */
@Injectable({ providedIn: 'root' })
export class RazorpayCheckoutLoader extends RazorpayCheckout {
  private loading: Promise<RazorpayGlobal> | null = null;

  async open(options: RazorpayOptions, callbacks: RazorpayCallbacks): Promise<void> {
    const Razorpay = await this.load();

    let settled = false;
    // Razorpay can call `ondismiss` after a successful handler. Only the first outcome
    // counts, or a completed payment would be reported as abandoned.
    const once = (run: () => void) => () => {
      if (!settled) {
        settled = true;
        run();
      }
    };

    const instance = new Razorpay({
      ...options,
      handler: (response) => once(() => callbacks.onSuccess(response))(),
      modal: { ondismiss: once(() => callbacks.onDismiss()) },
    });

    instance.open();
  }

  private load(): Promise<RazorpayGlobal> {
    this.loading ??= this.injectScript().catch((failure: unknown) => {
      // Let the next attempt start clean rather than caching the failure forever.
      this.loading = null;
      throw failure;
    });

    return this.loading;
  }

  private injectScript(): Promise<RazorpayGlobal> {
    // Browser-only. Nothing here runs during a server render or a unit test that has
    // no DOM, and the guard is what makes that explicit rather than accidental.
    if (typeof document === 'undefined') {
      return Promise.reject(new RazorpayUnavailableError());
    }

    const existingGlobal = readRazorpayGlobal();
    if (existingGlobal !== null) {
      return Promise.resolve(existingGlobal);
    }

    return new Promise<RazorpayGlobal>((resolve, reject) => {
      const settle = () => {
        const loaded = readRazorpayGlobal();
        if (loaded === null) {
          reject(new RazorpayUnavailableError());
          return;
        }
        resolve(loaded);
      };

      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${CHECKOUT_SCRIPT}"]`,
      );

      if (existing !== null) {
        existing.addEventListener('load', settle, { once: true });
        existing.addEventListener('error', () => reject(new RazorpayUnavailableError()), {
          once: true,
        });
        return;
      }

      const script = document.createElement('script');
      script.src = CHECKOUT_SCRIPT;
      script.async = true;
      script.addEventListener('load', settle, { once: true });
      script.addEventListener('error', () => reject(new RazorpayUnavailableError()), {
        once: true,
      });
      document.head.appendChild(script);
    });
  }
}

function readRazorpayGlobal(): RazorpayGlobal | null {
  const candidate = (globalThis as { Razorpay?: RazorpayGlobal }).Razorpay;
  return typeof candidate === 'function' ? candidate : null;
}
