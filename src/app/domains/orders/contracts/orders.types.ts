/**
 * Buyer order contracts.
 *
 * Source-verified from `yob_storefront/api/order.py` and wire-verified against the
 * development bench's three real Sales Orders on 2026-08-13 - two of which were paid
 * by real Razorpay Test Mode transactions.
 *
 * The backend handoff (`docs/api-handoff/`) covers these endpoints only in the
 * authorization matrix and error tables; it carries no response shapes for them. So
 * these types come from the implementation plus live reads, and that is recorded
 * rather than glossed over.
 */

/**
 * One row of the order list.
 *
 * Exactly the five fields `get_orders` selects. Note what is **not** here: no
 * currency, no payment information, no item count. The list cannot show what the
 * endpoint does not return.
 */
export interface OrderSummaryDto {
  /** The Sales Order name, e.g. `SAL-ORD-2026-00001`. Identifier *and* what a buyer quotes. */
  readonly name: string;
  /** ERPNext Sales Order status. Internal vocabulary - never rendered raw. */
  readonly status: string;
  readonly grand_total: number;
  /** `YYYY-MM-DD`. */
  readonly transaction_date: string | null;
  readonly delivery_date: string | null;
}

/** One line of an order. Every figure is the server's. */
export interface OrderLineDto {
  readonly item_code: string;
  readonly item_name: string | null;
  readonly description: string | null;
  /** Observed as `""` rather than null on the bench. Treated as absent when empty. */
  readonly image: string | null;
  readonly qty: number;
  readonly uom: string | null;
  readonly price_list_rate: number;
  readonly rate: number;
  readonly discount_percentage: number;
  readonly discount_amount: number;
  readonly amount: number;
  readonly net_amount: number;
}

/**
 * An address as the order endpoint resolves it.
 *
 * Note this is read from the **current** Address master by the backend, not stored as
 * a snapshot on the order - so editing an address changes how past orders display.
 * That is the backend's design; the frontend renders what it is given and never
 * fetches master data to reconstruct history.
 */
export interface OrderAddressDto {
  readonly address_title: string | null;
  readonly address_line1: string | null;
  readonly address_line2: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly country: string | null;
  readonly pincode: string | null;
  readonly phone: string | null;
}

/**
 * A provider payment attempt recorded against the order.
 *
 * `payment_status` is a free-text `Data` field written straight from Razorpay's
 * `payment.status`, so it carries **provider** vocabulary (`captured`, …) rather than
 * anything buyer-facing. There is no order-level payment status field anywhere in this
 * contract; this list is the only payment signal, and an order with none has not been
 * paid through the provider.
 */
export interface OrderPaymentLogDto {
  readonly name: string;
  readonly payment_status: string | null;
  readonly payment_method: string | null;
  readonly payment_amount: number | null;
  readonly currency: string | null;
  readonly razorpay_order_id: string | null;
  readonly razorpay_payment_id: string | null;
  readonly email: string | null;
  readonly contact: string | null;
  readonly creation: string | null;
}

/**
 * The `get_order_details` payload.
 *
 * Totals are all computed server-side, including `original_total` and `discount`,
 * which the backend derives from the lines. Nothing here is recomputed in Angular.
 */
export interface OrderDetailDto {
  readonly name: string;
  readonly customer: string;
  readonly status: string;

  readonly transaction_date: string | null;
  readonly delivery_date: string | null;
  readonly currency: string;

  readonly original_total: number;
  readonly discount: number;
  readonly subtotal: number;
  readonly net_total: number;
  readonly tax: number;
  readonly grand_total: number;
  readonly rounded_total: number;

  /** Contact record name. `contact_email`/`contact_mobile` were null on every real order. */
  readonly contact_person: string | null;
  readonly contact_email: string | null;
  readonly contact_mobile: string | null;

  readonly billing_address_name: string | null;
  readonly shipping_address_name: string | null;
  /** Present only when the corresponding `*_address_name` is set. */
  readonly billing_address?: OrderAddressDto;
  readonly shipping_address?: OrderAddressDto;

  readonly payment_terms_template: string | null;
  readonly tc_name: string | null;
  readonly terms: string | null;

  readonly items: readonly OrderLineDto[];
  /** ERPNext tax child rows. Empty on the bench; not rendered as a breakdown. */
  readonly taxes: readonly unknown[];
  readonly payment_logs: readonly OrderPaymentLogDto[];
}
