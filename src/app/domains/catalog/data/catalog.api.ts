import { Service, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';

import { YobApiClient } from '../../../foundation/network/yob-api-client';
import type {
  BrowseCategoriesDto,
  CategoryListItemDto,
  CategoryFiltersDto,
  CategoryMetaDto,
  ProductSuggestionsDto,
  CategoryPayloadDto,
  ItemDetailDto,
  ItemPayloadDto,
  ResolveVariantRequest,
  ItemListingDto,
  ItemListingQuery,
} from '../contracts/catalog.types';
import { serializeSelection } from '../storefront-filters';

const GET_CATEGORIES = 'yob_storefront.api.catalog.get_categories';
const GET_CATEGORY = 'yob_storefront.api.catalog.get_category';
const GET_ITEM = 'yob_storefront.api.catalog.get_item';
const GET_ITEMS = 'yob_storefront.api.catalog.get_items';
const RESOLVE_VARIANT = 'yob_storefront.api.catalog.resolve_variant';
const GET_CATEGORY_FILTERS = 'yob_storefront.api.catalog.get_category_filters';
const GET_PRODUCT_SUGGESTIONS = 'yob_storefront.api.catalog.get_product_suggestions';
const GET_BROWSE_CATEGORIES = 'yob_storefront.api.catalog.get_browse_categories';

/** `get_category` returns its counts in `meta`; the payload and counts travel together. */
export interface CategoryResult {
  readonly payload: CategoryPayloadDto;
  readonly meta: CategoryMetaDto | undefined;
}

/**
 * Catalog network access.
 *
 * Depends on `YobApiClient` and nothing else. No `HttpClient`, no Frappe envelope
 * handling, no awareness of whether a mock or the real edge answered, and no pricing
 * arithmetic - the backend owns every number that comes back.
 *
 * Small and endpoint-shaped on purpose. This is not a generic repository: each method
 * is one RPC call with the parameters that call actually documents.
 */
@Service()
export class CatalogApi {
  private readonly api = inject(YobApiClient);

  /**
   * Categories, optionally the children of one parent.
   *
   * Omitting `parentSlug` returns top-level categories. An unknown `parentSlug`
   * answers `200` with an empty list rather than `404`, which is why an empty result
   * is an ordinary outcome here and not an error.
   */
  getCategories(parentSlug?: string): Observable<readonly CategoryListItemDto[]> {
    return this.api
      .get<readonly CategoryListItemDto[]>(GET_CATEGORIES, { parent_slug: parentSlug ?? null })
      .pipe(map((response) => response.data));
  }

  /**
   * One category with its subcategories and items.
   *
   * `qty` is left at the backend's default of 1. Item prices are quantity-sensitive,
   * so a catalog listing showing per-unit pricing must not send some other quantity
   * and then display it as if it were the unit price. Quantity-aware repricing belongs
   * to item detail and cart, where the user chooses the quantity.
   *
   * An unknown slug answers `404 category_not_found`, which reaches the caller as a
   * `YobApiError` with that code.
   */
  getCategory(slug: string): Observable<CategoryResult> {
    return this.api.get<CategoryPayloadDto>(GET_CATEGORY, { slug }).pipe(
      map((response) => ({
        payload: response.data,
        meta: response.meta as CategoryMetaDto | undefined,
      })),
    );
  }

  /**
   * One bounded page of a category's items.
   *
   * Replaces the unbounded `get_category().items` array for product listing. The page
   * supplies a whole {@link ItemListingQuery}; this method only serialises it, so there
   * is exactly one place that knows the backend's parameter names.
   *
   * ## Serialisation notes, all wire-verified
   *
   * - `filters` goes as a JSON string. The backend accepts the parameter being omitted
   *   entirely, but sending `[]` explicitly states the intent and is what the contract
   *   documents; anything non-empty answers `unsupported_filters` today.
   * - `cursor` is sent **only** for a continuation. `YobApiClient` drops `null` params,
   *   so a first page simply carries no cursor rather than `cursor=null`.
   * - `qty` stays at 1, for the same reason `get_category` does: listing prices are
   *   per-unit, and requesting another quantity would show that quantity's price as if
   *   it were the unit price.
   *
   * Failures arrive as `YobApiError` with the backend's stable codes -
   * `category_not_listable` (422) for a group category, `category_not_found` (404),
   * `unsupported_sort`, `page_size_invalid`, `cursor_invalid`, `unsupported_filters`
   * and `unsupported_scope` (all 422). All verified against the running backend.
   */
  getItems(query: ItemListingQuery): Observable<ItemListingDto> {
    return this.api
      .get<ItemListingDto>(GET_ITEMS, {
        scope_type: query.scopeType,
        scope_value: query.scopeValue,
        search: query.search,
        filters: JSON.stringify(query.filters),
        sort: query.sort,
        page_size: query.pageSize,
        cursor: query.cursor,
        qty: 1,
        // Omitted entirely when nothing is selected - `serializeSelection` answers null,
        // and the client drops null parameters. An empty selection is the absence of a
        // constraint, and sending `{}` would be a second spelling of it that the cursor
        // fingerprint would treat as a different query.
        storefront_filters: serializeSelection(query.storefrontFilters),
      })
      .pipe(map((response) => response.data));
  }

  /**
   * The merchandising filters one category page offers.
   *
   * Named for the endpoint, not for what a frontend might prefer to call it. What comes
   * back is a **runtime projection**: that category's own Filter Set, already reduced to
   * the values actually present on its products, in the merchant's order and with no
   * counts. Angular renders it and sends the chosen keys back to `get_items`; it never
   * assembles a filter list from anywhere else, and knows nothing of the admin-side Item
   * Filter Set that governs what a merchant may tag an item with.
   *
   * `filters: []` is a normal answer, not an empty state to apologise for: that category
   * has no Filter Set, so no facet UI is shown.
   *
   * Wire-documented failures: `category_not_found` (404), `category_not_listable` (422)
   * for a group category, which has no listing of its own to filter.
   */
  /**
   * Every category the `/products` quick browse may offer as a chip.
   *
   * Flat, at every depth, and **already reduced to valid listing targets** - the backend
   * drops disabled, unslugged and group categories, so a chip drawn from this can never
   * answer `category_not_listable` when a buyer clicks it.
   *
   * Deliberately not `get_categories`, which answers one level at a time because it
   * serves tree navigation: drawing a chip row from it would cost one request per node.
   * This is the flat shape, and it carries metadata only - no items, no prices, no stock.
   *
   * There is no `All` row. That option is the **absence** of a scope, so the storefront
   * synthesises it rather than expecting the merchant to have configured one.
   */
  getBrowseCategories(): Observable<BrowseCategoriesDto> {
    return this.api
      .get<BrowseCategoriesDto>(GET_BROWSE_CATEGORIES, {})
      .pipe(map((response) => response.data));
  }

  getCategoryFilters(scopeValue: string): Observable<CategoryFiltersDto> {
    return this.api
      .get<CategoryFiltersDto>(GET_CATEGORY_FILTERS, { scope_value: scopeValue })
      .pipe(map((response) => response.data));
  }

  /**
   * A few products for the header typeahead.
   *
   * **Navigation only.** At most eight rows, no pagination and no money - see
   * {@link ProductSuggestionDto}. This is not a listing, and there is deliberately no
   * search-results page behind it.
   *
   * The backend applies the catalogue's own eligibility and its own matching (each word
   * against the product name **or** its item code, AND across words), so a suggestion is
   * always something `get_items` would list. Angular sends the typed string and matches
   * nothing itself.
   *
   * Under three characters the backend answers an empty list rather than an error. The
   * caller applies the same floor so a buyer mid-word costs nothing at all.
   *
   * Wire-documented failure: `search_too_long` (422) for over 100 characters or more than
   * six words, exactly as `get_items` does.
   */
  getProductSuggestions(search: string): Observable<ProductSuggestionsDto> {
    return this.api
      .get<ProductSuggestionsDto>(GET_PRODUCT_SUGGESTIONS, { search })
      .pipe(map((response) => response.data));
  }

  /**
   * One item, by its slug.
   *
   * Lives here rather than in an `ItemApi` because `get_item` is a catalog endpoint -
   * splitting one RPC call into its own service would add a file and a name without
   * adding a boundary.
   *
   * `qty` is passed straight to the backend's pricing engine, so the returned rate,
   * discount, tax and totals are the ones for that quantity. Omitting it leaves the
   * backend default of 1. Nothing about the price is computed here.
   *
   * Failures reach the caller as a `YobApiError`: `item_not_found` (404) for an
   * unknown slug, `validation_failed` (422) for a blank one - both wire-verified.
   *
   * Since backend Phase 24B the answer is a **union**: a salable item, or an Item
   * Template with its attribute matrix. Callers narrow with `isItemFamily` rather than
   * inferring one from the other's missing fields.
   */
  getItem(slug: string, qty?: number): Observable<ItemPayloadDto> {
    return this.api
      .get<ItemPayloadDto>(GET_ITEM, { slug, qty: qty ?? null })
      .pipe(map((response) => response.data));
  }

  /**
   * Turn a complete attribute selection into the actual salable variant.
   *
   * ## The resolver owns variant identity, and this method is the only way to get it
   *
   * Angular does not build item codes. It does not concatenate `TSHIRT` with `RED` and
   * `M`, does not reproduce ERPNext's variant naming, and does not treat the family
   * matrix as transaction authority - the matrix is UX, and it can be stale. The buyer's
   * chosen values go out; a fully priced item comes back, and its `name` is the SKU.
   *
   * The request carries the template, the selection and a quantity, and nothing else -
   * no UOM, no warehouse, no conversion factor, no price list, no candidate code.
   *
   * `qty` is the backend's pricing input, not a client pricing engine: choosing a
   * quantity on the page does **not** re-resolve. It is sent once, at resolution, and
   * the cart is what finally settles the price.
   *
   * Documented refusals - see `VARIANT_ERROR_CODES`: `variant_attributes_required`,
   * `variant_not_available`, `variant_family_unsupported`.
   */
  resolveVariant(request: ResolveVariantRequest): Observable<ItemDetailDto> {
    return this.api
      .get<ItemDetailDto>(RESOLVE_VARIANT, {
        template: request.template,
        // A structured parameter on a GET, exactly as `get_items` sends `filters`.
        attributes: JSON.stringify(request.attributes),
        qty: request.qty,
      })
      .pipe(map((response) => response.data));
  }
}
