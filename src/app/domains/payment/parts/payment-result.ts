import { CurrencyPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';

import { Alert } from '../../../design/alert/alert';

/** An order placed on credit terms. No money moved. */
export interface PayLaterOutcome {
  readonly kind: 'pay-later';
  readonly salesOrder: string;
  readonly paymentStatus: string;
  readonly amount: number;
  readonly currency: string;
}

/** A payment the **server** verified. Never constructed from a provider callback alone. */
export interface VerifiedOutcome {
  readonly kind: 'verified';
  readonly salesOrder: string;
  readonly paymentId: string;
}

export type PaymentOutcome = PayLaterOutcome | VerifiedOutcome;

/**
 * The end of the payment journey.
 *
 * ## Two outcomes that must never be worded alike
 *
 * A verified Razorpay payment took money and the server confirmed it, so it says so. A
 * Pay Later order took **nothing** - it is an order on terms, with a payment status of
 * `Unpaid` - so calling it "payment successful" would tell the buyer their invoice is
 * settled when it is not. It reports the order as placed and states the payment status
 * the server gave.
 *
 * ## What is shown
 *
 * The Sales Order, and for a verified payment the provider payment id, because those
 * are what a buyer quotes to support. Never the checkout token, the signature, or any
 * internal payment-request detail.
 */
@Component({
  selector: 'app-payment-result',
  imports: [Alert, CurrencyPipe],
  template: `
    <div data-testid="payment-result" [attr.data-outcome]="outcome().kind">
      <app-alert [tone]="isVerified() ? 'success' : 'info'">
        <span>{{ headline() }}</span>
      </app-alert>

      <dl class="mt-6 flex flex-col gap-3 rounded-lg border border-slate-200 p-4 text-sm">
        <div class="flex flex-wrap justify-between gap-x-4 gap-y-1">
          <dt class="text-slate-600" i18n="@@payment.result.order">Order</dt>
          <dd class="font-medium break-all" data-testid="payment-result-order">
            {{ outcome().salesOrder }}
          </dd>
        </div>

        @if (payLater(); as later) {
          <div class="flex flex-wrap justify-between gap-x-4 gap-y-1">
            <dt class="text-slate-600" i18n="@@payment.result.amount">Amount</dt>
            <dd class="font-medium">{{ later.amount | currency: later.currency }}</dd>
          </div>
          <div class="flex flex-wrap justify-between gap-x-4 gap-y-1">
            <dt class="text-slate-600" i18n="@@payment.result.status">Payment status</dt>
            <!-- The server's own word for it, so the page cannot drift from the record. -->
            <dd class="font-medium" data-testid="payment-result-status">
              {{ later.paymentStatus }}
            </dd>
          </div>
        }

        @if (verified(); as paid) {
          <div class="flex flex-wrap justify-between gap-x-4 gap-y-1">
            <dt class="text-slate-600" i18n="@@payment.result.reference">Payment reference</dt>
            <dd class="font-medium break-all" data-testid="payment-result-payment-id">
              {{ paid.paymentId }}
            </dd>
          </div>
        }
      </dl>

      <p class="mt-4 text-sm text-slate-600">{{ guidance() }}</p>
    </div>
  `,
})
export class PaymentResult {
  readonly outcome = input.required<PaymentOutcome>();

  protected readonly isVerified = computed(() => this.outcome().kind === 'verified');

  protected readonly payLater = computed(() => {
    const outcome = this.outcome();
    return outcome.kind === 'pay-later' ? outcome : null;
  });

  protected readonly verified = computed(() => {
    const outcome = this.outcome();
    return outcome.kind === 'verified' ? outcome : null;
  });

  protected readonly headline = computed(() =>
    this.isVerified()
      ? $localize`:@@payment.result.paid.headline:Payment received. Your order is confirmed.`
      : $localize`:@@payment.result.later.headline:Your order has been placed. Payment is still outstanding.`,
  );

  protected readonly guidance = computed(() =>
    this.isVerified()
      ? $localize`:@@payment.result.paid.body:Keep the order reference for your records.`
      : $localize`:@@payment.result.later.body:We will invoice this order under your agreed payment terms.`,
  );
}
