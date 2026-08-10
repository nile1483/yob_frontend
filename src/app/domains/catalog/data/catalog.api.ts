import { Service, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';

import { YobApiClient } from '../../../foundation/network/yob-api-client';
import type {
  CategoryListItemDto,
  CategoryMetaDto,
  CategoryPayloadDto,
} from '../contracts/catalog.types';

const GET_CATEGORIES = 'yob_storefront.api.catalog.get_categories';
const GET_CATEGORY = 'yob_storefront.api.catalog.get_category';

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
}
