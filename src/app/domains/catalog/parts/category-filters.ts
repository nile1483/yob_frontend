import { Component, computed, input, output } from '@angular/core';

import { Button } from '../../../design/button/button';
import type { StorefrontFilterDto } from '../contracts/catalog.types';
import {
  hasSelection,
  isValueSelected,
  type StorefrontFilterSelection,
} from '../storefront-filters';

/**
 * The merchandising filters a category offers, and which of them are chosen.
 *
 * Presentational: it renders the backend's projection and emits what the buyer clicked.
 * It holds no selection of its own, performs no matching, and issues no request - the
 * page owns the state and the URL, so the desktop panel and the mobile panel are one
 * component reading one selection rather than two views that could disagree.
 *
 * ## Order is the merchant's
 *
 * Filters and their values are rendered in the order they arrive. Nothing is sorted
 * alphabetically or by popularity: the sequence is a merchandising decision that has
 * already been made.
 *
 * ## No counts, and none inferred
 *
 * The contract publishes no facet counts, because a truthful one needs the full
 * eligibility pipeline run per value. So none is shown. A count computed from the loaded
 * page would be wrong for every page after the first while looking authoritative - the
 * same trap as sorting a listing by a price the backend never ordered by.
 *
 * ## Checkboxes in a fieldset
 *
 * Several values of one filter can be chosen at once, so each filter is a `fieldset`
 * with a `legend` and native checkboxes. That is the pattern the design system's `Field`
 * explicitly declines to cover, and it is what makes the group announce itself as
 * "Material, group" rather than as four unrelated boxes.
 */
@Component({
  selector: 'app-category-filters',
  imports: [Button],
  template: `
    <section aria-labelledby="category-filters-heading" data-testid="category-filters">
      <div class="flex items-baseline justify-between gap-3">
        <h2 id="category-filters-heading" class="text-sm font-semibold text-slate-900" i18n="@@catalog.filters.heading">
          Filter
        </h2>

        @if (anySelected()) {
          <button
            yob-button
            variant="quiet"
            size="sm"
            type="button"
            (click)="clearAll.emit()"
            data-testid="filters-clear-all"
            i18n="@@catalog.filters.clearAll"
          >
            Clear all
          </button>
        }
      </div>

      <div class="mt-3 flex flex-col gap-5">
        @for (filter of filters(); track filter.key) {
          <fieldset data-testid="filter-group" [attr.data-filter]="filter.key">
            <div class="flex items-baseline justify-between gap-3">
              <legend class="text-sm font-medium text-slate-900" data-testid="filter-label">
                {{ filter.label }}
              </legend>

              @if (selectedCount(filter.key) > 0) {
                <button
                  yob-button
                  variant="quiet"
                  size="sm"
                  type="button"
                  [attr.aria-label]="clearFilterLabel(filter.label)"
                  (click)="clearFilter.emit(filter.key)"
                  data-testid="filter-clear"
                  [attr.data-filter]="filter.key"
                  i18n="@@catalog.filters.clear"
                >
                  Clear
                </button>
              }
            </div>

            <div class="mt-2 flex flex-col gap-1.5">
              @for (value of filter.values; track value.key) {
                <label class="flex min-h-11 items-center gap-2 text-sm text-slate-700 sm:min-h-0 sm:py-1">
                  <input
                    type="checkbox"
                    class="size-4 rounded border-slate-300"
                    [checked]="isChecked(filter.key, value.key)"
                    (change)="toggle.emit({ filterKey: filter.key, valueKey: value.key })"
                    data-testid="filter-value"
                    [attr.data-filter]="filter.key"
                    [attr.data-value]="value.key"
                  />
                  <span>{{ value.label }}</span>
                </label>
              }
            </div>
          </fieldset>
        }
      </div>
    </section>
  `,
})
export class CategoryFilters {
  /** The backend projection for this category, in its own order. */
  readonly filters = input.required<readonly StorefrontFilterDto[]>();
  /** What is currently chosen, owned by the page and reflected in the URL. */
  readonly selection = input.required<StorefrontFilterSelection>();

  /** One value was ticked or unticked. The page decides what that means. */
  readonly toggle = output<{ filterKey: string; valueKey: string }>();
  readonly clearFilter = output<string>();
  readonly clearAll = output<void>();

  protected readonly anySelected = computed(() => hasSelection(this.selection()));

  protected isChecked(filterKey: string, valueKey: string): boolean {
    return isValueSelected(this.selection(), filterKey, valueKey);
  }

  protected selectedCount(filterKey: string): number {
    return this.selection()[filterKey]?.length ?? 0;
  }

  /**
   * A filter-specific accessible name for its Clear button.
   *
   * Every one of them reads "Clear", so without this a screen-reader user hears a column
   * of identical buttons with no way to tell which filter each belongs to.
   */
  protected clearFilterLabel(label: string): string {
    return $localize`:@@catalog.filters.clear.label:Clear ${label}:filter: filter`;
  }
}
