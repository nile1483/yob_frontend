import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { Alert } from '../../../design/alert/alert';
import { EmptyState } from '../../../design/empty-state/empty-state';
import { Spinner } from '../../../design/spinner/spinner';
import { PageHeader } from '../../../design/page-header/page-header';
import { CatalogApi } from '../data/catalog.api';
import { toCategoryLink } from '../contracts/catalog.types';
import { CategoryCard } from '../parts/category-card';

/**
 * Top-level category listing.
 *
 * ## State decision: page-local, no store
 *
 * This page holds its data in an `rxResource` rather than a `CatalogStore`. Nothing
 * else in the application reads categories, the data is derived entirely from the
 * route, and a store would immediately owe us a cache-invalidation policy for a
 * problem we do not have. `rxResource` gives loading, error and value as signals, and
 * throws the request away when the page does.
 *
 * A store becomes worth it when two consumers need the same catalog data at once -
 * item search sharing results with a listing, say. That is a real trigger; "domains
 * usually have stores" is not.
 */
@Component({
  selector: 'app-catalog-page',
  imports: [PageHeader, Alert, CategoryCard, EmptyState, Spinner],
  template: `
    <app-page-header
      heading="Catalog"
      i18n-heading="@@catalog.heading"
      lead="Browse everything available to your account."
      i18n-lead="@@catalog.lead"
    />

    @if (categories.isLoading()) {
      <div class="mt-8 flex justify-center" data-testid="catalog-loading">
        <app-spinner label="Loading categories" i18n-label="@@catalog.loading" />
      </div>
    } @else if (categories.error()) {
      <div class="mt-6" data-testid="catalog-error">
        <app-alert tone="error">
          <span i18n="@@catalog.error">We could not load the catalog. Please try again.</span>
        </app-alert>
      </div>
    } @else if (links().length === 0) {
      <div class="mt-8" data-testid="catalog-empty">
        <app-empty-state>
          <h2 emptyTitle i18n="@@catalog.empty.title">No categories yet</h2>
          <p emptyBody i18n="@@catalog.empty.body">
            Categories will appear here once they are published to your account.
          </p>
        </app-empty-state>
      </div>
    } @else {
      <ul
        class="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4"
        data-testid="category-grid"
      >
        @for (link of links(); track link.slug) {
          <li>
            <app-category-card [category]="link" />
          </li>
        }
      </ul>
    }
  `,
})
export class CatalogPage {
  private readonly api = inject(CatalogApi);

  protected readonly categories = rxResource({
    stream: () => this.api.getCategories(),
    defaultValue: [],
  });

  /** Both category shapes render through the same card, so both map to `CategoryLink`. */
  protected readonly links = computed(() => this.categories.value().map(toCategoryLink));
}
