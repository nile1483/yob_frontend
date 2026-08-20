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
/**
 * What a projection row *is* to the buyer.
 *
 * `Paid` is the customer's own purchased intent after ERPNext priced it. `Promotion` is a
 * row ERPNext generated - a free gift, a bonus quantity - which the buyer never asked for
 * directly and cannot edit.
 *
 * Read from the backend's explicit `line_role`, **never inferred from `rate === 0`**: a
 * Paid row can legitimately price to zero through a 100% discount, and calling that a
 * promotion would tell the buyer they are getting a gift when they are not.
 */
export type CartLineRole = 'Paid' | 'Promotion';

/**
 * One priced row of the cart, as ERPNext resolved it.
 *
 * ## Why this is not a `CartLineDto`
 *
 * `cart.items` is **persistent customer intent** - what the buyer asked for, and the only
 * thing a mutation may target. `cart.pricing_rows` is a **derived projection** of the
 * final temporary Sales Order: it is what the buyer should *see*, including rows that
 * exist in no cart item at all.
 *
 * They are deliberately different shapes because they answer different questions.
 * Flattening them back together is precisely the bug backend Phase 23B-1 fixed - a
 * same-SKU free row would overwrite the paid row's price.
 *
 * ## Identity
 *
 * `row_id` is the stable projection identity. `item_code` is **not** unique: the same SKU
 * legitimately appears twice, once Paid and once Promotion, and tracking by item code
 * would make one replace the other.
 */
/**
 * One tax ERPNext applied to a priced row.
 *
 * Explanatory detail only. The authoritative row tax is `CartPricingRowDto.tax_amount`,
 * and these are **never summed** to derive it: ERPNext rounds at the document level and
 * may deliberately assign a rounding difference to one component, so the sum can differ
 * from the total by a paisa. Showing a total the buyer cannot reproduce from the
 * breakdown is bad; showing one that disagrees with what they are charged is worse.
 */
export interface CartTaxComponentDto {
  /**
   * The classified tax, such as `CGST`, `SGST` or `IGST` - or `null`.
   *
   * `null` is legitimate, not missing data: a company without GST registration produces
   * real, generic tax rows. Such a component must still be shown, named by {@link label}.
   */
  readonly tax_type: string | null;
  /** The backend's buyer-safe name. Always present, and the fallback when `tax_type` is null. */
  readonly label: string;
  /** Authoritative percentage. Never derived from `amount / taxable_amount`. */
  readonly rate: number;
  readonly amount: number;
  /**
   * What this component was charged on.
   *
   * Per component: two components can have different bases, so there is no single
   * "taxable value" for a row.
   */
  readonly taxable_amount: number;
  /**
   * Whether the rate was already inside the displayed price, as `0` or `1`.
   *
   * A **number**, not a boolean - that is what the wire sends, and typing it as boolean
   * would make `0` truthy after a naive mapping.
   */
  readonly included_in_print_rate: number;
  /** ERPNext's own charge basis, e.g. `On Net Total`. */
  readonly charge_type: string | null;
}

export interface CartPricingRowDto {
  /** Stable projection-row identity. Track by this, never by `item_code`. */
  readonly row_id: string;
  readonly line_role: CartLineRole;
  /** ERPNext's own free-item flag, as `0` or `1`. */
  readonly is_free_item: number;

  readonly item_code: string;
  readonly item_name: string;

  /**
   * The authoritative UOM **for this row**, as ERPNext priced it.
   *
   * Read from the row and nowhere else. It is not the cart item's unit, not the item's
   * `stock_uom`, and not inferred from the rate or the conversion factor - and it is
   * emphatically not the paid row's unit copied onto a promotion row. ERPNext gives a
   * free Product Discount row `Pricing Rule.free_item_uom` or, failing that, the item's
   * `stock_uom`, so a paid `2 Box` legitimately sits beside a promotional `1 Nos`.
   */
  readonly uom: string;
  readonly stock_uom: string;
  /**
   * How many `stock_uom` make one {@link uom}, as ERPNext derived it.
   *
   * Carried because the projection supplies it. Never used for arithmetic here: every
   * figure on the row is already expressed in {@link uom}, by the backend.
   */
  readonly conversion_factor: number;

  readonly qty: number;
  readonly stock_qty: number;

  readonly base_price: number;
  readonly rate: number;
  readonly discount_percentage: number;
  readonly discount_amount: number;
  readonly amount: number;
  readonly net_amount: number;

  /**
   * Tax ERPNext charged on this row, and the row total including it.
   *
   * ## Both are read, never reconstructed
   *
   * `total_amount` is **not** `net_amount + tax_amount`. With an inclusive tax the
   * backend returns `amount 100, net 84.75, tax 15.25, total 100` - adding the tax back
   * would show 115.25 and charge the buyer for the tax twice over. Angular therefore
   * renders both figures exactly as sent and computes neither.
   */
  readonly tax_amount: number;
  readonly total_amount: number;

  /** The breakdown behind `tax_amount`, in the backend's own order. */
  readonly tax_components: readonly CartTaxComponentDto[];

  /**
   * Pricing Rule names that produced this row. Already normalized to a list by the
   * backend - unlike the cart item's own `pricing_rules`, which the backend sends as a
   * JSON **string** and which {@link CartLineDto} therefore does not type at all.
   */
  readonly pricing_rules: readonly string[];

  /**
   * The persistent cart-item row names this priced row came from.
   *
   * Typed because the contract supplies it and future work will need it. It is **not**
   * used for lookup today: `cart.items` rows carry no `name`, so these ids cannot be
   * resolved in the browser. Mutation controls therefore map by `item_code`, which is
   * unambiguous while one intent line exists per SKU. See `docs/PROJECT-STATE.md`.
   */
  readonly source_line_ids: readonly string[];
}

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

  /**
   * The priced projection: what the cart should display.
   *
   * Present alongside `items`, never instead of it. `items` stays the mutation source.
   */
  readonly pricing_rows: readonly CartPricingRowDto[];

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
  /**
   * Item **codes** whose cart line is held in a UOM the item no longer sells in.
   *
   * Added by backend Phase 23B-5U alongside the `cart_item_uom_changed` refusal from
   * `add_to_cart`: the same fact, reported on a read instead of a mutation. The cart is
   * left exactly as it is - the backend does not silently restate a line in a new unit,
   * and neither does the browser - so the line has to be removed and the product added
   * again. Reported to the buyer as a count, like the two arrays above.
   */
  readonly uom_changed_items: readonly string[];
}

/**
 * `add_to_cart` refused because the cart line's UOM is no longer the selling UOM.
 *
 * HTTP **409**, with `details.existing_uom` and `details.current_uom`. A definite
 * refusal: nothing was added, so nothing is retried and no re-read is needed. The
 * recovery is the buyer's - remove the line, add the product again - because adopting a
 * new unit for an existing line would mean deciding what its quantity becomes, and that
 * is a conversion the browser must never perform.
 */
export const CART_ITEM_UOM_CHANGED = 'cart_item_uom_changed';
