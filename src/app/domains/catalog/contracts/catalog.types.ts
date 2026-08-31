import { NO_FILTERS, type StorefrontFilterSelection } from '../storefront-filters';

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
   *
   * **`null` on a family card** (API 3.3.0 `ListingCard.uom`): a template is not priced,
   * so there is no unit a price could be per.
   */
  readonly uom: string | null;

  /**
   * How many {@link stock_uom} make one {@link uom}, as ERPNext derived it.
   *
   * Metadata, and **never an input to a calculation here**. Angular does not multiply a
   * price, a quantity or a stock figure by it: every number the buyer sees is already
   * expressed in the unit it is labelled with, by the backend that owns the conversion.
   * `null` on a family, which has no single conversion.
   */
  readonly conversion_factor: number | null;

  /** The stock-keeping UOM. Stock figures are counted in this, prices are not. */
  readonly stock_uom: string;
  readonly image: string | null;

  /**
   * The money on this row - **every field is `null` when {@link price_state} is
   * `select_options`**.
   *
   * Not zero: ERPNext cannot price a template, and quoting one variant's rate would show
   * a number no buyer is charged. `null` is the backend saying there is no answer yet,
   * and a family card renders none of it. API 3.3.0 types all of these nullable for
   * exactly that reason.
   */
  readonly base_price: number | null;
  readonly rate: number | null;
  readonly discount_percentage: number | null;
  readonly discount_amount: number | null;

  readonly net_amount: number | null;
  readonly tax_amount: number | null;
  readonly total_amount: number | null;

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

/**
 * One value a merchandising filter offers, from `get_category_filters`.
 *
 * `key` is the stable machine key sent back in `storefront_filters`; `label` is what the
 * buyer reads. **There are no counts** - the contract is explicit that a truthful count
 * would need the whole eligibility pipeline run per value, so none is published and none
 * may be invented.
 */
export interface StorefrontFilterValueDto {
  readonly key: string;
  readonly label: string;
}

/**
 * One merchandising filter for a category page (API 3.4.0 `StorefrontFilter`).
 *
 * The projection of that category's **own** Filter Set - never a parent's, and never the
 * admin-side Item Filter Set, which decides what a merchant may tag an item with and is
 * no business of the storefront. Order is the merchant's: do not sort filters or values.
 */
export interface StorefrontFilterDto {
  readonly key: string;
  readonly label: string;
  readonly values: readonly StorefrontFilterValueDto[];
}

/** The `data` payload of `get_category_filters`. `filters: []` means render no facet UI. */
export interface CategoryFiltersDto {
  readonly filters: readonly StorefrontFilterDto[];
}

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
  /**
   * The category slug to browse, or `null` for the whole catalogue.
   *
   * `null` is the Phase 28A quick-browse scope: `scope_value` is omitted from the
   * request and the backend lists every eligible product instead of one category's. Only
   * the SCOPE differs - same eligibility, same pricing, same sort, same cursor, same
   * response shape - so a product cannot be public catalogue-wide and invisible on its
   * own category page.
   *
   * `scopeType` stays `'category'` either way: the contract leaves it unaffected, and
   * `all`/`collection` remain reserved words that answer `unsupported_scope`.
   */
  readonly scopeValue: string | null;
  /**
   * The buyer's submitted search, or `''`.
   *
   * Matched by the backend against the product NAME or its ITEM CODE, AND across words.
   * Angular sends the string and matches nothing itself.
   */
  readonly search: string;
  /** Always empty today - the backend rejects anything else. */
  readonly filters: readonly ItemListingFilter[];
  readonly sort: ItemListingSort;
  readonly pageSize: number;
  /** `null` for the first page; the previous page's `next_cursor` thereafter. */
  readonly cursor: string | null;
  /**
   * The buyer's merchandising selection, sent as the `storefront_filters` parameter.
   *
   * Distinct from {@link ItemListingQuery.filters} above, which is a different and still
   * unsupported parameter: this one is the Phase 25C facet selection, and the backend
   * accepts it today. **It is part of the cursor's fingerprint** - a cursor issued under
   * one selection is refused under another - so changing it restarts at page one.
   */
  readonly storefrontFilters: StorefrontFilterSelection;
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

/**
 * A fresh first-page query for the `/products` quick browse.
 *
 * Everything the category form takes plus a search, and with the category made optional.
 * Kept beside {@link categoryListingQuery} rather than replacing it: one page browses a
 * category and one browses the catalogue, and a single function with four optional
 * arguments would make each caller's intent harder to read than it is now.
 *
 * ## Merchandising filters need a category
 *
 * A facet list is a property of a category, so the backend answers
 * `storefront_filter_context_required` for a selection sent with no `scope_value`. This
 * refuses to build that request at all: with no category the selection is dropped rather
 * than sent and rejected.
 */
export function browseListingQuery(
  categorySlug: string | null,
  sort: ItemListingSort = 'name_asc',
  search = '',
  storefrontFilters: StorefrontFilterSelection = NO_FILTERS,
): ItemListingQuery {
  return {
    scopeType: 'category',
    scopeValue: categorySlug,
    search: search.trim(),
    filters: [],
    sort,
    pageSize: ITEM_PAGE_SIZE,
    cursor: null,
    storefrontFilters: categorySlug === null ? NO_FILTERS : storefrontFilters,
  };
}

/** A fresh first-page query for a category. */
export function categoryListingQuery(
  slug: string,
  sort: ItemListingSort = 'name_asc',
  storefrontFilters: StorefrontFilterSelection = NO_FILTERS,
): ItemListingQuery {
  return {
    scopeType: 'category',
    scopeValue: slug,
    search: '',
    filters: [],
    sort,
    pageSize: ITEM_PAGE_SIZE,
    cursor: null,
    storefrontFilters,
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
 * Storefront quantity-input guidance from the resolved Item Price (API 3.12.0).
 *
 * ## Guidance, and never enforcement
 *
 * The contract could not be plainer: these are **never enforced by the backend**. Cart,
 * checkout and Sales Order accept exactly the quantities they accepted before the fields
 * existed. So this shapes the input control and nothing else - it is not a validation
 * rule, it is not a promise about what the server will refuse, and no message may tell a
 * buyer that a quantity would be rejected.
 *
 * ## The step counts from the start, not from zero
 *
 * `moq: 10` with `quantity_multiplier: 6` offers 10, 16, 22 - **not** multiples of six,
 * and **not** a divisible-by-six rule. The multiplier is a step measured from the
 * starting quantity, and it is unrelated to UOM, conversion factor and pack size.
 *
 * ## The two are a pair, governed by one flag
 *
 * {@link allowed} is `false` when the authoritative pricing preview applied a Pricing
 * Rule: a rule may change behaviour at a quantity threshold, so stepping is no longer a
 * promise the storefront can keep. When it is `false`, **both** values are ignored - not
 * one of them - and the ordinary quantity input returns. It does not mean the product
 * cannot be bought.
 *
 * It also describes the **current preview quantity only**. Nothing here may be used to
 * predict whether a rule would activate at some other quantity: that would need a
 * pricing call per step, which is exactly the loop this page has always refused.
 */
export interface QuantityControlDto {
  /** Starting/minimum quantity, or `null`. Blank, `0` and negative all arrive as `null`. */
  readonly moq: number | null;
  /** Step counted FROM the start, or `null`. See the note above about what it is not. */
  readonly quantity_multiplier: number | null;
  /** Whether the client may apply the two values above. */
  readonly allowed: boolean;
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
  /** `null` is possible per API 3.3.0 - an item need not have a public slug. */
  readonly custom_slug: string | null;
  readonly qty: number;

  /**
   * Always `0` here - this shape is a **salable** item (API 3.3.0 pins the enum).
   *
   * The discriminant of {@link ItemPayloadDto}: `get_item` answers either this or an
   * {@link ItemFamilyDto}, and the two are genuinely different payloads rather than one
   * shape with optional halves. Narrow with {@link isItemFamily} before reading either.
   *
   * Optional only so that a payload captured before Phase 24B still satisfies the type;
   * the guard treats anything that is not `1` as a salable item, which is the safe way
   * round - a family missing its flag would render as a product with no price.
   */
  readonly is_template?: 0;

  /** Always `1` here: the contract only calls this shape a product when it can be sold. */
  readonly is_purchasable?: 1;

  /**
   * The template this item is a variant of, or `null`.
   *
   * Informational. It is **never** used to construct, guess or validate an item code:
   * the resolver owns variant identity, and this is the backend telling us where a
   * resolved SKU came from.
   */
  readonly variant_of?: string | null;

  /**
   * The attribute values the resolver matched, or `null` for a plain item.
   *
   * Read from the variant's **stored** rows, so the contract says it is safe to trust
   * over what was sent. Display only: the authority for what was bought is {@link name},
   * the SKU the backend chose.
   */
  readonly selected?: Readonly<Record<string, string>> | null;

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

  /**
   * Maximum Retail Price from the resolved Item Price, or `null` (API 3.12.0).
   *
   * **Informational display only.** It is not a base price, a rate, a discount or a
   * total; no monetary field is derived from it, and neither side computes a saving or a
   * percentage against it. The contract is explicit that it is *not* validated against
   * the selling rate and may legitimately be lower - so a storefront that rendered
   * "you save X" would sometimes be quoting a negative number as a discount.
   *
   * `null` when not configured; blank, zero and negative all normalise to `null` at the
   * backend. Published independently of {@link QuantityControlDto.allowed}, because it
   * has no quantity behaviour and therefore no conflict with a Pricing Rule.
   */
  readonly mrp: number | null;

  /** Quantity-input guidance for this resolved item. See {@link QuantityControlDto}. */
  readonly quantity_control: QuantityControlDto;
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
export interface ItemFamilyDto extends ProductMerchandisingDto {
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
   * `0` for every family - API 3.3.0 pins the enum. The buyer buys a variant, and
   * `add_to_cart` refuses a template outright with `item_is_template`.
   */
  readonly is_purchasable: number;

  /**
   * The template this family is itself a variant of. `null` in practice.
   *
   * Required by API 3.3.0 `VariantFamily`, so it is typed; nothing reads it.
   */
  readonly variant_of?: string | null;

  /** The attributes to choose, in backend order. */
  readonly attributes: readonly ItemAttributeDto[];

  /** The combinations that actually exist. See {@link ItemVariantDto}. */
  readonly variants: readonly ItemVariantDto[];
}

/* ------------------------------------------------- product merchandising (27B) */

/**
 * One row of the product gallery (API 3.9.1 `ProductGalleryImage`).
 *
 * ## Array order is the order
 *
 * There is no `sort_order` and no `idx` on this contract, deliberately: the merchant's
 * arrangement *is* the array. Nothing here sorts a gallery, and {@link is_primary} is not
 * an ordering key - see below.
 *
 * ## Primacy and position are independent
 *
 * `is_primary` marks which image the page **opens on**. It does not move that image to
 * the front. A gallery ordered Side / Front / Back with Front primary shows thumbnails in
 * that same order and opens on the second one; promoting it would silently rewrite a
 * merchandising decision.
 *
 * `image` is a stored path (`/files/...`), resolved by the one media helper like every
 * other image in the storefront.
 */
export interface ProductGalleryImageDto {
  readonly image: string;
  /** Nullable on the wire. Blank falls back to the product's name, never to a code. */
  readonly alt_text: string | null;
  /** Nullable on the wire. Blank renders no caption row at all. */
  readonly caption: string | null;
  readonly is_primary: boolean;
}

/**
 * One product-content block (API 3.9.1 `ProductContentBlock`), discriminated on `type`.
 *
 * ## Data only in Phase 27C
 *
 * Typed because the page response genuinely carries it and an untyped `sections` would be
 * a lie about what arrives. **Nothing renders it yet** - the renderer is Phase 27D. It is
 * described here exactly as published so that phase inherits a contract rather than
 * re-deriving one.
 *
 * ## Not the Phase 25 CMS `ContentBlockDto`
 *
 * A separate union for a separate job. `rich_text` and `image` exist in both with
 * **different shapes** - the CMS block carries `title`/`html` plus the placement's
 * `section_style`/`content_width`, this one carries `content` and no presentation at all,
 * because Angular owns product-page layout outright. Merging them would make one renderer
 * serve a page builder and a product page. The backend split them on purpose; so does this.
 */
export type ProductContentBlockDto =
  | ProductRichTextBlockDto
  | ProductKeyValueBlockDto
  | ProductTableBlockDto
  | ProductImageBlockDto
  | ProductDownloadBlockDto
  | ProductVideoBlockDto;

/** Merchant prose (API 3.9.1 `ProductRichTextBlock`). Sanitised HTML, never trusted. */
export interface ProductRichTextBlockDto {
  readonly type: 'rich_text';
  readonly content: string;
}

/** A specification list (API 3.9.1 `ProductKeyValueBlock`), in the merchant's order. */
export interface ProductKeyValueBlockDto {
  readonly type: 'key_value';
  readonly items: readonly ProductSpecEntryDto[];
}

/**
 * A table (API 3.9.1 `ProductTableBlock`).
 *
 * The contract guarantees every row carries exactly `columns.length` cells, padded with
 * `""`, so no width reconciliation is needed here - and a merchant who narrows a table
 * keeps the wider data in the database while the runtime only ever sends the current
 * width. Renderers still index defensively rather than relying on it.
 */
export interface ProductTableBlockDto {
  readonly type: 'table';
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/**
 * A content image (API 3.9.1 `ProductImageBlock`): a diagram, a drawing, a step.
 *
 * **Not gallery imagery.** A blank `alt_text` is not filled in from the product's name
 * here - naming a torque chart after the product would be actively misleading - so it
 * becomes `alt=""` instead.
 */
export interface ProductImageBlockDto {
  readonly type: 'image';
  readonly image: string;
  readonly alt_text: string | null;
  readonly caption: string | null;
}

/** A document link (API 3.9.1 `ProductDownloadBlock`). `file` is a stored Frappe URL. */
export interface ProductDownloadBlockDto {
  readonly type: 'download';
  readonly file: string;
  readonly label: string | null;
  readonly description: string | null;
}

/**
 * A video (API 3.9.1 `ProductVideoBlock`).
 *
 * An http(s) **URL only** - the contract is explicit that it is never embed markup. How
 * it is presented is entirely the frontend's decision; see `product-video-url.ts`.
 */
export interface ProductVideoBlockDto {
  readonly type: 'video';
  readonly url: string;
}

/** One row of a `key_value` block (API 3.9.1 `ProductSpecEntry`). */
export interface ProductSpecEntryDto {
  readonly key: string;
  readonly value: string;
}

/**
 * A product-content block whose `type` this release does not know.
 *
 * The same admission the CMS union makes, for the same reason: a backend that adds a
 * seventh block type must not take a product page down. It is typed as a bare `type` so
 * nothing can read fields off it without narrowing first.
 */
export interface UnknownProductContentBlockDto {
  readonly type: string;
}

/** What `blocks` actually contains once an unknown type is admitted as possible. */
export type AnyProductContentBlockDto =
  | ProductContentBlockDto
  | UnknownProductContentBlockDto;

/** The six product-content types this release can draw. */
const RENDERABLE_PRODUCT_CONTENT_TYPES = new Set<ProductContentBlockDto['type']>([
  'rich_text',
  'key_value',
  'table',
  'image',
  'download',
  'video',
]);

/**
 * Whether this release can draw a product-content block.
 *
 * **Deliberately not `isRenderableBlock`.** That one guards the Phase 25 CMS union, whose
 * five types are a different set entirely - it would admit the CMS's carousel and promo
 * types and reject `table`. Two unions that overlap on two names still need two guards,
 * and sharing one would be the coupling the whole split exists to prevent.
 */
export function isRenderableProductContentBlock(
  block: AnyProductContentBlockDto,
): block is ProductContentBlockDto {
  return RENDERABLE_PRODUCT_CONTENT_TYPES.has(block.type as ProductContentBlockDto['type']);
}

/**
 * One merchant-authored section of product content (API 3.9.1 `ProductContentSection`).
 *
 * The section's `title` is the merchant's **grouping** and is independent of what the
 * blocks inside it are: "Specifications" may hold a table and a paragraph, and
 * "Description" may hold prose and an image. Section semantics and block type are
 * deliberately not the same axis.
 *
 * Ordered by the backend, sections and blocks alike. Data only until Phase 27D.
 */
export interface ProductContentSectionDto {
  readonly title: string;
  readonly blocks: readonly AnyProductContentBlockDto[];
}

/**
 * What a product **page** carries beyond the product itself (API 3.9.1
 * `ProductMerchandising`).
 *
 * ## Who owns it
 *
 * The public storefront entity: a simple Item, or the **template** of a variant family.
 * A generated variant child owns neither array, which is why this is a separate interface
 * composed into the two page payloads rather than fields on {@link ItemDetailDto}.
 *
 * That mirrors the backend's own 3.9.1 correction exactly. 3.9.0 put these two arrays on
 * the shared serializer, which is also what `resolve_variant` answers with - so the
 * document promised merchandising back from a variant selection that never sends it.
 * Keeping the split here is what stops the same mistake being made in Angular: there is
 * no type on which a resolved SKU could carry a gallery.
 *
 * Both arrays are always present and may be empty. Empty is the ordinary case, not an
 * error, and never a reason to hide the product.
 */
export interface ProductMerchandisingDto {
  readonly gallery: readonly ProductGalleryImageDto[];
  readonly sections: readonly ProductContentSectionDto[];
}

/**
 * The `data` payload of `get_item` for a simple product (API 3.9.1 `ProductPageDetail`).
 *
 * `ProductDetail` plus `ProductMerchandising`, composed the same way the contract composes
 * them. {@link ItemDetailDto} stays exactly what it was - the money-and-identity
 * serializer that `resolve_variant` returns - and gains nothing from this file.
 */
export interface ProductPageDetailDto extends ItemDetailDto, ProductMerchandisingDto {}

/**
 * What `get_item` can answer: one salable product page, or a family to choose from.
 *
 * Narrow it with {@link isItemFamily} - never by looking for a missing price.
 *
 * Both members carry merchandising, because both are public product pages. The resolver's
 * {@link ItemDetailDto} is deliberately **not** a member: it is what comes back from
 * `resolve_variant`, and it has no gallery to render.
 */
export type ItemPayloadDto = ProductPageDetailDto | ItemFamilyDto;

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

/* ------------------------------------------------------- product suggestions */

/**
 * One product in the header typeahead (API 3.8.0 `ProductSuggestion`).
 *
 * **Navigation only, and deliberately not a small `ListingCard`.** There is no rate,
 * discount, tax, UOM, conversion factor, stock, warehouse or pricing rule here, and the
 * contract says there will not be: the product page is authoritative once the buyer
 * clicks, and a price in a dropdown is a second place for money to be wrong.
 *
 * Every suggestion has a public `slug`, because a product without a public URL is never
 * suggested. `is_template` marks a variant **family**, which opens an options page rather
 * than a directly buyable product; generated variants never arrive on their own.
 */
export interface ProductSuggestionDto {
  readonly item_code: string;
  readonly item_name: string;
  readonly slug: string;
  /** Relative path as stored (`/files/...`), the same convention `ListingCard` uses. */
  readonly image: string | null;
  readonly is_template: boolean;
}

/**
 * The `data` payload of `get_product_suggestions`.
 *
 * At most 8 rows, no pagination, no cursor, no facets and no category scope. Fewer than
 * three characters answers an empty list rather than an error - a buyer mid-word has done
 * nothing wrong.
 */
export interface ProductSuggestionsDto {
  readonly items: readonly ProductSuggestionDto[];
}

/**
 * The shortest search the backend will answer.
 *
 * The server enforces this rather than trusting the client; the client applies it too, so
 * a buyer typing `bo` costs nothing. One constant, so the two cannot drift.
 */
export const PRODUCT_SUGGESTION_MIN_CHARS = 3;

/* ------------------------------------------------------- browse categories (28A) */

/**
 * One chip on the `/products` quick browse (API 3.10.0 `BrowseCategory`).
 *
 * ## Every row is a valid listing target
 *
 * That is the contract's own promise: a category published here will not answer
 * `category_not_listable` when a buyer clicks it. The backend has already dropped the
 * three kinds that cannot be listed - disabled, no public slug, and group categories.
 *
 * ## Flat, at every depth, and not a tree
 *
 * Rows arrive at any depth of the taxonomy, and {@link parent_category} may name a
 * category that is **not in this list** - a group ancestor, say, which is never itself
 * listable. So nothing here reconstructs a hierarchy: {@link level} and
 * {@link parent_category} are metadata, and the chips are flat selectable controls.
 *
 * Selecting a chip means exactly that category's own listing. There is no descendant
 * aggregation, because `get_items` has none.
 */
export interface BrowseCategoryDto {
  /** Docname. Identity for tracking; never used for navigation. */
  readonly name: string;
  /** The chip's label. */
  readonly category_name: string;
  /** The public identity, passed back as `get_items?scope_value=`. */
  readonly slug: string;
  /** Parent DOCNAME, `null` for a root. May name a category absent from this list. */
  readonly parent_category: string | null;
  readonly display_order: number | null;
  /** Depth over the full taxonomy, `0` for a root - groups and disabled ancestors included. */
  readonly level: number;
}

/**
 * The `data` payload of `get_browse_categories`.
 *
 * Metadata only: no items, no prices, no stock. **There is no synthetic `All` row** -
 * the backend does not publish one, and the storefront adds it client-side because "no
 * category" is the absence of a scope rather than a category the merchant configured.
 */
export interface BrowseCategoriesDto {
  readonly categories: readonly BrowseCategoryDto[];
}
