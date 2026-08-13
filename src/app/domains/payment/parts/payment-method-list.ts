import { Component, computed, input, output } from '@angular/core';

import type { PaymentMethodDto } from '../contracts/payment.types';

/**
 * How to pay, exactly as the server offered.
 *
 * ## Server-driven, with no client opinion
 *
 * The list is rendered verbatim from `payment_methods[]`. Nothing here knows that
 * Razorpay or Pay Later exist, nothing filters by `payment_type`, and nothing decides
 * eligibility - a deployment may return both, one, or something added later, and this
 * renders whatever arrives. Sorted only by the server's own `display_order`.
 *
 * ## Native radios
 *
 * A `fieldset` with a `legend` and plain radios, matching the checkout choice list:
 * grouping, arrow-key navigation and screen-reader position all come from the browser.
 *
 * The value bound to each radio is the method's **`name`**, which is what
 * `process_payment` takes. `method_code` is carried on the object for the caller to
 * branch on afterwards, and is never the submitted value.
 */
@Component({
  selector: 'app-payment-method-list',
  template: `
    <fieldset [disabled]="disabled()" data-testid="payment-methods">
      <legend class="text-lg font-semibold" i18n="@@payment.methods.heading">
        How would you like to pay?
      </legend>

      @if (ordered().length === 0) {
        <p
          class="mt-3 text-sm text-slate-600"
          data-testid="payment-methods-empty"
          i18n="@@payment.methods.empty"
        >
          No payment methods are available for this order. Please contact us to continue.
        </p>
      } @else {
        <ul class="mt-3 flex flex-col gap-2">
          @for (method of ordered(); track method.name) {
            <li>
              <label
                class="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200
                       p-3 hover:bg-slate-50 has-checked:border-slate-900 has-checked:bg-slate-50"
              >
                <input
                  type="radio"
                  name="payment-method"
                  class="mt-1 size-4 shrink-0"
                  [value]="method.name"
                  [checked]="method.name === selected()?.name"
                  (change)="select.emit(method)"
                  data-testid="payment-method-option"
                  [attr.data-method-code]="method.method_code"
                  [attr.data-method-name]="method.name"
                />
                <span class="min-w-0">
                  <span class="block font-medium break-words">{{ method.name }}</span>
                  @if (method.description) {
                    <span class="block text-sm break-words text-slate-600">
                      {{ method.description }}
                    </span>
                  }
                </span>
              </label>
            </li>
          }
        </ul>
      }
    </fieldset>
  `,
})
export class PaymentMethodList {
  readonly methods = input.required<readonly PaymentMethodDto[]>();
  readonly selected = input<PaymentMethodDto | null>(null);
  /** Locks the whole group while a payment is being processed. */
  readonly disabled = input(false);

  /** Emits the whole method, so the caller keeps both `name` and `method_code`. */
  readonly select = output<PaymentMethodDto>();

  /**
   * Sorted by the server's `display_order`.
   *
   * A copy, because the input array is the server's and sorting in place would mutate
   * shared state. Ties keep their arrival order.
   */
  protected readonly ordered = computed(() =>
    [...this.methods()].sort((a, b) => a.display_order - b.display_order),
  );
}
