import { Component, computed, input } from '@angular/core';

import { ContentMedia, boundedHeight } from './content-media';
import { DestinationLink } from './destination-link';
import type { PromoGridBlockDto } from '../contracts/page.types';

/**
 * Promotional content cards.
 *
 * **Merchandising, not money.** A promo card is an image, some words and a destination;
 * it carries no price, no discount and no offer semantics, and nothing here consults a
 * Pricing Rule. A card that says "20% off" says it because a merchant typed it into a
 * title, which is content.
 *
 * Order is the backend's `idx` and is rendered as received.
 *
 * `cards_per_row` is a merchant setting, so it is mapped through a fixed table rather
 * than concatenated into a class: `grid-cols-${n}` would let a bad value emit a class
 * this project never wrote, and Tailwind would not have compiled it anyway. Anything
 * outside the supported set falls back to three.
 */
@Component({
  selector: 'app-promo-grid-block',
  imports: [ContentMedia, DestinationLink],
  template: `
    <section data-testid="block-promo-grid" [attr.data-block-name]="block().block_name">
      <ul
        class="grid grid-cols-1 gap-4 sm:gap-5"
        [class]="columnsClass()"
        data-testid="promo-grid"
        [attr.data-cards-per-row]="block().cards_per_row"
      >
        @for (card of block().cards; track $index) {
          <li>
            <app-destination-link
              [destination]="card.destination"
              [label]="card.title ?? card.alt_text ?? ''"
              linkClass="group block overflow-hidden rounded-lg border border-slate-200"
            >
              <div
                class="relative w-full"
                [style.height.px]="cardHeight()"
                data-testid="promo-card"
                [attr.data-title]="card.title"
              >
                <app-content-media
                  [desktopImage]="card.desktop_image"
                  [mobileImage]="card.mobile_image"
                  [alt]="card.alt_text ?? ''"
                  [mobileHeightPx]="block().mobile_height_px"
                />
              </div>

              @if (card.title; as title) {
                <p class="px-3 py-2 text-sm font-medium text-slate-900" data-testid="promo-card-title">
                  {{ title }}
                </p>
              }
            </app-destination-link>
          </li>
        }
      </ul>
    </section>
  `,
})
export class PromoGridBlock {
  readonly block = input.required<PromoGridBlockDto>();

  protected readonly cardHeight = computed(() => boundedHeight(this.block().desktop_height_px));

  protected readonly columnsClass = computed(
    () => COLUMNS[this.block().cards_per_row ?? DEFAULT_COLUMNS] ?? COLUMNS[DEFAULT_COLUMNS] ?? '',
  );
}

const DEFAULT_COLUMNS = 3;

/**
 * The supported column counts, written out.
 *
 * Written out because Tailwind compiles the classes it can see: a template that built
 * `sm:grid-cols-${n}` would produce a class name that exists in the DOM and nowhere in
 * the stylesheet.
 */
const COLUMNS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};
