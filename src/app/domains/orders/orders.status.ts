import type { BadgeTone } from '../../design/badge/badge';
import type { OrderDetailDto, OrderPaymentLogDto } from './contracts/orders.types';

/**
 * Turning backend order state into something a buyer should read.
 *
 * Shared by the list and the detail page, which is the whole reason it is a module
 * rather than a method on either of them: two pages showing the same order must not
 * describe it differently.
 */

/**
 * A buyer-facing order status.
 *
 * ## Why `Draft` is not shown as "Draft"
 *
 * The payment flow commits Sales Orders at `docstatus = 0`, so ERPNext reports their
 * status as `Draft` - **including orders paid in full by a real Razorpay
 * transaction.** All three orders on the development bench are `Draft`, two of them
 * with captured payments.
 *
 * "Draft" in ERPNext means *not submitted*, an internal bookkeeping state. To a buyer
 * it reads as "we didn't actually place your order", which would be false and alarming
 * for someone who has just been charged. So the ERPNext vocabulary is mapped, never
 * rendered.
 *
 * The status list is a closed `Select` in ERPNext, so every value is handled and there
 * is no guessing at an unknown one.
 */
export function orderStatusLabel(status: string): string {
  switch (status) {
    case 'Draft':
      // Committed and awaiting fulfilment. Not "draft" in any buyer-meaningful sense.
      return $localize`:@@orders.status.received:Order received`;
    case 'To Pay':
      return $localize`:@@orders.status.toPay:Awaiting payment`;
    case 'On Hold':
      return $localize`:@@orders.status.onHold:On hold`;
    case 'To Deliver and Bill':
    case 'To Deliver':
      return $localize`:@@orders.status.toDeliver:Preparing for delivery`;
    case 'To Bill':
      return $localize`:@@orders.status.toBill:Awaiting invoice`;
    case 'Completed':
      return $localize`:@@orders.status.completed:Completed`;
    case 'Cancelled':
      return $localize`:@@orders.status.cancelled:Cancelled`;
    case 'Closed':
      return $localize`:@@orders.status.closed:Closed`;
    default:
      // The vocabulary is closed, so this is unreachable in practice. If ERPNext ever
      // adds a value, a neutral word is safer than echoing an internal one.
      return $localize`:@@orders.status.processing:Processing`;
  }
}

/**
 * The tone a status badge should carry.
 *
 * Paired with `orderStatusLabel` and kept in the same file so the two cannot drift: a
 * status whose word says "Cancelled" but whose colour says success would be worse than
 * no colour at all.
 *
 * Colour is always redundant here - the badge shows the word too - so this is a scan
 * aid, not the meaning. Before Phase 17 every status rendered in the same grey, which
 * made `Completed` and `Cancelled` indistinguishable in a list a buyer scans precisely
 * to tell them apart.
 *
 * Deliberately conservative: only genuinely finished and genuinely stopped states get
 * a colour. Everything in flight stays neutral, because tinting five in-progress
 * states five different colours is decoration, not information.
 */
export function orderStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'Completed':
      return 'success';
    case 'Cancelled':
    case 'Closed':
      return 'danger';
    case 'On Hold':
    case 'To Pay':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** What the order's payment records say, in buyer terms. */
export type OrderPaymentState = 'paid' | 'not-paid';

/**
 * Razorpay's own word for a completed payment.
 *
 * The backend stores `payment.status` verbatim in a free-text field, so this is
 * provider vocabulary rather than a YOB status. It is the only completion signal the
 * order API exposes.
 */
const PROVIDER_CAPTURED = 'captured';

/**
 * Whether this order has been paid.
 *
 * ## Read from the recorded status, not from the existence of a payment id
 *
 * A Payment Log row exists for attempts that failed as well as ones that succeeded, so
 * "there is a payment id" is not the same as "it was paid". Only a log the provider
 * reported as captured counts.
 *
 * An order with **no** logs at all has not been paid through the provider - the
 * unpaid, abandoned, or Pay Later case. There is no order-level payment field to
 * consult instead.
 */
export function orderPaymentState(order: OrderDetailDto): OrderPaymentState {
  return capturedPayment(order) === null ? 'not-paid' : 'paid';
}

/**
 * The captured payment, if there is one.
 *
 * Returned so the detail page can show its method and reference - the things a buyer
 * quotes when asking about a payment. Failed and pending attempts are deliberately not
 * surfaced: they are provider retry noise, not information a buyer can act on.
 */
export function capturedPayment(order: OrderDetailDto): OrderPaymentLogDto | null {
  return (
    order.payment_logs.find((log) => log.payment_status?.toLowerCase() === PROVIDER_CAPTURED) ??
    null
  );
}

/** Buyer-facing wording for the payment state. */
export function orderPaymentLabel(state: OrderPaymentState): string {
  return state === 'paid'
    ? $localize`:@@orders.payment.paid:Paid`
    : $localize`:@@orders.payment.notPaid:Awaiting payment`;
}
