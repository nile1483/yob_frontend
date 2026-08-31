import { Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';

import { Alert } from '../../../design/alert/alert';
import { Button } from '../../../design/button/button';
import { EmptyState } from '../../../design/empty-state/empty-state';
import { Field } from '../../../design/field/field';
import { Spinner } from '../../../design/spinner/spinner';
import { DEFAULT_ITEM_SORT, ITEM_SORT_OPTIONS } from '../catalog-sort';
import { browseListingQuery, type ItemListingSort } from '../contracts/catalog.types';
import { CatalogApi } from '../data/catalog.api';
import { CategoryFilters } from '../parts/category-filters';
import { ItemCard } from '../parts/item-card';
import { ProductBrowseCategoryChips } from '../parts/product-browse-category-chips';
import { ProductBrowseSearch } from '../parts/product-browse-search';
import { ItemListing } from '../state/item-listing';
import {
  NO_FILTERS,
  clearFilter,
  hasSelection,
  reconcileSelection,
  toggleValue,
  type StorefrontFilterSelection,
} from '../storefront-filters';

/**
 * `/products` - browse the whole catalogue without picking a category first.
 *
 * ## A second browsing surface, not a second catalogue
 *
 * Everything that decides what a product is, what it costs and whether this buyer may
 * see it stays where it was: `get_items` for the listing, `get_category_filters` for the
 * facets, `ItemListing` for the cursor and the two kinds of failure, `ItemCard` for the
 * card. This page contributes exactly one thing - a different way to **build the query**.
 *
 * The category page browses one category from a URL. This one browses the catalogue, and
 * lets the buyer narrow it with a chip, a search and that category's facets. Same engine,
 * different entrance.
 *
 * ## The page owns the browse state, the children own none of it
 *
 * `category`, `search`, `filters`, `sort` and the cursor live here. The chips emit which
 * chip was pressed and the search box emits what was submitted; neither knows what that
 * does to a listing. That is what keeps the catalogue rules in one place instead of
 * three.
 *
 * ## Why no query parameters
 *
 * Phase 28B keeps browse state local by decision, so `/products` is not deep-linkable and
 * the back button does not step through filter changes. The category page does the
 * opposite - its selection lives in the URL - and the two are deliberately different for
 * now. Nothing here writes to the router.
 *
 * ## What changing a category means
 *
 * Filters are cleared, the cursor is dropped, and the search and sort are kept. Facets
 * belong to a category, so carrying a previous category's selection would send keys the
 * new one does not expose - `storefront_filter_unknown`. A search is the buyer's, and
 * survives.
 */
@Component({
  selector: 'app-products-page',
  imports: [
    Alert,
    Button,
    CategoryFilters,
    EmptyState,
    Field,
    ItemCard,
    ProductBrowseCategoryChips,
    ProductBrowseSearch,
    Spinner,
  ],
  template: `
    <section class="yob-page-section products-section">
      <div class="yob-content-container">
        <header class="mt-4">
          <h1 class="text-2xl font-semibold tracking-tight text-slate-900" data-testid="products-title" i18n="@@products.title">
            All products
          </h1>
        </header>

        <!-- Chips first: the coarsest control, and the one that resets the others. -->
        <div class="mt-4">
          @if (categoriesResource.isLoading()) {
            <div class="flex justify-center py-2" data-testid="browse-categories-loading">
              <app-spinner label="Loading categories" i18n-label="@@products.categories.loading" />
            </div>
          } @else {
            <!-- A failed category request leaves the chip row with just All, which is
                 still a working catalogue browse. The products are the page; the chips
                 are a way to narrow them, and losing them must not lose the listing. -->
            <app-product-browse-category-chips
              [categories]="browseCategories()"
              [activeSlug]="category()"
              (select)="selectCategory($event)"
            />

            @if (categoriesResource.error()) {
              <p class="mt-2 text-sm text-slate-700" data-testid="browse-categories-error" i18n="@@products.categories.error">
                Categories could not be loaded. You can still browse all products.
              </p>
            }
          }
        </div>

        <div class="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div class="sm:max-w-md sm:flex-1">
            <app-product-browse-search [active]="search()" (submitted)="applySearch($event)" />
          </div>

          <app-field label="Sort by" i18n-label="@@catalog.sort.label">
            <select
              class="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm"
              [value]="sort()"
              (change)="applySort($event)"
              data-testid="products-sort"
            >
              @for (option of sortOptions; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </app-field>
        </div>

        <!-- Facets exist only inside a category. Under All there is no request, no panel
             and no storefront_filters parameter - the backend answers
             storefront_filter_context_required for a selection with no scope. -->
        @if (showsFilters()) {
          <div class="mt-4" data-testid="products-filters">
            <app-category-filters
              [filters]="filters()"
              [selection]="selection()"
              (toggle)="onToggleFilter($event)"
              (clearFilter)="onClearFilter($event)"
              (clearAll)="onClearAllFilters()"
            />
          </div>
        }

        @if (listing.initialLoading()) {
          <div class="mt-8 flex justify-center" data-testid="products-loading">
            <app-spinner label="Loading products" i18n-label="@@products.loading" />
          </div>
        } @else if (listing.initialError()) {
          <div class="mt-6" data-testid="products-error">
            <app-alert tone="error">
              <span i18n="@@catalog.items.error">We could not load these items. Please try again.</span>
            </app-alert>
            <button
              yob-button
              variant="secondary"
              size="sm"
              type="button"
              class="mt-4"
              (click)="reload()"
              data-testid="products-retry"
              i18n="@@catalog.items.retry"
            >
              Try again
            </button>
          </div>
        } @else if (listing.isEmpty()) {
          <!-- Zero results for a search or a facet is an ordinary answer, not a failure. -->
          <div class="mt-8" data-testid="products-empty">
            <app-empty-state>
              <h2 emptyTitle i18n="@@products.empty.title">No products found</h2>
              <p emptyBody i18n="@@products.empty.body">
                Try a different category, or clear the search and filters.
              </p>
            </app-empty-state>
          </div>
        } @else {
          <ul
            class="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4"
            data-testid="item-grid"
          >
            @for (item of listing.items(); track item.name) {
              <li>
                <app-item-card [item]="item" />
              </li>
            }
          </ul>

          @if (listing.hasMore()) {
            <div class="mt-8 flex flex-col items-center gap-3" data-testid="load-more-area">
              @if (listing.loadMoreError()) {
                <p class="text-sm text-slate-700" data-testid="load-more-error" i18n="@@catalog.items.loadMore.error">
                  We could not load more items.
                </p>
              }

              <button
                yob-button
                variant="secondary"
                type="button"
                [loading]="listing.loadingMore()"
                [disabled]="listing.loadingMore()"
                (click)="listing.loadMore()"
                data-testid="load-more"
              >
                @if (listing.loadMoreError()) {
                  <ng-container i18n="@@catalog.items.loadMore.retry">Try again</ng-container>
                } @else {
                  <ng-container i18n="@@catalog.items.loadMore">Load more</ng-container>
                }
              </button>
            </div>
          }
        }
      </div>
    </section>
  `,
})
export class ProductsPage {
  private readonly api = inject(CatalogApi);

  protected readonly sortOptions = ITEM_SORT_OPTIONS;

  // ------------------------------------------------------------- browse state

  /** The chosen category's slug, or `null` for the whole catalogue. */
  private readonly categorySignal = signal<string | null>(null);
  protected readonly category = this.categorySignal.asReadonly();

  /** The **submitted** search. Typing does not reach this; only Search or Enter does. */
  private readonly searchSignal = signal('');
  protected readonly search = this.searchSignal.asReadonly();

  private readonly sortSignal = signal<ItemListingSort>(DEFAULT_ITEM_SORT);
  protected readonly sort = this.sortSignal.asReadonly();

  /**
   * The buyer's facet selection, always for the category currently chosen.
   *
   * Cleared by {@link selectCategory} rather than reconciled afterwards: a selection made
   * in one category has no meaning in another, and sending its keys would answer
   * `storefront_filter_unknown`.
   */
  private readonly selectionSignal = signal<StorefrontFilterSelection>(NO_FILTERS);

  /** Every category that is a valid listing target. Requested once. */
  protected readonly categoriesResource = rxResource({
    params: () => ({}),
    stream: () => this.api.getBrowseCategories(),
  });

  protected readonly browseCategories = computed(() =>
    this.categoriesResource.hasValue() ? this.categoriesResource.value().categories : [],
  );

  /**
   * The chosen category's facets, or none at all under `All`.
   *
   * Keyed on the slug, so switching category asks for the new category's projection and a
   * previous one is never carried over. `All` short-circuits to an empty list without a
   * request: which facets exist is a property of a category, and the backend has none to
   * answer with catalogue-wide.
   *
   * `rxResource` re-requests on the key and drops the superseded response, so a slow
   * answer for category A cannot land under category B.
   */
  protected readonly filtersResource = rxResource({
    params: () => ({ slug: this.category() }),
    stream: ({ params }) =>
      params.slug === null ? of({ filters: [] }) : this.api.getCategoryFilters(params.slug),
  });

  protected readonly filters = computed(() =>
    this.filtersResource.hasValue() ? this.filtersResource.value().filters : [],
  );

  /**
   * Whether the facet request has finished, successfully or not.
   *
   * The listing waits on this rather than on success, for the reason the category page
   * gives: facets are decoration and the products are the page, so a category whose
   * facets fail must still list its products.
   */
  private readonly filtersSettled = computed(
    () => this.filtersResource.hasValue() || this.filtersResource.error() !== undefined,
  );

  protected readonly showsFilters = computed(
    () => this.category() !== null && this.filters().length > 0,
  );

  /**
   * The selection actually sent, reduced to what this category offers.
   *
   * Belt and braces beside the clear-on-change above: until the projection lands there is
   * nothing to validate against, so nothing is sent.
   */
  protected readonly selection = computed(() =>
    reconcileSelection(this.selectionSignal(), this.filters()),
  );

  protected readonly listing = new ItemListing(this.api);

  constructor() {
    // One listing request per (category, search, sort, selection). `ItemListing.start`
    // resets everything including the cursor and bumps its generation, so a slower
    // response for a previous browse state is dropped rather than rendered over the
    // current one - and no cursor ever crosses a state change.
    effect(() => {
      const category = this.category();
      const search = this.search();
      const sort = this.sort();
      const selection = this.selection();

      // Under `All` the resource resolves immediately, so this gate only ever delays a
      // category's first listing until its facets have settled.
      if (!this.filtersSettled()) {
        return;
      }

      this.listing.start(browseListingQuery(category, sort, search, selection));
    });
  }

  // ----------------------------------------------------------------- intents

  /**
   * Choose a category, or `null` for the whole catalogue.
   *
   * The locked transition: filters cleared, cursor reset, search and sort kept. The
   * cursor reset is implicit - the effect above rebuilds a first-page query - and the
   * filter clear is explicit here so no stale value can reach `get_items` even for the
   * one change-detection pass before the new projection arrives.
   */
  protected selectCategory(slug: string | null): void {
    if (slug === this.categorySignal()) {
      return;
    }

    this.selectionSignal.set(NO_FILTERS);
    this.categorySignal.set(slug);
  }

  /** Apply a submitted search. `''` clears it. Pagination restarts either way. */
  protected applySearch(search: string): void {
    this.searchSignal.set(search);
  }

  protected applySort(event: Event): void {
    this.sortSignal.set((event.target as HTMLSelectElement).value as ItemListingSort);
  }

  protected onToggleFilter(change: { filterKey: string; valueKey: string }): void {
    this.selectionSignal.update((current) =>
      toggleValue(current, change.filterKey, change.valueKey),
    );
  }

  protected onClearFilter(filterKey: string): void {
    this.selectionSignal.update((current) => clearFilter(current, filterKey));
  }

  protected onClearAllFilters(): void {
    if (hasSelection(this.selectionSignal())) {
      this.selectionSignal.set(NO_FILTERS);
    }
  }

  /** Repeat the current query verbatim after a first-page failure. */
  protected reload(): void {
    this.listing.start(
      browseListingQuery(this.category(), this.sort(), this.search(), this.selection()),
    );
  }
}
