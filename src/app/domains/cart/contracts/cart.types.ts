/**
 * Cart API contracts.
 *
 * Independent of Catalog on purpose. Several field names look familiar
 * (`item_code`, `rate`, `total_amount`) but the cart is its own contract with its own
 * shapes - `quantity` not `qty`, `item_slug` not `slug`, absolute image URLs rather
 * than raw stored paths. Reusing `CatalogItemDto` here would couple two domains
 * through a coincidence.
 *
 * `get_cart` is wire-verified. The mutation payloads are source-verified from
 * `yob_storefront/api/cart.py`; see `docs/PROJECT-STATE.md`.
 */

/** One line of the cart. Every number is computed by the backend. */
export interface CartLineDto {
  /** Frappe Item code - the cart's identifier, equal to catalog `name`. */
  readonly item_code: string;
  readonly item_name: string;
  /** Absolute URL: `build_cart_response` runs these through `get_url()`. */
  readonly image: string | null;
  readonly quantity: number;
  readonly base_price: number;
  readonly rate: number;
  readonly amount: number;
  readonly uom: string;
  readonly stock_uom: string;
  readonly discount_percentage: number;
  readonly discount_amount: number;
  readonly tax_amount: number;
  readonly total_amount: number;
  /** Routes back to item detail. Named `item_slug` here, `slug`/`custom_slug` in catalog. */
  readonly item_slug: string | null;
  readonly pricing_rule_label: string | null;
}

/** The cart document. */
export interface CartDocDto {
  readonly name: string;
  readonly customer: string;
  readonly company: string;
  readonly user: string;
  /** Authoritative currency for every amount in this cart. */
  readonly currency: string;
  readonly selling_price_list: string;
  readonly status: string;
  readonly order_type: string;
  readonly is_shippable: number;
  readonly contact_person: string | null;
  readonly billing_address: string | null;
  readonly shipping_address: string | null;
  readonly company_address: string | null;
  readonly sales_order: string | null;
  readonly checkout_by: string | null;
  /** Naive 'YYYY-MM-DD HH:MM:SS.ffffff', no timezone marker. */
  readonly ordered_on: string | null;

  readonly total_quantity: number;
  readonly net_total: number;
  readonly tax_total: number;
  readonly grand_total: number;
  readonly total_discount: number;
  readonly coupon_code: string | null;
  readonly coupon_discount: number;

  readonly items: readonly CartLineDto[];
}

/**
 * The cart's resolved contact block.
 *
 * A *summary* of the selected Contact, not the master record: `build_cart_response`
 * returns four fields where `get_contacts` returns ten. Wire-verified 2026-08-12.
 * Checkout renders the master record it already has in hand and uses this only to know
 * what the server considers selected.
 */
export interface CartContactDto {
  readonly name: string;
  readonly full_name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
}

/**
 * The cart's resolved address block. Wire-verified 2026-08-12.
 *
 * Note `display` carries backend-rendered **HTML** and, on the verified bench, the
 * customer's GSTIN. It is never bound as markup.
 */
export interface CartAddressDto {
  readonly name: string;
  readonly display: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly country: string | null;
  readonly pincode: string | null;
}

/**
 * The `data` payload of `get_cart`.
 *
 * This is the canonical cart shape. The mutation endpoints return the bare cart
 * document instead, without the reconciliation fields below - which is why every
 * mutation is followed by a `get_cart` read.
 */
export interface CartPayloadDto {
  readonly cart: CartDocDto;
  readonly contact: CartContactDto | null;
  readonly billing_address: CartAddressDto | null;
  readonly shipping_address: CartAddressDto | null;

  /** True when the backend changed the cart while loading it. */
  readonly cart_updated: boolean;
  /** Item **codes** dropped because they are no longer purchasable. */
  readonly removed_items: readonly string[];
  /** Item **codes** whose quantity, rate or line total the backend changed. */
  readonly price_updated_items: readonly string[];
}
