import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Alert } from '../../../design/alert/alert';
import { Button } from '../../../design/button/button';
import { Spinner } from '../../../design/spinner/spinner';
import { normalizeYobFailure } from '../../../foundation/network/yob-api-error';
import {
  isCartBacked,
  isRazorpayOrder,
  type PaymentMethodDto,
  type ProcessPaymentDto,
  type RazorpayOrderDto,
} from '../contracts/payment.types';
import { PaymentApi } from '../data/payment.api';
import {
  paymentFailure,
  razorpayUnavailableMessage,
  type PaymentFailure,
} from '../payment-error-message';
import { PaymentMethodList } from '../parts/payment-method-list';
import { PaymentResult, type PaymentOutcome } from '../parts/payment-result';
import { PaymentSummary } from '../parts/payment-summary';
import {
  RazorpayCheckout,
  RazorpayUnavailableError,
  type RazorpayHandlerResponse,
} from '../razorpay/razorpay-checkout';

/**
 * The public payment page.
 *
 * ## Source-agnostic by construction
 *
 * `get_checkout_data` answers with a Cart-backed or a Sales-Order-backed shape, and the
 * *same* token can answer differently on a later load - because `process_payment`
 * commits the cart to an order and the obligation moves with it. A buyer who dismisses
 * the Razorpay modal and reloads sees the order-backed shape. That is normal operation.
 *
 * Nothing here assumes a cart exists. The summary renders whichever shape arrived, and
 * every value the page acts on - amount, currency, eligible methods - comes from the
 * response rather than being remembered from a previous one.
 *
 * ## The token
 *
 * Bound from the route parameter and passed to the two calls that need it. It is not
 * copied into state, not stored, not logged, and never put into an error message. The
 * URL carries it because that is the designed bearer credential.
 *
 * ## State is page-local
 *
 * There is no payment store. This page is the only consumer, the data is derived from
 * the route, and it is discarded when the buyer leaves - the same reasoning that keeps
 * catalog listing state local. What needed care was not where the state lives but that
 * the three asynchronous steps cannot overlap; `busy` below is the single guard.
 */
@Component({
  selector: 'app-payment-page',
  imports: [Alert, Button, PaymentMethodList, PaymentResult, PaymentSummary, RouterLink, Spinner],
  template: `
    <div class="mx-auto w-full max-w-2xl" data-testid="payment-page">
      <h1 class="text-2xl font-semibold tracking-tight" i18n="@@payment.heading">Payment</h1>

      @if (outcome(); as done) {
        <!-- Terminal. The summary and methods are gone on purpose: there is nothing
             left to choose, and offering a payment control would invite paying twice. -->
        <div class="mt-6">
          <app-payment-result [outcome]="done" />
        </div>
      } @else if (checkout.isLoading()) {
        <div class="mt-8 flex justify-center" data-testid="payment-loading">
          <app-spinner label="Loading payment details" i18n-label="@@payment.loading" />
        </div>
      } @else if (loadFailure(); as failure) {
        <div class="mt-6" data-testid="payment-load-error">
          <app-alert tone="error">{{ failure.message }}</app-alert>

          @if (failure.kind === 'stale') {
            <!-- This page cannot issue a replacement obligation, so retrying here would
                 fail forever. Checkout is the only place that can. -->
            <a
              routerLink="/checkout"
              class="mt-4 inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2
                     text-sm font-medium text-white hover:bg-slate-700"
              data-testid="payment-return-to-checkout"
              i18n="@@payment.returnToCheckout"
            >
              Return to checkout
            </a>
          }
        </div>
      } @else if (checkout.value(); as data) {
        <div class="mt-6 flex flex-col gap-8">
          <app-payment-summary [data]="data" />

          @if (actionFailure(); as failure) {
            <div data-testid="payment-action-error">
              <app-alert [tone]="failure.kind === 'retryable-provider' ? 'info' : 'error'">
                <span>{{ failure.message }}</span>
              </app-alert>

              @if (failure.salesOrder; as order) {
                <!-- Shown because the order survived: the buyer needs to see that the
                     retry is against something that already exists. -->
                <p class="mt-2 text-sm text-slate-600" data-testid="payment-preserved-order">
                  <ng-container i18n="@@payment.preservedOrder">Your order</ng-container>:
                  {{ order }}
                </p>
              }
            </div>
          }

          @if (dismissed()) {
            <div data-testid="payment-dismissed">
              <app-alert tone="info">
                <span i18n="@@payment.dismissed"
                  >The payment window was closed. Your order is saved - you can try paying
                  again.</span
                >
              </app-alert>
            </div>
          }

          <app-payment-method-list
            [methods]="data.payment_methods"
            [selected]="selectedMethod()"
            [disabled]="busy()"
            (select)="onSelectMethod($event)"
          />

          <div>
            <button
              yob-button
              type="button"
              class="w-full sm:w-auto"
              [disabled]="selectedMethod() === null"
              [loading]="busy()"
              (click)="onPay()"
              data-testid="payment-pay"
              i18n="@@payment.pay"
            >
              Pay now
            </button>

            @if (busyLabel(); as label) {
              <p class="mt-3 text-sm text-slate-600" aria-live="polite" data-testid="payment-busy">
                {{ label }}
              </p>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class PaymentPage {
  /** Bound from `/payment/:token` by `withComponentInputBinding`. */
  readonly token = input.required<string>();

  private readonly api = inject(PaymentApi);
  private readonly razorpay = inject(RazorpayCheckout);

  /**
   * What is owed, and how it may be paid.
   *
   * Keyed on the token so it reloads if the route ever changes, and reloadable by hand
   * when the server tells us our copy is out of date - a refused method means the
   * eligible set moved on.
   */
  protected readonly checkout = rxResource({
    params: () => ({ token: this.token() }),
    stream: ({ params }) => this.api.getCheckoutData(params.token),
  });

  protected readonly selectedMethod = signal<PaymentMethodDto | null>(null);
  protected readonly outcome = signal<PaymentOutcome | null>(null);
  protected readonly dismissed = signal(false);

  private readonly processing = signal(false);
  private readonly awaitingProvider = signal(false);
  private readonly verifying = signal(false);
  private readonly actionFailureSignal = signal<PaymentFailure | null>(null);

  protected readonly actionFailure = this.actionFailureSignal.asReadonly();

  /**
   * One guard for every asynchronous step.
   *
   * It blocks a second `process_payment`, a second Razorpay open, and a second
   * `verify_payment` alike. They are different operations but the same hazard: each
   * duplicate is a real financial action, and the buyer has no way to tell that the
   * first is still running.
   */
  protected readonly busy = computed(
    () => this.processing() || this.awaitingProvider() || this.verifying(),
  );

  protected readonly busyLabel = computed(() => {
    if (this.verifying()) {
      return $localize`:@@payment.busy.verifying:Confirming your payment…`;
    }
    if (this.awaitingProvider()) {
      return $localize`:@@payment.busy.provider:Waiting for the payment window…`;
    }
    if (this.processing()) {
      return $localize`:@@payment.busy.processing:Preparing your payment…`;
    }
    return null;
  });

  /** A failure that stopped the page loading at all. */
  protected readonly loadFailure = computed<PaymentFailure | null>(() => {
    const error = this.checkout.error();
    return error === undefined || error === null
      ? null
      : paymentFailure(normalizeYobFailure(error));
  });

  protected onSelectMethod(method: PaymentMethodDto): void {
    if (this.busy()) {
      return;
    }
    this.selectedMethod.set(method);
    // A new choice supersedes whatever the last one failed with.
    this.actionFailureSignal.set(null);
    this.dismissed.set(false);
  }

  /**
   * Commit the order and start the chosen method.
   *
   * Sends only the token and the method's **name**. Nothing is shown as paid here -
   * Pay Later reports an unpaid order, and Razorpay only hands off to the provider.
   */
  protected onPay(): void {
    const method = this.selectedMethod();
    if (method === null || this.busy()) {
      return;
    }

    this.processing.set(true);
    this.actionFailureSignal.set(null);
    this.dismissed.set(false);

    this.api.processPayment(this.token(), method).subscribe({
      next: (result) => {
        this.processing.set(false);
        this.onProcessed(result, method);
      },
      error: (failure: unknown) => {
        this.processing.set(false);
        this.onProcessFailed(failure);
      },
    });
  }

  private onProcessed(result: ProcessPaymentDto, method: PaymentMethodDto): void {
    if (isRazorpayOrder(result)) {
      void this.openProvider(result);
      return;
    }

    // Offline method: an order exists and nothing has been paid. `payment_status` is
    // the server's word, shown as-is rather than translated into "success".
    this.outcome.set({
      kind: 'pay-later',
      salesOrder: result.sales_order,
      paymentStatus: result.payment_status,
      amount: result.amount,
      currency: result.currency,
    });
    // `method` is deliberately unused beyond dispatch: nothing about the outcome is
    // taken from the client's idea of which method ran.
    void method;
  }

  private onProcessFailed(failure: unknown): void {
    const error = normalizeYobFailure(failure);
    const mapped = paymentFailure(error);
    this.actionFailureSignal.set(mapped);

    if (mapped.kind === 'method-refused') {
      // The server just told us the eligible set is not what we rendered. Re-read it
      // and drop the rejected choice rather than leaving it selected and clickable.
      this.selectedMethod.set(null);
      this.checkout.reload();
    }
  }

  /**
   * Hand off to Razorpay Checkout.
   *
   * Every option comes from the server's reply. `amount` in particular is in **provider
   * units** (paise) and is passed through untouched - converting it here would be a
   * hundredfold error in one direction or the other.
   */
  private async openProvider(order: RazorpayOrderDto): Promise<void> {
    if (this.awaitingProvider()) {
      return;
    }

    this.awaitingProvider.set(true);

    try {
      await this.razorpay.open(
        {
          key: order.razorpay_key,
          amount: order.amount,
          currency: order.currency,
          order_id: order.order_id,
          name: this.businessName() ?? undefined,
          description: order.sales_order,
          prefill: this.prefill(),
        },
        {
          onSuccess: (response) => this.onProviderSuccess(response),
          onDismiss: () => this.onProviderDismissed(),
        },
      );
    } catch (failure: unknown) {
      this.awaitingProvider.set(false);

      if (failure instanceof RazorpayUnavailableError) {
        this.actionFailureSignal.set({
          kind: 'generic',
          message: razorpayUnavailableMessage(),
          salesOrder: order.sales_order,
        });
        return;
      }

      this.actionFailureSignal.set(paymentFailure(normalizeYobFailure(failure)));
    }
  }

  /**
   * The buyer closed the modal.
   *
   * Not a failure, and emphatically not a rollback: `process_payment` already committed
   * the Sales Order before the modal opened. The page stays put with a retry, and a
   * reload will legitimately return the order-backed shape.
   */
  private onProviderDismissed(): void {
    this.awaitingProvider.set(false);
    this.dismissed.set(true);
  }

  /**
   * Razorpay says it succeeded; the server decides whether it did.
   *
   * Nothing is presented as paid until `verify_payment` returns. The callback's word is
   * not evidence - the server independently fetches and validates the provider records.
   */
  private onProviderSuccess(response: RazorpayHandlerResponse): void {
    this.awaitingProvider.set(false);

    if (this.verifying()) {
      return;
    }

    this.verifying.set(true);

    this.api.verifyPayment(response).subscribe({
      next: (verified) => {
        this.verifying.set(false);
        this.outcome.set({
          kind: 'verified',
          salesOrder: verified.sales_order,
          paymentId: verified.payment_id,
        });
      },
      error: (failure: unknown) => {
        this.verifying.set(false);
        this.actionFailureSignal.set(paymentFailure(normalizeYobFailure(failure)));
      },
    });
  }

  /** The trading name, for the provider modal's header. */
  private businessName(): string | null {
    const data = this.checkout.value();
    if (data === undefined) {
      return null;
    }
    return isCartBacked(data) ? data.cart.company : data.company;
  }

  /**
   * Buyer details for the modal, only where the contract actually supplies them.
   *
   * Cart-backed responses carry a resolved contact with an email and phone. The
   * order-backed shape carries only a contact *record name*, which is not an email
   * address - so nothing is prefilled there rather than guessing.
   */
  private prefill(): { name?: string; email?: string; contact?: string } | undefined {
    const data = this.checkout.value();
    if (data === undefined || !isCartBacked(data) || data.contact === null) {
      return undefined;
    }

    const { full_name, email, phone } = data.contact;
    const prefill = {
      ...(full_name !== null ? { name: full_name } : {}),
      ...(email !== null ? { email } : {}),
      ...(phone !== null ? { contact: phone } : {}),
    };

    return Object.keys(prefill).length > 0 ? prefill : undefined;
  }
}
