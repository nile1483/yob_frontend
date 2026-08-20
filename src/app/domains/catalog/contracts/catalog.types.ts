/**
 * Catalog API contracts.
 *
 * DTOs keep the backend's own field names, snake_case included, because they describe
 * the wire. Frappe's `message` wrapper is already gone by the time these are used -
 * `YobApiClient` removes it - so nothing transport-shaped appears here.
 *
 * Shapes come from `reference/api/live/verified-responses.json`. `get_categories` is
 * wire-verified (as an empty list); the populated shapes are source-verified from
 * `yob_storefront/api/catalog.py`. Fields not proven by one of those two are absent -
 * none are invented.
 */

/**
 * A row from `get_categories`.
 *
 * Note this is **not** the same shape as a subcategory returned inside
 * `get_category`: this one carries `banner`, `meta_*` and `parent_category`, and has
 * no `is_group`. They are typed separately rather than merged into an optimistic
 * union, because pretending a field exists is how a template ends up rendering
 * `undefined`.
 */
export interface CategoryListItemDto {
  readonly name: string;
  readonly category_name: string;
  readonly slug: string;
  /** Raw stored path, not an absolute URL - see the media note below. */
  readonly thumbnail: string | null;
  readonly banner: string | null;
  readonly display_order: number;
  readonly meta_title: string | null;
  readonly meta_description: string | null;
  readonly parent_category: string | null;
}

/** The `category` block of `get_category`. */
export interface CategoryDetailDto {
  readonly name: string;
  readonly category_name: string;
  readonly slug: string;
  readonly thumbnail: string | null;
  readonly banner: string | null;
  readonly meta_title: string | null;
  readonly meta_description: string | null;
  /** HTML Editor field on the backend, so it may contain markup. Rendered as text. */
  readonly description: string | null;
  /** Frappe check field: 0 or 1, never a JSON boolean. */
  readonly is_group: number;
  readonly parent_category: string | null;
}

/** A row of `get_category.subcategories`. */
export interface SubcategoryDto {
  readonly name: string;
  readonly category_name: string;
  readonly slug: string;
  readonly thumbnail: string | null;
  readonly display_order: number;
  readonly is_group: number;
}

/**
 * A catalog item row, as returned by `get_items` (and, legacily, by
 * `get_category.items`, which the frontend no longer reads).
 *
 * Every price here is computed by the backend for the requested quantity. Angular
 * displays them and compares them; it never derives one from another.
 *
 * There is deliberately **no currency field** - the API does not return one for
 * catalog items. See `CATALOG_CURRENCY_NOTE` in the item card.
 */
export interface CatalogItemDto {
  /** Frappe item code, e.g. `YOB-BOLT-M10`. */
  readonly name: string;
  readonly item_name: string;
  readonly slug: string;

  /**
   * The **selling** UOM the listed price is for. This is what a price label says.
   *
   * Added by backend Phase 23B-5U. Before it existed the card labelled the price with
   * `stock_uom`, which is a different unit whenever ERPNext sells in one and stocks in
   * another - a ₹1000 price for a Box was captioned "per Nos". The buyer never chooses
   * this; ERPNext resolves it.
   */
  readonly uom: string;

  /**
   * How many {@link stock_uom} make one {@link uom}, as ERPNext derived it.
   *
   * Metadata, and **never an input to a calculation here**. Angular does not multiply a
   * price, a quantity or a stock figure by it: every number the buyer sees is already
   * expressed in the unit it is labelled with, by the backend that owns the conversion.
   */
  readonly conversion_factor: number;

  /** The stock-keeping UOM. Stock figures are counted in this, prices are not. */
  readonly stock_uom: string;
  readonly image: string | null;

  readonly base_price: number;
  readonly rate: number;
  readonly discount_percentage: number;
  readonly discount_amount: number;

  readonly net_amount: number;
  readonly tax_amount: number;
  readonly total_amount: number;

  readonly pricing_rule_label: string | null;

  /**
   * Whether this row is a variant **family** rather than one salable item, as `0`/`1`.
   *
   * Backend Phase 24B: a template and its children collapse into a single listing row.
   * The children are no longer listed separately, so a family card is one card.
   */
  readonly has_variants: number;

  /**
   * Whether the money on this row means anything yet.
   *
   * `priced` - an ordinary salable item; the figures are the backend's and are shown.
   * `select_options` - a family. Its children can differ in price, and choosing one for
   * the buyer (cheapest, first, default) would be **inventing** a price the backend did
   * not quote. The card shows no money at all and sends the buyer to the family page.
   */
  readonly price_state: ItemPriceState;
}

/** What a listing row's price means. See {@link CatalogItemDto.price_state}. */
export type ItemPriceState = 'priced' | 'select_options';

/** The `data` payload of `get_category`. */
/**
 * `get_category`, as the frontend consumes it.
 *
 * ## `items` is deliberately absent
 *
 * The backend still returns an embedded `items` array. It is a **response
 * compatibility field**, not a frontend dependency: since Phase 22B-2 the listing comes
 * from `get_items`, which is bounded, sorted and cursor-paginated, while the embedded
 * array is unbounded and cannot express any of that.
 *
 * Leaving it off this interface is the enforcement. A page that tried to read
 * `payload.items` would not compile, so the migration cannot quietly regress. The field
 * is still on the wire and still arrives; nothing here breaks by ignoring it, and
 * removing it from the response is a backend concern for Phase 22B-3.
 */
export interface CategoryPayloadDto {
  readonly category: CategoryDetailDto;
  readonly subcategories: readonly SubcategoryDto[];
}

// ------------------------------------------------------------------ item listing

/** Sort orders `get_items` accepts. Price sorting is deliberately absent - see below. */
export type ItemListingSort = 'name_asc' | 'name_desc' | 'newest';

/**
 * A future listing filter.
 *
 * Typed now so the query model does not need reshaping later, but the backend accepts
 * **only an empty list** today and answers `unsupported_filters` for anything else. No
 * filter state, UI or service exists, and none should until the backend supports one.
 */
export interface ItemListingFilter {
  readonly key: string;
  readonly values: readonly string[];
}

/**
 * Everything that identifies one page of a listing.
 *
 * `scopeType` is a single-member union rather than a plain string: `collection` and
 * `all` are planned, and the backend answers `unsupported_scope` for both today, so the
 * type says exactly what works now while leaving room to widen later.
 */
export interface ItemListingQuery {
  readonly scopeType: 'category';
  readonly scopeValue: string;
  /** Backend search exists; there is no search UI, so this is always `''` today. */
  readonly search: string;
  /** Always empty today - the backend rejects anything else. */
  readonly filters: readonly ItemListingFilter[];
  readonly sort: ItemListingSort;
  readonly pageSize: number;
  /** `null` for the first page; the previous page's `next_cursor` thereafter. */
  readonly cursor: string | null;
}

/**
 * `pagination` from `get_items`.
 *
 * ## `has_more` is the only exhaustion signal
 *
 * The backend scanner has a per-request scan budget, so `items: []` with
 * `has_more: true` is a **valid continuation** - the request ran out of budget, not out
 * of catalogue. Deriving exhaustion from `items.length` or `returned_count` would
 * silently truncate a category. Only `has_more: false` is terminal.
 */
export interface ItemListingPaginationDto {
  readonly returned_count: number;
  readonly page_size: number;
  readonly has_more: boolean;
  readonly next_cursor: string | null;
}

/** The query the backend echoes back, so a response can be matched to its request. */
export interface ItemListingQueryDto {
  readonly scope_type: string;
  readonly scope_value: string;
  readonly search: string;
  readonly sort: string;
}

/** `get_items` payload. Rows are the same `CatalogItemDto` the cards already render. */
export interface ItemListingDto {
  readonly items: readonly CatalogItemDto[];
  readonly pagination: ItemListingPaginationDto;
  readonly query: ItemListingQueryDto;
}

/** The page size the storefront asks for. The backend accepts 1..48. */
export const ITEM_PAGE_SIZE = 24;

/** A fresh first-page query for a category. */
export function categoryListingQuery(
  slug: string,
  sort: ItemListingSort = 'name_asc',
): ItemListingQuery {
  return {
    scopeType: 'category',
    scopeValue: slug,
    search: '',
    filters: [],
    sort,
    pageSize: ITEM_PAGE_SIZE,
    cursor: null,
  };
}

/**
 * `meta` for `get_category`.
 *
 * `item_count` was removed in Phase 23B-2: it counted the legacy embedded array that
 * backend Phase 22B-3 retired, and nothing read it.
 */
export interface CategoryMetaDto {
  readonly subcategory_count: number;
}

/**
 * The nested `pricing` object `get_item` returns.
 *
 * It duplicates most of the top-level pricing fields and adds a few of its own.
 * **Prefer the top-level fields** - they are what the UI reads. This is typed because
 * it is genuinely on the wire and a later phase may want `total_discount` or
 * `selling_price_list`, and because leaving it untyped invites someone to reach for
 * `pricing.rate` and end up displaying a different number from the card next to it.
 */
export interface ItemPricingDto {
  readonly item: {
    readonly name: string;
    readonly item_name: string;
    readonly item_group: string;
    readonly image: string | null;
    readonly stock_uom: string;
  };
  readonly selling_price_list: string;
  readonly qty: number;
  readonly base_price: number;
  readonly rate: number;
  readonly discount_percentage: number;
  readonly discount_amount: number;
  readonly total_discount: number;
  readonly net_amount: number;
  readonly tax_amount: number;
  readonly tax_label: string | null;
  readonly total_amount: number;
  readonly pricing_rules: readonly string[];
  readonly pricing_rule_label: string | null;
  readonly pricing_rule_apply_on: string | null;
  readonly uom: string;
}

/**
 * The `data` payload of `get_item`.
 *
 * **Source-verified only.** Every field comes from `yob_storefront/api/catalog.py`;
 * no successful `get_item` response has ever been observed, because the bench's
 * storefront user lacks Frappe role permission on the `Item` doctype. The two failure
 * paths (404 `item_not_found`, 422 `validation_failed`) *are* wire-verified.
 *
 * Two traps carried over from the source:
 *
 * - the slug field is **`custom_slug`** here, but `slug` in `get_category`'s item rows
 * - the unit field is **`uom`** here, but `stock_uom` in those rows
 *
 * `qty` echoes the requested quantity, defaulting to 1.
 */
export interface ItemDetailDto {
  /** Frappe item code, e.g. `YOB-BOLT-M10`. */
  readonly name: string;
  readonly item_name: string;
  readonly image: string | null;
  readonly item_group: string;
  readonly custom_slug: string;
  readonly qty: number;

  /**
   * Always absent or `0` here - this shape is a **salable** item.
   *
   * The discriminant of {@link ItemPayloadDto}: `get_item` answers either this or an
   * {@link ItemFamilyDto}, and the two are genuinely different payloads rather than one
   * shape with optional halves. Narrow with {@link isItemFamily} before reading either.
   */
  readonly is_template?: 0;

  /**
   * The template this item is a variant of, when it is one.
   *
   * Informational. It is **never** used to construct, guess or validate an item code:
   * the resolver owns variant identity, and this is the backend telling us where a
   * resolved SKU came from.
   */
  readonly variant_of?: string | null;

  /**
   * The attribute values the resolver matched, echoed back.
   *
   * Present on a `resolve_variant` result. Read for display only - the authority for
   * what was bought is {@link name}, the SKU the backend chose.
   */
  readonly selected?: Readonly<Record<string, string>>;

  readonly base_price: number;
  readonly rate: number;
  readonly discount_percentage: number;
  readonly discount_amount: number;

  readonly net_amount: number;
  readonly tax_amount: number;
  readonly tax_label: string | null;
  readonly total_amount: number;

  /**
   * The **selling** UOM the shown price and the buyer's quantity are in.
   *
   * Authoritative and ERPNext-resolved. The storefront has no UOM selector: the buyer
   * enters a quantity, and this says what that quantity is counted in. May differ from
   * {@link stock_uom} - an item sold by the Box and stocked in Nos is ordinary.
   */
  readonly uom: string;
  /** The item's stock-keeping UOM, which is what `actual_qty` is counted in. */
  readonly stock_uom: string;

  /**
   * How many {@link stock_uom} make one {@link uom}, as ERPNext derived it.
   *
   * Typed because the contract supplies it (backend Phase 23B-5U) and it explains the
   * relationship between the two units above. It is **not** used for arithmetic: the
   * browser never converts a price, a quantity or a stock figure between units, and
   * never sends a conversion factor back.
   */
  readonly conversion_factor: number;

  /**
   * The default quantity expressed in {@link stock_uom}, as the backend computed it.
   *
   * The backend's own answer to "what is `qty` in stock units", supplied so nothing here
   * has to multiply {@link qty} by {@link conversion_factor}. Typed, carried, and
   * deliberately not rendered: the page shows the buyer's own unit for what they buy and
   * the stock unit only for {@link actual_qty}, which is already a stock figure.
   */
  readonly stock_qty: number;

  /**
   * Whether ERPNext tracks stock for this item, as `0` or `1`.
   *
   * A service or a non-stock item has no availability to report, and saying
   * "out of stock" about one would be wrong rather than merely unhelpful.
   */
  readonly is_stock_item: number;

  /**
   * The warehouse ERPNext resolved for this customer's transactions, or `null`.
   *
   * Resolved entirely server-side. The browser never chooses or sends a warehouse.
   */
  readonly warehouse: string | null;

  /**
   * Stock on hand in {@link warehouse}, in {@link stock_uom}.
   *
   * ## `null` and `0` are different facts
   *
   * `0` is a real ERPNext quantity: the warehouse is known and it holds none.
   * `null` means the quantity could not be established - no warehouse resolved, or the
   * item is not stock-tracked - and must never be rendered as `0` or "out of stock".
   * Conflating them invents a stock position the system never reported.
   */
  readonly actual_qty: number | null;

  /** Duplicative detail; the UI reads the top-level fields instead. */
  readonly pricing: ItemPricingDto;

  readonly pricing_rule_label: string | null;
  readonly pricing_rule_apply_on: string | null;

  /** Human-readable offer labels, already sorted by the backend. Strings, not objects. */
  readonly available_rules: readonly string[];
}

/**
 * One attribute of a variant family, in the backend's own order.
 *
 * Order is the backend's editorial decision - Colour before Size - and is preserved
 * exactly, both for the attributes and for the values inside each one. Sorting them
 * would quietly re-rank a merchant's choices.
 */
export interface ItemAttributeDto {
  /** The ERPNext Item Attribute name, e.g. `Colour`. Also the control's label. */
  readonly attribute: string;
  /** Frappe check field, `0`/`1`. Typed because the contract sends it. */
  readonly numeric: number;
  readonly values: readonly string[];
}

/**
 * One **actually salable** variant, as the backend enumerated it.
 *
 * ## This list is the whole truth about which combinations exist
 *
 * It is deliberately not a cross-product. If a family offers Orange, Yellow, Medium and
 * Large but only `Orange/Medium` and `Yellow/Large` were ever created, those are the only
 * two rows here - and `Orange/Large` must not become selectable merely because both
 * values appear somewhere in the attribute lists. Every availability decision in the UI
 * is a lookup in this array.
 *
 * `item_code` is present because the backend sent it, and is used for **nothing** but
 * counting distinct rows. Angular never puts it in a cart request: a selection is turned
 * into a purchasable SKU by `resolve_variant`, which is the only authority.
 */
export interface ItemVariantDto {
  readonly item_code: string;
  /** Attribute name to value, e.g. `{ Colour: 'Orange', Size: 'Medium' }`. */
  readonly attributes: Readonly<Record<string, string>>;
}

/**
 * The `data` payload of `get_item` for an ERPNext Item Template.
 *
 * A family is **not** a product with missing prices; it is a different thing. It has no
 * rate, no UOM, no stock and no tax, because none of those exist until a variant is
 * chosen - which is why this is a separate type rather than `ItemDetailDto` with a dozen
 * optional fields. A template that tried to render as a priced item would show a page of
 * blanks and an unlabelled quantity box.
 */
export interface ItemFamilyDto {
  /** The template's item code, e.g. `YOB-VEST`. Never sent to the cart. */
  readonly name: string;
  readonly item_name: string;
  readonly image: string | null;
  readonly item_group: string;
  readonly custom_slug: string;

  /** Always `1` - the discriminant of {@link ItemPayloadDto}. */
  readonly is_template: 1;

  /**
   * Whether the template itself may be bought, as `0`/`1`.
   *
   * `0` for every family: the buyer buys a variant. Typed because the contract sends it
   * and because a future purchasable template would be a real product decision, not
   * something to infer.
   */
  readonly is_purchasable: number;

  /** The attributes to choose, in backend order. */
  readonly attributes: readonly ItemAttributeDto[];

  /** The combinations that actually exist. See {@link ItemVariantDto}. */
  readonly variants: readonly ItemVariantDto[];
}

/**
 * What `get_item` can answer: one salable item, or a family to choose from.
 *
 * Narrow it with {@link isItemFamily} - never by looking for a missing price.
 */
export type ItemPayloadDto = ItemDetailDto | ItemFamilyDto;

/** Whether this payload is a template the buyer must choose a variant from. */
export function isItemFamily(payload: ItemPayloadDto): payload is ItemFamilyDto {
  return payload.is_template === 1;
}

/**
 * The request `resolve_variant` takes.
 *
 * `attributes` is the buyer's complete selection, by attribute name. Angular sends the
 * template code and the chosen values and **nothing else**: no candidate item code, no
 * concatenation of values, no UOM, no warehouse, no price list. What comes back is the
 * SKU the backend chose, fully priced.
 */
export interface ResolveVariantRequest {
  readonly template: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly qty: number;
}

/**
 * Backend refusals from `resolve_variant`, as stable codes.
 *
 * - `variant_attributes_required` - the selection was incomplete. The UI does not send
 *   an incomplete selection, so this means our idea of "complete" disagreed with the
 *   backend's; the safe answer is to say so, not to guess which attribute is missing.
 * - `variant_not_available` - the combination does not exist, or no longer does. Our
 *   matrix can be stale; the resolver cannot be.
 * - `variant_family_unsupported` - the family is not configurable in the storefront
 *   (Manufacturer-based variants, for one). There is no UI for it, by decision.
 */
export const VARIANT_ERROR_CODES = {
  attributesRequired: 'variant_attributes_required',
  notAvailable: 'variant_not_available',
  familyUnsupported: 'variant_family_unsupported',
} as const;

/**
 * What a category card needs, regardless of which endpoint produced it.
 *
 * This is the one place mapping earns its keep in this domain: `get_categories` rows
 * and `get_category.subcategories` rows are different shapes, but both render as the
 * same card. Without it, either the card takes a union and picks fields defensively,
 * or the same card is written twice.
 *
 * Items get no equivalent - `CatalogItemDto` is already exactly what the item card
 * needs, and a model that only renamed its fields would be ceremony.
 */
export interface CategoryLink {
  readonly slug: string;
  readonly title: string;
  readonly thumbnail: string | null;
}

export function toCategoryLink(dto: CategoryListItemDto | SubcategoryDto): CategoryLink {
  return {
    slug: dto.slug,
    title: dto.category_name,
    thumbnail: dto.thumbnail,
  };
}
