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
      class="group flex h-full w-full flex-col rounded-lg border border-slate-200
             transition-shadow hover:shadow-md"
      data-testid="category-card"
    >
      <!-- Fixed ratio so a row of categories lines up with or without thumbnails. The
           placeholder is decorative: the name below already identifies the category, so
           an empty alt keeps a screen reader from announcing it twice. -->
      <div class="aspect-4/3 w-full overflow-hidden rounded-t-lg bg-slate-50">
        @if (category().thumbnail; as thumbnail) {
          <img
            [src]="thumbnail"
            alt=""
            class="h-full w-full object-cover transition-transform duration-200
                   group-hover:scale-[1.02]"
          />
        } @else {
          <div class="h-full w-full" aria-hidden="true"></div>
        }
      </div>

      <!-- break-words keeps an unbroken 60-character category name inside the card
           instead of widening the grid column and scrolling the page sideways. -->
      <span class="flex flex-1 items-start p-4 text-sm font-medium break-words text-slate-900">
        {{ category().title }}
      </span>
    </a>
  `,
})
export class CategoryCard {
  readonly category = input.required<CategoryLink>();
}
