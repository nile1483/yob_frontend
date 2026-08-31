import type { ItemListingSort } from './contracts/catalog.types';

/**
 * The sort options the storefront offers, and the only ones.
 *
 * Shared by the category page and the `/products` quick browse so the two cannot drift:
 * two browsing surfaces over one catalogue engine must offer the same orders, spelled
 * with the same backend values and the same labels. A second copy would be a second
 * place for a new option to be forgotten.
 *
 * **Price sorting is deliberately absent.** The backend has no global customer-price
 * order, and sorting only the loaded page would be wrong for every page after the first
 * while looking authoritative.
 */
export const ITEM_SORT_OPTIONS: readonly { value: ItemListingSort; label: string }[] = [
  { value: 'name_asc', label: $localize`:@@catalog.sort.nameAsc:Name: A to Z` },
  { value: 'name_desc', label: $localize`:@@catalog.sort.nameDesc:Name: Z to A` },
  { value: 'newest', label: $localize`:@@catalog.sort.newest:Newest` },
];

/** The order a listing starts in when nobody has chosen one. */
export const DEFAULT_ITEM_SORT: ItemListingSort = 'name_asc';
