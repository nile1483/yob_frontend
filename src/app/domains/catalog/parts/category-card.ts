import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { CategoryLink } from '../contracts/catalog.types';

/**
 * A navigable category tile.
 *
 * Used for both top-level categories and subcategories, which is why it takes the
 * mapped `CategoryLink` rather than either DTO.
 *
 * The whole tile is a real `<a routerLink>`, not a div with a click handler: that is
 * what makes it focusable, keyboard-activatable, middle-clickable and
 * open-in-new-tab-able without a line of code.
 */
@Component({
  selector: 'app-category-card',
  imports: [RouterLink],
  host: { class: 'contents' },
  template: `
    <a
      [routerLink]="['/catalog', category().slug]"
      class="flex h-full flex-col gap-3 rounded-lg border border-slate-200 p-4
             transition-colors hover:border-slate-400"
      data-testid="category-card"
    >
      @if (category().thumbnail; as thumbnail) {
        <img [src]="thumbnail" alt="" class="aspect-4/3 w-full rounded-md object-cover" />
      } @else {
        <!-- Decorative placeholder: the name below already identifies the category,
             so an empty alt keeps a screen reader from announcing it twice. -->
        <div class="aspect-4/3 w-full rounded-md bg-slate-100" aria-hidden="true"></div>
      }

      <!-- break-words keeps an unbroken 60-character category name inside the card
           instead of widening the grid column and scrolling the page sideways. -->
      <span class="text-base font-medium break-words text-slate-900">
        {{ category().title }}
      </span>
    </a>
  `,
})
export class CategoryCard {
  readonly category = input.required<CategoryLink>();
}
