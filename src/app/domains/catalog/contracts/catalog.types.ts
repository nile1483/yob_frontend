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
}

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

  readonly base_price: number;
  readonly rate: number;
  readonly discount_percentage: number;
  readonly discount_amount: number;

  readonly net_amount: number;
  readonly tax_amount: number;
  readonly tax_label: string | null;
  readonly total_amount: number;

  /** The UOM the shown price is for. May differ from {@link stock_uom}. */
  readonly uom: string;
  /** The item's stock-keeping UOM, which is what `actual_qty` is counted in. */
  readonly stock_uom: string;

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
