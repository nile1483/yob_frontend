import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Media } from '../../../design/media/media';

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
  imports: [Media, RouterLink],
  host: { class: 'contents' },
  template: `
    <a
      [routerLink]="['/catalog', category().slug]"
      class="group flex h-full w-full flex-col rounded-lg border border-slate-200
             transition-shadow hover:shadow-md"
      data-testid="category-card"
    >
      <!-- Editorial imagery, so it fills the box and crops: nothing is being examined
           here, unlike a product. Empty alt because the title sits directly below. -->
      <app-media
        class="overflow-hidden rounded-t-lg"
        [src]="category().thumbnail"
        alt=""
        ratio="category"
        fit="cover"
        testId="category-media"
      />

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
