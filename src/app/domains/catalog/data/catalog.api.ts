import { Service, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';

import { YobApiClient } from '../../../foundation/network/yob-api-client';
import type {
  CategoryListItemDto,
  CategoryMetaDto,
  CategoryPayloadDto,
  ItemDetailDto,
  ItemListingDto,
  ItemListingQuery,
} from '../contracts/catalog.types';

const GET_CATEGORIES = 'yob_storefront.api.catalog.get_categories';
const GET_CATEGORY = 'yob_storefront.api.catalog.get_category';
const GET_ITEM = 'yob_storefront.api.catalog.get_item';
const GET_ITEMS = 'yob_storefront.api.catalog.get_items';

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
      })
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
   */
  getItem(slug: string, qty?: number): Observable<ItemDetailDto> {
    return this.api
      .get<ItemDetailDto>(GET_ITEM, { slug, qty: qty ?? null })
      .pipe(map((response) => response.data));
  }
}
