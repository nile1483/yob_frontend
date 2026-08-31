import { Component, input, output } from '@angular/core';

import type { BrowseCategoryDto } from '../contracts/catalog.types';

/**
 * The `/products` category chip row: `All`, then every listable category.
 *
 * ```html
 * <app-product-browse-category-chips
 *   [categories]="browseCategories()"
 *   [activeSlug]="category()"
 *   (select)="selectCategory($event)"
 * />
 * ```
 *
 * ## `All` is ours, and the rest are the backend's
 *
 * The backend publishes no `All` row, because "all" is the **absence** of a scope rather
 * than a category a merchant configured. So the storefront draws it, and selecting it
 * emits `null` - which the page turns into a `get_items` call with no `scope_value` at
 * all, never into a slug of its own.
 *
 * Every other chip is a row the backend already reduced to a valid listing target:
 * disabled, unslugged and group categories never arrive, so a chip cannot lead to
 * `category_not_listable`.
 *
 * ## Flat, deliberately
 *
 * Rows come at any depth, and `parent_category` may name a category that is not in the
 * list at all. Nothing here reconstructs a tree, indents by `level`, groups by parent or
 * offers a dropdown: they are flat selectable controls, and selecting one means exactly
 * that category's own listing. There is no descendant aggregation, because `get_items`
 * has none.
 *
 * Order is the backend's. The contract publishes `display_order` and `level`; sorting by
 * either here would second-guess the order the response already arrived in.
 *
 * ## It decides nothing
 *
 * A chip row emits which chip was pressed. What that means for filters, search, the
 * cursor or the listing is the page's business - this component holds no catalogue rule
 * and issues no request.
 */
@Component({
  selector: 'app-product-browse-category-chips',
  imports: [],
  template: `
    <!-- One row that scrolls inside its own box. overflow-x-auto here is what keeps a
         long category list from widening the document on a phone; the negative margin
         and matching padding let the first and last chip's focus ring breathe without
         the scroll area clipping it. -->
    <div
      class="-mx-1 flex gap-2 overflow-x-auto px-1 py-1"
      role="group"
      [attr.aria-label]="groupLabel"
      data-testid="browse-category-chips"
    >
      <button
        type="button"
        [attr.aria-pressed]="activeSlug() === null"
        [class]="chipClass(activeSlug() === null)"
        (click)="select.emit(null)"
        data-testid="browse-chip"
        data-slug="__all__"
        [attr.data-active]="activeSlug() === null"
      >
        {{ allLabel }}
      </button>

      @for (category of categories(); track category.name) {
        <button
          type="button"
          [attr.aria-pressed]="activeSlug() === category.slug"
          [class]="chipClass(activeSlug() === category.slug)"
          (click)="select.emit(category.slug)"
          data-testid="browse-chip"
          [attr.data-slug]="category.slug"
          [attr.data-level]="category.level"
          [attr.data-active]="activeSlug() === category.slug"
        >
          {{ category.category_name }}
        </button>
      }
    </div>
  `,
})
export class ProductBrowseCategoryChips {
  /** The backend's rows, in the backend's order. */
  readonly categories = input.required<readonly BrowseCategoryDto[]>();

  /** The selected category's slug, or `null` while `All` is active. */
  readonly activeSlug = input.required<string | null>();

  /** The chosen slug, or `null` for `All`. */
  readonly select = output<string | null>();

  protected readonly allLabel = $localize`:@@products.browse.all:All`;
  protected readonly groupLabel = $localize`:@@products.browse.categories:Product categories`;

  /** Selected state, in the tokens the attribute chips on the product page already use. */
  protected chipClass(active: boolean): string {
    const base =
      'shrink-0 rounded-full border px-4 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2';

    return active
      ? `${base} border-slate-900 bg-slate-900 font-medium text-white`
      : `${base} border-slate-300 bg-white text-slate-900 hover:border-slate-500`;
  }
}
