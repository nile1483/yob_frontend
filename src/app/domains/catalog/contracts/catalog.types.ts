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
 * A row of `get_category.items`.
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
export interface CategoryPayloadDto {
  readonly category: CategoryDetailDto;
  readonly subcategories: readonly SubcategoryDto[];
  readonly items: readonly CatalogItemDto[];
}

/** `meta` for `get_category`. */
export interface CategoryMetaDto {
  readonly subcategory_count: number;
  readonly item_count: number;
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
