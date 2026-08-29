import { NgOptimizedImage } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';

import { mediaUrl } from '../../foundation/media/media-url';

/** The shape of the box, chosen by what the image is *for*. */
export type MediaRatio = 'product' | 'category' | 'square' | 'thumb' | 'hero' | 'gallery';

/**
 * How the image sits inside its box.
 *
 * `contain` shows the whole thing and lets the ground show around it. `cover` fills the
 * box and crops whatever does not fit.
 */
export type MediaFit = 'contain' | 'cover';

/**
 * A fixed-ratio image box: the storefront's one image standard.
 *
 * ```html
 * <app-media [src]="item().image" [alt]="item().item_name" ratio="product" />
 * <app-media [src]="category().thumbnail" alt="" ratio="category" fit="cover" />
 * ```
 *
 * ## The box is fixed, the image is not
 *
 * YOB is a multipurpose B2B storefront. A hardware supplier, a clothing wholesaler and a
 * chemical distributor will all bring their own photography, at whatever dimensions their
 * supplier gave them. So the **frontend owns the box and the behaviour, the business owns
 * the picture** - and no source image may change the layout around it.
 *
 * The container therefore has an aspect ratio of its own and the image is fitted into it.
 * Card height is then a function of the design, not of whatever a photographer shot,
 * which is what makes a grid of products line up at all.
 *
 * ## Why products default to `contain`
 *
 * The development photography is 2:3 portrait (1200x1800). Dropping that into the square
 * `cover` box this replaced cut away a third of every garment, top and bottom. On
 * apparel that removes collars and hems; on a fitting or a fastener it can remove the
 * thread that distinguishes one part from another.
 *
 * `cover` only looks acceptable when the source ratio happens to match the box, which is
 * a fact about one client's photo library, not a design decision the master project can
 * make. `contain` is dimension-agnostic: a portrait, a landscape and a square all arrive
 * whole and letterbox against the same quiet ground.
 *
 * Categories are the deliberate exception and default to `cover`: category imagery is
 * editorial rather than a thing being bought, cropping one loses no information, and a
 * filled box reads better in a navigation grid. Different purpose, different treatment -
 * they are not forced to share a ratio.
 *
 * ## No image, and broken images, look the same
 *
 * A missing image and a URL that fails to load are the same thing to a buyer: there is
 * no picture. Both render the neutral placeholder below, at exactly the same size, so
 * neither collapses the layout nor produces the browser's broken-image icon.
 *
 * The placeholder is a plain glyph on a tint. Deliberately not a stock photo and not a
 * category-suggesting illustration: a fallback that showed a t-shirt would be actively
 * wrong for a bearings catalog.
 *
 * ## NgOptimizedImage
 *
 * Used with `fill`, which suits a container whose size the design already fixes. What it
 * buys here is lazy loading by default, a real `fetchpriority` for the one image that
 * deserves it, and build-time enforcement that every image has a sized container - the
 * layout-shift guarantee, checked rather than hoped for.
 *
 * It does **not** buy resizing: `srcset` generation needs an `IMAGE_LOADER`, and this
 * phase deliberately introduces no image CDN. Full-size originals are therefore sent to
 * small cards, which is a real cost recorded in `docs/PROJECT-STATE.md` rather than
 * hidden - the fix is backend-rendered thumbnails or a loader, not markup.
 */
@Component({
  selector: 'app-media',
  imports: [NgOptimizedImage],
  host: { class: 'block' },
  template: `
    <div [class]="boxClass()" [attr.data-testid]="testId()">
      @if (resolved(); as url) {
        <img
          [ngSrc]="url"
          [alt]="alt()"
          fill
          [priority]="priority()"
          [sizes]="sizes() || undefined"
          [class]="imageClass()"
          (error)="onError()"
          [attr.data-testid]="testId() ? testId() + '-image' : null"
        />
      } @else {
        <!-- Decorative by construction: this is the *absence* of a picture, and the
             name or title beside it already identifies the record. Announcing it would
             tell a screen reader about a placeholder, which is not information. -->
        <div
          class="flex h-full w-full items-center justify-center"
          aria-hidden="true"
          [attr.data-testid]="testId() ? testId() + '-placeholder' : null"
        >
          <svg
            class="size-8 text-slate-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-4.5-4.5L3 21" />
          </svg>
        </div>
      }
    </div>
  `,
})
export class Media {
  /** The DTO field, exactly as the backend sent it. */
  readonly src = input<string | null | undefined>(null);

  /**
   * Describes the pictured thing, not the picture.
   *
   * Pass the product name. Pass `''` where the adjacent text already names it, which is
   * the usual case for a card whose title sits directly beneath. "Product image of X"
   * is never right: a screen reader already announces that it is an image.
   */
  readonly alt = input('');

  readonly ratio = input<MediaRatio>('product');
  readonly fit = input<MediaFit>('contain');

  /**
   * Load eagerly with high priority.
   *
   * For the one image that is genuinely the point of the page - the product on item
   * detail - and nothing else. Marking a grid of catalog thumbnails priority would
   * queue twenty full-size downloads ahead of the page itself.
   */
  readonly priority = input(false);

  /**
   * Passed to the browser so it can pick sensibly once a loader exists.
   *
   * Responsive units only - `NgOptimizedImage` rejects pixel values here, because a
   * fixed `sizes` defeats the automatic `srcset` it would otherwise generate. A fixed
   * box such as a cart thumbnail simply omits it.
   */
  readonly sizes = input('(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 50vw');

  readonly testId = input('');

  /** A URL that failed to load is treated exactly as no URL at all. */
  private readonly failed = signal(false);

  protected readonly resolved = computed(() => (this.failed() ? null : mediaUrl(this.src())));

  protected onError(): void {
    this.failed.set(true);
  }

  protected readonly boxClass = computed(
    () => `relative w-full overflow-hidden bg-slate-50 ${RATIOS[this.ratio()]}`,
  );

  protected readonly imageClass = computed(() =>
    this.fit() === 'cover' ? 'object-cover' : 'object-contain',
  );
}

const RATIOS: Record<MediaRatio, string> = {
  // Portrait, because most product photography is taller than it is wide and a portrait
  // box wastes the least ground when fitting one whole.
  product: 'aspect-3/4',
  category: 'aspect-4/3',
  square: 'aspect-square',
  thumb: 'aspect-square',
  // The item-detail image. Capped by viewport height rather than given a ratio: at a
  // 3:4 ratio a full-width column produced an image taller than the screen, which
  // pushed the price and Add to cart below the fold. Height is derived from the
  // viewport and never from the image, so this is still layout-shift free - the box is
  // the same size before the picture arrives as after.
  hero: 'h-[min(70vh,34rem)]',
  // The product gallery's large preview (Phase 27C). Shorter than `hero` for one
  // reason: a gallery is a preview *plus* a thumbnail strip, and the two together must
  // occupy roughly what the single hero image occupied - otherwise adding a gallery
  // would push the price and Add to cart down the page, which is the exact regression
  // `hero`'s own cap exists to prevent. ~26rem of preview and ~5rem of thumbnails lands
  // just under the 34rem it replaces.
  //
  // A separate key rather than a change to `hero`: the hero box is still correct for a
  // product with no gallery configured elsewhere, and every existing `hero` and `thumb`
  // caller is deliberately untouched by this phase.
  gallery: 'h-[min(52vh,26rem)]',
};
