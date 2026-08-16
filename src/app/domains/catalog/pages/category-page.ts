import { Component, DestroyRef, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Alert } from '../../../design/alert/alert';
import { Button } from '../../../design/button/button';
import { Field } from '../../../design/field/field';
import { EmptyState } from '../../../design/empty-state/empty-state';
import { Spinner } from '../../../design/spinner/spinner';
import { YobApiError } from '../../../foundation/network/yob-api-error';
import { CatalogApi } from '../data/catalog.api';
import { toCategoryLink, type ItemListingSort } from '../contracts/catalog.types';
import { ItemListing } from '../state/item-listing';
import { CategoryCard } from '../parts/category-card';
import { ItemCard } from '../parts/item-card';

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
  imports: [Alert, Button, CategoryCard, EmptyState, Field, ItemCard, RouterLink, Spinner],
  template: `
    <nav aria-label="Breadcrumb" i18n-aria-label="@@catalog.breadcrumb.label">
      <a routerLink="/catalog" class="text-sm text-slate-600 underline underline-offset-4"
        ><ng-container i18n="@@catalog.breadcrumb.back">Back to catalog</ng-container></a
      >
    </nav>

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

          @if (listing.initialLoading()) {
            <div class="mt-8 flex justify-center" data-testid="items-loading">
              <app-spinner label="Loading items" i18n-label="@@catalog.items.loading" />
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
  `,
})
export class CategoryPage {
  /** Bound from the `:categorySlug` route parameter. */
  readonly categorySlug = input.required<string>();

  private readonly api = inject(CatalogApi);

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

  protected readonly listing = new ItemListing(this.api);

  constructor() {
    // One listing request per (category, sort). `ItemListing.load` resets everything and
    // bumps its generation, so a slower response for the previous category or sort is
    // dropped rather than rendered over the current one.
    effect(() => {
      const slug = this.categorySlug();
      const sort = this.sort();
      if (this.isLeaf()) {
        this.listing.load(slug, sort);
      }
    });

    inject(DestroyRef).onDestroy(() => this.listing.destroy());
  }

  protected onSortChange(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as ItemListingSort);
  }

  protected reload(): void {
    this.listing.load(this.categorySlug(), this.sort());
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
