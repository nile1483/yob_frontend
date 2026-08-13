import { Service, signal } from '@angular/core';

import type { PaymentMethodDto } from '../../app/domains/payment/contracts/payment.types';
import {
  MOCK_CART_BACKED,
  MOCK_METHOD_PAY_LATER,
  MOCK_METHOD_RAZORPAY,
  MOCK_SALES_ORDER_BACKED,
} from '../fixtures/payment.fixture';

/**
 * The mock API's payment-obligation state.
 *
 * Models exactly one thing the frontend must survive: **the source moves from Cart to
 * Sales Order when payment is initiated, and the token keeps working**. Everything else
 * about the backend's obligation lifecycle - fingerprints, supersession, credential
 * rotation - is deliberately absent, because the frontend must never depend on it and a
 * mock that simulated it would invite exactly that.
 *
 * Nothing is persisted; a reload restores the starting state, as with every other mock
 * server here.
 */
@Service()
export class MockServerPayment {
  /** Flips to `true` once `process_payment` commits, exactly as the backend does. */
  private readonly committed = signal(false);

  /** Which methods the server currently considers eligible. */
  private readonly eligible = signal<readonly PaymentMethodDto[]>([
    MOCK_METHOD_PAY_LATER,
    MOCK_METHOD_RAZORPAY,
  ]);

  isCommitted(): boolean {
    return this.committed();
  }

  /** Called by `process_payment`; the commitment is idempotent, as the contract says. */
  commit(): void {
    this.committed.set(true);
  }

  eligibleMethods(): readonly PaymentMethodDto[] {
    return this.eligible();
  }

  setEligibleMethods(methods: readonly PaymentMethodDto[]): void {
    this.eligible.set(methods);
  }

  /**
   * The checkout payload for the current lifecycle position.
   *
   * Before commitment the Cart-backed shape, afterwards the Sales-Order-backed one -
   * with the eligible method list applied to whichever shape is returned.
   */
  checkoutData() {
    const methods = this.eligible();

    return this.committed()
      ? { ...MOCK_SALES_ORDER_BACKED, payment_methods: methods }
      : { ...MOCK_CART_BACKED, payment_methods: methods };
  }

  reset(): void {
    this.committed.set(false);
    this.eligible.set([MOCK_METHOD_PAY_LATER, MOCK_METHOD_RAZORPAY]);
  }
}
