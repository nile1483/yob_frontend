/**
 * Coupons the mock backend knows about.
 *
 * Deliberately a lookup table, not a rules engine. The real discount comes from an
 * ERPNext Pricing Rule attached to a Coupon Code, and reproducing that here would be
 * building a second pricing engine to test a frontend that is forbidden from having
 * one. What the frontend must get right is the *contract*: submit a code, receive
 * either a documented refusal or a whole cart whose totals the server moved.
 *
 * Every rejection below is a code observed on the running backend, with the status and
 * `field` it actually answers.
 */

/** The one coupon that applies cleanly. */
export const MOCK_COUPON_VALID = 'SAVE10';

/**
 * Its transaction-level discount, as a fraction of the cart's line total.
 *
 * A flat percentage stands in for whatever the Pricing Rule would have computed. The
 * only property the frontend depends on is that applying it changes `coupon_discount`
 * and `grand_total`, and removing it puts them back.
 */
export const MOCK_COUPON_RATE = 0.1;

/** A refusal, in the shape `mockYobError` needs. */
export interface MockCouponRejection {
  readonly code: string;
  readonly detail: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Codes that exist but cannot be applied, one per backend refusal.
 *
 * Anything not listed here and not {@link MOCK_COUPON_VALID} answers `coupon_invalid`,
 * exactly as an unknown code does on the real backend.
 *
 * `coupon_minimum_not_met` and `coupon_maximum_exceeded` carry their thresholds in
 * `details`, because the backend does. The frontend drops them at the network boundary
 * - `YobApiError.context` is a three-key allow-list - and the mock sends them anyway so
 * that stays true of a realistic payload rather than of a convenient one.
 */
export const MOCK_COUPON_REJECTIONS: Readonly<Record<string, MockCouponRejection>> = {
  EXPIRED10: {
    code: 'coupon_expired',
    detail: 'This coupon has expired.',
  },
  NOTYET10: {
    code: 'coupon_not_active',
    detail: 'This coupon is not active yet.',
  },
  USEDUP10: {
    code: 'coupon_usage_limit_reached',
    detail: 'This coupon has reached its usage limit.',
  },
  OTHERCUST: {
    code: 'coupon_not_applicable',
    detail: 'This coupon is not applicable for this customer.',
  },
  BIGSPEND: {
    code: 'coupon_minimum_not_met',
    detail: 'Minimum order amount should be 100000',
    details: { minimum_amount: 100000 },
  },
  SMALLSPEND: {
    code: 'coupon_maximum_exceeded',
    detail: 'Maximum order amount is 1',
    details: { maximum_amount: 1 },
  },
};

/**
 * The discount rate for an applied coupon code.
 *
 * Only the valid fixture discounts; anything else is zero, which is also what a cart
 * with no coupon gets.
 */
export function couponDiscountRate(code: string | null): number {
  return code === MOCK_COUPON_VALID ? MOCK_COUPON_RATE : 0;
}
