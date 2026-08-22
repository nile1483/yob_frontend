import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';

import { Alert } from '../../../design/alert/alert';
import { Button } from '../../../design/button/button';
import { Field } from '../../../design/field/field';
import { EmptyState } from '../../../design/empty-state/empty-state';
import { Spinner } from '../../../design/spinner/spinner';
import { YobApiError } from '../../../foundation/network/yob-api-error';
import { CatalogApi } from '../data/catalog.api';
import { toCategoryLink, type ItemListingSort } from '../contracts/catalog.types';
import { CategoryFilters } from '../parts/category-filters';
import { ItemListing } from '../state/item-listing';
import {
  NO_FILTERS,
  clearFilter,
  parseSelection,
  reconcileSelection,
  serializeSelection,
  toggleValue,
  type StorefrontFilterSelection,
} from '../storefront-filters';

/**
 * The refusals that mean "your selection is wrong", not "the request failed".
 *
 * Published by API 3.4.0 for `get_items`. Each one is final for the selection that
 * caused it: the remedy is to change or drop the selection, never to send it again.
 */
const FILTER_ERROR_CODES = new Set([
  'storefront_filter_invalid',
  'storefront_filter_unknown',
  'storefront_filter_value_unknown',
  'storefront_filter_context_required',
]);
import { CategoryCard } from '../parts/category-card';
import { ItemCard } from '../parts/item-card';
import { ContentSlot } from '../../content/parts/content-slot';

/**
 * One category: its details, its subcategories and its items.
 *
 * The slug arrives as a signal input through `withComponentInputBinding()`, so
 * `rxResource` re-runs whenever the route changes and stale content is never shown
 * for the new slug - the resource drops the previous value while loading the next.
 *
 * Same state decision as the listing page: page-local resource, no store. See
 * `CatalogPage`.
 */
@Component({
  selector: 'app-category-page',
  imports: [
    CategoryFilters,Alert, Button, CategoryCard, EmptyState, Field, ItemCard, RouterLink, Spinner, ContentSlot],
  template: `
    <nav aria-label="Breadcrumb" i18n-aria-label="@@catalog.breadcrumb.label">
      <a routerLink="/catalog" class="text-sm text-slate-600 underline underline-offset-4"
        ><ng-container i18n="@@catalog.breadcrumb.back">Back to catalog</ng-container></a
      >
    </nav>

    <!-- Merchant content for this route. The position is ours; what appears
         in it is the merchant's, and an empty slot renders nothing. -->
    <yob-content-slot routeKey="category" slotKey="above_listing" />

    @if (category.isLoading()) {
      <div class="mt-8 flex justify-center" data-testid="category-loading">
        <app-spinner label="Loading category" i18n-label="@@catalog.category.loading" />
      </div>
    } @else if (notFound()) {
      <div class="mt-6" data-testid="category-not-found">
        <app-empty-state>
          <h1 emptyTitle i18n="@@catalog.category.notFound.title">Category not found</h1>
          <p emptyBody i18n="@@catalog.category.notFound.body">
            This category may have been renamed or is no longer available.
          </p>
          <a
            emptyAction
            routerLink="/catalog"
            class="underline underline-offset-4"
            i18n="@@catalog.category.notFound.action"
            >Browse the catalog</a
          >
        </app-empty-state>
      </div>
    } @else if (category.error()) {
      <div class="mt-6" data-testid="category-error">
        <app-alert tone="error">
          <span i18n="@@catalog.category.error"
            >We could not load this category. Please try again.</span
          >
        </app-alert>
      </div>
    } @else if (payload(); as data) {
      <header class="mt-4">
        <h1 class="text-2xl font-semibold tracking-tight break-words" data-testid="category-title">
          {{ data.category.category_name }}
        </h1>
        @if (data.category.description; as description) {
          <p class="mt-2 max-w-prose text-slate-600" data-testid="category-description">
            {{ description }}
          </p>
        }
      </header>

      @if (subcategories().length > 0) {
        <section class="mt-8">
          <h2 class="text-lg font-semibold" i18n="@@catalog.subcategories.heading">
            Subcategories
          </h2>
          <ul
            class="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4"
            data-testid="subcategory-grid"
          >
            @for (link of subcategories(); track link.slug) {
              <li>
                <app-category-card [category]="link" />
              </li>
            }
          </ul>
        </section>
      }

      <!-- Items come from get_items, never from get_category().items: the embedded
           array is unbounded and carries no cursor, sort or page size. A group category
           has no listing of its own - get_items answers category_not_listable for
           one - so the request is only made for a leaf. -->
      @if (isLeaf()) {
        <section class="mt-10" data-testid="item-listing">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <h2 class="text-lg font-semibold" i18n="@@catalog.items.heading">Items</h2>

            @if (!listing.isEmpty()) {
              <div class="w-full sm:w-56">
                <app-field label="Sort by" i18n-label="@@catalog.sort.label">
                  <select
                    class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base
                           sm:text-sm"
                    [value]="sort()"
                    (change)="onSortChange($event)"
                    data-testid="item-sort"
                  >
                    @for (option of sortOptions; track option.value) {
                      <option [value]="option.value">{{ option.label }}</option>
                    }
                  </select>
                </app-field>
              </div>
            }
          </div>

          @if (showsFilters()) {
            <!-- Small screens get a disclosure so the products stay near the top of the
                 page; from sm up the same panel is simply always open beside them.
                 One component, one selection, one set of rules - the difference between
                 the two is where it sits, which is presentation. -->
            <div class="mt-6 sm:hidden">
              <button
                yob-button
                variant="secondary"
                size="sm"
                type="button"
                [attr.aria-expanded]="filtersOpen()"
                aria-controls="category-filter-panel"
                (click)="toggleFiltersPanel()"
                data-testid="filters-toggle"
                i18n="@@catalog.filters.toggle"
              >
                Filters
              </button>
            </div>

            <div
              id="category-filter-panel"
              class="mt-4 rounded-lg border border-slate-200 p-4 sm:mt-6"
              [class.hidden]="!filtersOpen()"
              [class.sm:block]="true"
              data-testid="filter-panel"
            >
              <app-category-filters
                [filters]="filters()"
                [selection]="selection()"
                (toggle)="onToggleValue($event)"
                (clearFilter)="onClearFilter($event)"
                (clearAll)="onClearAll()"
              />
            </div>
          }

          @if (listing.initialLoading()) {
            <div class="mt-8 flex justify-center" data-testid="items-loading">
              <app-spinner label="Loading items" i18n-label="@@catalog.items.loading" />
            </div>
          } @else if (filterError()) {
            <!-- The backend refused the selection itself, so repeating it would be
                 refused again. The way out is a different request - without the filters -
                 which is what this button issues. Never a retry of the same one. -->
            <div class="mt-6" data-testid="items-filter-error">
              <app-alert tone="error">
                <span i18n="@@catalog.items.filterError">
                  Those filters are no longer available for this category.
                </span>
              </app-alert>
              <button
                yob-button
                variant="secondary"
                size="sm"
                type="button"
                class="mt-4"
                (click)="onClearAll()"
                data-testid="items-clear-filters"
                i18n="@@catalog.items.clearFilters"
              >
                Clear filters
              </button>
            </div>
          } @else if (listing.initialError()) {
            <div class="mt-6" data-testid="items-error">
              <app-alert tone="error">
                <span i18n="@@catalog.items.error">
                  We could not load these items. Please try again.
                </span>
              </app-alert>
              <button
                yob-button
                variant="secondary"
                size="sm"
                type="button"
                class="mt-4"
                (click)="reload()"
                data-testid="items-retry"
                i18n="@@catalog.items.retry"
              >
                Try again
              </button>
            </div>
          } @else if (listing.isEmpty()) {
            <div class="mt-8" data-testid="category-no-items">
              <app-empty-state>
                <h3 emptyTitle i18n="@@catalog.items.empty.title">No items in this category</h3>
                <p emptyBody i18n="@@catalog.items.empty.body">
                  Items will appear here once they are available to your account.
                </p>
              </app-empty-state>
            </div>
          } @else {
            <ul
              class="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4"
              data-testid="item-grid"
            >
              <!-- Tracked by the stable item identity, so appending a page leaves every
                   card already on screen untouched. -->
              @for (item of listing.items(); track item.name) {
                <li>
                  <app-item-card [item]="item" />
                </li>
              }
            </ul>

            <!-- Driven by the backend's has_more alone. An empty page with
                 has_more: true is a continuation, so Load More stays available. -->
            @if (listing.hasMore()) {
              <div class="mt-8 flex flex-col items-center gap-3" data-testid="load-more-area">
                @if (listing.loadMoreError()) {
                  <!-- Scoped to the control. The products already loaded stay on screen:
                       replacing them with a page-level error because page three failed
                       would be worse than the failure. -->
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
        </section>
      } @else if (subcategories().length === 0) {
        <div class="mt-8" data-testid="category-no-items">
          <app-empty-state>
            <h2 emptyTitle i18n="@@catalog.items.empty.title">No items in this category</h2>
            <p emptyBody i18n="@@catalog.items.empty.body">
              Items will appear here once they are available to your account.
            </p>
          </app-empty-state>
        </div>
      }
    }

    <yob-content-slot routeKey="category" slotKey="below_listing" />
  `,
})
export class CategoryPage {
  /** Bound from the `:categorySlug` route parameter. */
  readonly categorySlug = input.required<string>();

  /**
   * The merchandising selection, straight off the query string.
   *
   * **The URL is the state.** Bound through `withComponentInputBinding()`, so a reload, a
   * shared link and the browser's back and forward buttons all arrive the same way: as a
   * new value here. Nothing mirrors it into a second signal that could disagree with the
   * address bar, and a click does not set state - it navigates, and the new URL sets it.
   */
  readonly storefrontFiltersParam = input('', { alias: 'storefront_filters' });

  private readonly api = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly category = rxResource({
    params: () => ({ slug: this.categorySlug() }),
    stream: ({ params }) => this.api.getCategory(params.slug),
  });

  /**
   * The loaded category, or `undefined`.
   *
   * Guarded with `hasValue()` because `resource.value()` **throws** while the resource
   * is in an error state, and this is now read from an effect rather than only from a
   * template branch that had already excluded that case. Without the guard a 404 on the
   * category took the whole page down instead of showing the not-found state.
   */
  protected readonly payload = computed(() =>
    this.category.hasValue() ? this.category.value().payload : undefined,
  );

  protected readonly subcategories = computed(
    () => this.payload()?.subcategories.map(toCategoryLink) ?? [],
  );

  /**
   * Whether this category lists items of its own.
   *
   * `is_group` is the backend's own flag, and `get_items` refuses a group category with
   * `category_not_listable`. Asking first is what keeps that error off the screen.
   */
  protected readonly isLeaf = computed(() => {
    const category = this.payload()?.category;
    return category !== undefined && category.is_group === 0;
  });

  /**
   * Sort resets to the default on every category change.
   *
   * A `linkedSignal` keyed on the slug: carrying a previous category's sort into a new
   * one would mean the control and the listing disagree about what the buyer asked for.
   */
  protected readonly sort = linkedSignal<string, ItemListingSort>({
    source: () => this.categorySlug(),
    computation: () => 'name_asc',
  });

  protected readonly sortOptions: readonly { value: ItemListingSort; label: string }[] = [
    { value: 'name_asc', label: $localize`:@@catalog.sort.nameAsc:Name: A to Z` },
    { value: 'name_desc', label: $localize`:@@catalog.sort.nameDesc:Name: Z to A` },
    // Price sorting is deliberately absent: the backend has no global customer-price
    // order, and sorting only the loaded page would be wrong for every page after the
    // first while looking authoritative.
    { value: 'newest', label: $localize`:@@catalog.sort.newest:Newest` },
  ];

  /**
   * This category's own merchandising filters.
   *
   * Keyed on the slug, so changing category asks for the new category's projection - a
   * previous category's filters are never carried over, and a parent's are never
   * inherited. Only leaf categories are asked: a group category has no listing of its own
   * and answers `category_not_listable`, so asking would put a known error on the wire.
   */
  protected readonly filtersResource = rxResource({
    params: () => ({ slug: this.categorySlug(), leaf: this.isLeaf() }),
    stream: ({ params }) =>
      params.leaf ? this.api.getCategoryFilters(params.slug) : of({ filters: [] }),
  });

  /** The projection, or nothing while it loads or if it failed. */
  protected readonly filters = computed(() =>
    this.filtersResource.hasValue() ? this.filtersResource.value().filters : [],
  );

  /**
   * Whether the filter request has finished, successfully or not.
   *
   * The listing waits for this rather than for a **successful** projection. Filters are
   * merchandising decoration; the products are the page. Gating the listing on
   * `hasValue()` meant that a category whose facets failed to load - an older backend, a
   * transient 500, anything - showed a spinner and no products for ever, which is a far
   * worse outcome than a category page with no filter panel.
   *
   * A failed projection reconciles every selection away, so the listing is requested
   * unfiltered: without a projection there is nothing to validate a selection against,
   * and sending unvalidated keys would only invite `storefront_filter_unknown`.
   */
  private readonly filtersSettled = computed(
    () => this.filtersResource.hasValue() || this.filtersResource.error() !== undefined,
  );

  /** No Filter Set, or none loaded yet: render no facet UI at all. */
  protected readonly showsFilters = computed(() => this.filters().length > 0);

  /**
   * What is actually selected: the URL's request, reduced to what this category offers.
   *
   * Reconciliation happens **before** anything is requested, not after the backend
   * refuses it. A selection can outlive the category it was made in - a shared link, the
   * back button, a filter the merchant retired since the tab was opened - and sending a
   * key this category does not expose answers `storefront_filter_unknown`. Trimming here
   * turns that into a valid listing with the invalid part dropped.
   *
   * Until the projection has loaded there is nothing to reconcile against, so the
   * selection is empty and the first request carries no filters rather than unvalidated
   * ones.
   */
  protected readonly selection = computed(() =>
    reconcileSelection(parseSelection(this.storefrontFiltersParam()), this.filters()),
  );

  protected readonly listing = new ItemListing(this.api);

  constructor() {
    // One listing request per (category, sort, selection). `ItemListing.load` resets
    // everything - the cursor included - and bumps its generation, so a slower response
    // for a previous category, sort or selection is dropped rather than rendered over the
    // current one, and no cursor ever crosses a selection change.
    effect(() => {
      const slug = this.categorySlug();
      const sort = this.sort();
      const selection = this.selection();
      if (this.isLeaf() && this.filtersSettled()) {
        this.listing.load(slug, sort, selection);
      }
    });

    // Put the reconciled selection back in the address bar when it differs from what was
    // asked for - a stale or malformed query string is corrected rather than left to
    // contradict the listing beside it. `replaceUrl` because a correction is not a place
    // the buyer navigated to and should not be a stop on the way back.
    effect(() => {
      const requested = this.storefrontFiltersParam();
      if (!this.filtersSettled()) {
        return;
      }
      const reconciled = serializeSelection(this.selection());
      if ((reconciled ?? '') !== requested) {
        this.writeSelection(this.selection(), true);
      }
    });

    inject(DestroyRef).onDestroy(() => this.listing.destroy());
  }

  /**
   * Navigate to a selection. The URL change is what updates the page.
   *
   * A single writer for every filter interaction - toggle, clear one, clear all - so
   * there is exactly one place where selection becomes a URL, and it always writes the
   * normalized form. `null` removes the parameter entirely rather than leaving an empty
   * object behind, which would be a second spelling of "no filters".
   */
  private writeSelection(selection: StorefrontFilterSelection, replaceUrl = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { storefront_filters: serializeSelection(selection) },
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }

  protected onToggleValue(event: { filterKey: string; valueKey: string }): void {
    this.writeSelection(toggleValue(this.selection(), event.filterKey, event.valueKey));
  }

  protected onClearFilter(filterKey: string): void {
    this.writeSelection(clearFilter(this.selection(), filterKey));
  }

  protected onClearAll(): void {
    this.writeSelection(NO_FILTERS);
  }

  /** Open/closed state for the small-screen filter panel. Presentation only. */
  protected readonly filtersOpen = signal(false);

  protected toggleFiltersPanel(): void {
    this.filtersOpen.update((open) => !open);
  }

  /**
   * Whether the listing failed because of the merchandising selection.
   *
   * The one failure class the buyer can act on, and the one that must **not** be
   * retried: re-sending a selection the backend has already refused gets the same
   * refusal. The page offers to clear the filters instead, which is a different request.
   */
  protected readonly filterError = computed(() =>
    FILTER_ERROR_CODES.has(this.listing.initialErrorCode() ?? ''),
  );

  protected onSortChange(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as ItemListingSort);
  }

  protected reload(): void {
    this.listing.load(this.categorySlug(), this.sort(), this.selection());
  }

  /**
   * A missing category is a normal destination, not a fault.
   *
   * Branching on the backend's stable `category_not_found` code - never on message
   * text, and never on the bare 403/404 status, which other failures also use.
   */
  protected readonly notFound = computed(() => {
    const error = this.category.error();
    return error instanceof YobApiError && error.code === 'category_not_found';
  });
}
