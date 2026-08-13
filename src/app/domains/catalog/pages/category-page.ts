import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Alert } from '../../../design/alert/alert';
import { EmptyState } from '../../../design/empty-state/empty-state';
import { Spinner } from '../../../design/spinner/spinner';
import { YobApiError } from '../../../foundation/network/yob-api-error';
import { CatalogApi } from '../data/catalog.api';
import { toCategoryLink } from '../contracts/catalog.types';
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
  imports: [Alert, CategoryCard, EmptyState, ItemCard, RouterLink, Spinner],
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
            class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            data-testid="subcategory-grid"
          >
            @for (link of subcategories(); track link.slug) {
              <li class="flex">
                <app-category-card [category]="link" />
              </li>
            }
          </ul>
        </section>
      }

      @if (data.items.length > 0) {
        <section class="mt-10">
          <h2 class="text-lg font-semibold" i18n="@@catalog.items.heading">Items</h2>
          <ul
            class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            data-testid="item-grid"
          >
            @for (item of data.items; track item.name) {
              <li class="flex">
                <app-item-card [item]="item" />
              </li>
            }
          </ul>
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

  protected readonly payload = computed(() => this.category.value()?.payload);

  protected readonly subcategories = computed(
    () => this.payload()?.subcategories.map(toCategoryLink) ?? [],
  );

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
