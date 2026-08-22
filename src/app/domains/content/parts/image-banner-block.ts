import { Component, computed, input } from '@angular/core';

import { ContentMedia, boundedHeight } from './content-media';
import { DestinationLink } from './destination-link';
import type { ImageBannerBlockDto } from '../contracts/page.types';

/**
 * A single merchant image, optionally linking somewhere.
 *
 * Heights come from the backend but pass through {@link boundedHeight} first, and are
 * applied as a height only - never as a style string. A banner with no configured height
 * falls back to the source's own aspect-driven layout rather than collapsing.
 *
 * Clickability is entirely the destination's business: with `null` the image is wrapped
 * in nothing, so it is not a link that goes nowhere.
 */
@Component({
  selector: 'app-image-banner-block',
  imports: [ContentMedia, DestinationLink],
  template: `
    <section data-testid="block-image-banner" [attr.data-block-name]="block().block_name">
      <app-destination-link
        [destination]="block().destination"
        [label]="block().alt_text ?? ''"
        linkClass="block overflow-hidden rounded-lg"
      >
        <div
          class="relative w-full"
          [style.height.px]="desktopHeight()"
          data-testid="banner-frame"
          [attr.data-desktop-height]="desktopHeight()"
          [attr.data-mobile-height]="mobileHeight()"
        >
          <app-content-media
            [desktopImage]="block().desktop_image"
            [mobileImage]="block().mobile_image"
            [alt]="block().alt_text ?? ''"
            [mobileHeightPx]="block().mobile_height_px"
          />
        </div>
      </app-destination-link>
    </section>
  `,
})
export class ImageBannerBlock {
  readonly block = input.required<ImageBannerBlockDto>();

  protected readonly desktopHeight = computed(() => boundedHeight(this.block().desktop_height_px));
  protected readonly mobileHeight = computed(() => boundedHeight(this.block().mobile_height_px));
}
