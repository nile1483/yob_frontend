/**
 * Public payment contracts.
 *
 * Reference 2.0.0 (`payment.*`), verification level **`test`** - the real endpoints
 * executed in-process against seeded data inside a rolled-back savepoint with a
 * deterministic Razorpay fake. Real envelopes from the real implementation, but no HTTP
 * round trip and no live provider. Nothing here is inferred beyond those captures.
 *
 * ## The one idea that shapes this whole file
 *
 * A Payment Request is backed by a **Cart** before payment is initiated and by a
 * **Sales Order** afterwards, and `/payment/:token` keeps working across that
 * transition. So the same URL, reloaded, can return a different shape than it did a
 * minute ago - and that is normal operation, not an error.
 *
 * The two shapes are therefore a discriminated union on `source_doctype`, not one
 * flattened "payment-ish" object. Flattening would mean inventing a Cart for orders
 * that no longer have one, and the Sales Order shape genuinely differs: `items[]` is
 * flat, and `billing_address`/`shipping_address` are **name strings** rather than
 * objects.
 */

/** A payment method the server considers eligible for this obligation. */
export interface PaymentMethodDto {
  /**
   * The Payment Method record name, e.g. `"Razorpay"`, `"Pay Later"`.
   *
   * **This is what `process_payment` takes.** Not `method_code`. See
   * `PaymentApi.processPayment`.
   */
  readonly name: string;
  /**
   * A stable machine code, e.g. `"razorpay"`, `"paylater"`.
   *
   * Used only to decide which browser integration runs *after* `process_payment`
   * replies. Never sent.
   */
  readonly method_code: string;
  /** `"Online"` / `"Offline"`. Descriptive; eligibility is never derived from it. */
  readonly payment_type: string;
  /** Server-chosen ordering. The list is rendered in this order. */
  readonly display_order: number;
  readonly icon: string | null;
  readonly description: string | null;
}

/** A resolved address block, as the Cart-backed shape returns it. */
export interface PaymentAddressDto {
  readonly name: string;
  /** Backend-rendered **HTML**, and it can embed a GSTIN. Never bound as markup. */
  readonly display: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly country: string | null;
  readonly pincode: string | null;
}

/** The resolved contact block, Cart-backed shape only. */
export interface PaymentContactDto {
  readonly name: string;
  readonly full_name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
}

/** One cart line inside the Cart-backed shape. */
export interface PaymentCartLineDto {
  readonly item_code: string;
  /** Verified as `null` in the capture - the cart child row does not carry it. */
  readonly item_name: string | null;
  readonly quantity: number;
  readonly rate: number;
  readonly amount: number;
  readonly uom: string | null;
  readonly total_amount: number;
  readonly tax_amount: number;
  readonly discount_amount: number;
  readonly pricing_rule_label: string | null;
}

/** The cart document inside the Cart-backed shape. */
export interface PaymentCartDto {
  readonly name: string;
  readonly customer: string;
  readonly company: string;
  readonly currency: string;
  readonly status: string;
  readonly total_quantity: number;
  readonly net_total: number;
  readonly tax_total: number;
  readonly grand_total: number;
  readonly total_discount: number;
  readonly items: readonly PaymentCartLineDto[];
}

/** One order line inside the Sales-Order-backed shape. Flat, and shorter than a cart line. */
export interface PaymentOrderLineDto {
  readonly item_code: string;
  /** Present here, unlike the cart line - the order row carries the resolved name. */
  readonly item_name: string | null;
  readonly quantity: number;
  readonly rate: number;
  readonly amount: number;
  readonly uom: string | null;
}

/** Fields both shapes share. Everything authoritative about the money lives here. */
interface PaymentCheckoutCommon {
  /**
   * The amount owed, in **normal business units** (135.0 = INR 135.00).
   *
   * From the immutable Payment Request, never recomputed from the lines. Note this is
   * *not* the same scale as the Razorpay `amount` in `process_payment`'s reply, which
   * is in provider units.
   */
  readonly amount: number;
  readonly currency: string;
  readonly payment_request: string;
  readonly source_name: string;
  /** Server-eligible methods only. Rendered exactly as given; never filtered here. */
  readonly payment_methods: readonly PaymentMethodDto[];
}

/** Before payment is initiated: the obligation still points at the cart. */
export interface CartBackedCheckoutDto extends PaymentCheckoutCommon {
  readonly source_doctype: 'Cart';
  readonly cart: PaymentCartDto;
  readonly contact: PaymentContactDto | null;
  readonly billing_address: PaymentAddressDto | null;
  readonly shipping_address: PaymentAddressDto | null;
  readonly cart_updated: boolean;
  readonly removed_items: readonly string[];
  readonly price_updated_items: readonly string[];
}

/**
 * After `process_payment` committed the order.
 *
 * Note what is *not* here: no `cart`, no `contact` object, and the addresses are bare
 * record names. The cart is no longer payment truth, so the server stops reporting it -
 * and the page must render what it is actually given rather than fetching extra data to
 * make the two views look alike.
 */
export interface SalesOrderBackedCheckoutDto extends PaymentCheckoutCommon {
  readonly source_doctype: 'Sales Order';
  readonly customer: string;
  readonly company: string;
  readonly items: readonly PaymentOrderLineDto[];
  /** A record **name string**, not an object. */
  readonly billing_address: string | null;
  readonly shipping_address: string | null;
  readonly contact_person: string | null;
  readonly order_status: string;
  /** Frappe submit state: 0 draft, 1 submitted, 2 cancelled. */
  readonly docstatus: number;
}

/** What `get_checkout_data` returns. Branch on `source_doctype`. */
export type PaymentCheckoutDto = CartBackedCheckoutDto | SalesOrderBackedCheckoutDto;

/** Narrowing helper, so pages never compare the literal in more than one place. */
export function isCartBacked(data: PaymentCheckoutDto): data is CartBackedCheckoutDto {
  return data.source_doctype === 'Cart';
}

/**
 * `process_payment`'s reply for an offline method such as Pay Later.
 *
 * `amount` is the **normal business amount** here - unlike the Razorpay reply. And
 * `payment_status` is `"Unpaid"`: an order exists, no money has moved.
 */
export interface PayLaterResultDto {
  readonly payment_method: string;
  readonly sales_order: string;
  readonly payment_request: string;
  readonly amount: number;
  readonly currency: string;
  readonly payment_status: string;
}

/**
 * `process_payment`'s reply for Razorpay.
 *
 * `amount` is in **provider units** - paise, so `13500` means INR 135.00. It is handed
 * to the Razorpay widget untouched. Multiplying or dividing it here would be a
 * hundred-fold payment error in whichever direction.
 *
 * `razorpay_key` is the publishable key. There is no secret, and the browser must never
 * expect one.
 */
export interface RazorpayOrderDto {
  readonly payment_method: string;
  readonly razorpay_key: string;
  readonly order_id: string;
  readonly amount: number;
  readonly currency: string;
  readonly sales_order: string;
  readonly payment_request: string;
}

/** Either outcome of `process_payment`. Discriminated by `payment_method`'s code. */
export type ProcessPaymentDto = PayLaterResultDto | RazorpayOrderDto;

/** True when the reply carries the provider handoff rather than an offline result. */
export function isRazorpayOrder(data: ProcessPaymentDto): data is RazorpayOrderDto {
  return typeof (data as RazorpayOrderDto).order_id === 'string';
}

/** What `verify_payment` returns once the server has validated the signature. */
export interface VerifyPaymentDto {
  readonly sales_order: string;
  readonly payment_request: string;
  readonly payment_id: string;
}

/** The three fields Razorpay hands back, and the entire body `verify_payment` takes. */
export interface RazorpayVerificationRequest {
  readonly razorpay_order_id: string;
  readonly razorpay_payment_id: string;
  readonly razorpay_signature: string;
}
