/**
 * Buyer order contracts.
 *
 * Source-verified from `yob_storefront/api/order.py` and wire-verified against the
 * development bench's three real Sales Orders - two of which were paid by real
 * Razorpay Test Mode transactions. Re-verified 2026-08-14 after backend Phase 14.5.
 *
 * The packaged handoff (`docs/api-handoff/`) covers these endpoints only in the
 * authorization matrix and error tables, carries no response shapes for them, and
 * predates Phase 14.5. The running backend is therefore the authority here, and these
 * types were confirmed against it on the wire.
 */

/**
 * One row of the order list.
 *
 * Exactly the six fields `get_orders` selects. Note what is still **not** here: no
 * payment information and no item count. The list cannot show what the endpoint does
 * not return.
 */
export interface OrderSummaryDto {
  /** The Sales Order name, e.g. `SAL-ORD-2026-00001`. Identifier *and* what a buyer quotes. */
  readonly name: string;
  /** ERPNext Sales Order status. Internal vocabulary - never rendered raw. */
  readonly status: string;
  readonly grand_total: number;
  /**
   * The order's own stored currency.
   *
   * Added by backend Phase 14.5. Before that the list returned a bare number and the
   * frontend fell back to the environment default; that fallback is gone, because
   * guessing a currency on a financial record is the kind of wrong that looks right.
   */
  readonly currency: string;
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

  /**
   * Address record references. Identifiers only.
   *
   * Never rendered as a postal address and never used to fetch current master data -
   * doing either would reintroduce the bug Phase 14.5 fixed.
   */
  readonly billing_address_name: string | null;
  readonly shipping_address_name: string | null;

  /**
   * The address **as it was when the order was placed**.
   *
   * Backend Phase 14.5 replaced the old structured objects, which were resolved live
   * from the Address master, so editing an address silently rewrote every past order.
   * These come from the Sales Order's own immutable snapshot instead.
   *
   * **Plain text with real newlines - not HTML.** The backend converts the stored
   * snapshot before sending it, so the frontend renders it as text with preserved line
   * breaks and never needs `[innerHTML]`. Wire-verified 2026-08-14.
   *
   * `null` when the order has no snapshot and no resolvable legacy address.
   */
  readonly billing_address_display: string | null;
  readonly shipping_address_display: string | null;

  readonly payment_terms_template: string | null;
  readonly tc_name: string | null;
  readonly terms: string | null;

  readonly items: readonly OrderLineDto[];
  /** ERPNext tax child rows. Empty on the bench; not rendered as a breakdown. */
  readonly taxes: readonly unknown[];
  readonly payment_logs: readonly OrderPaymentLogDto[];
}
