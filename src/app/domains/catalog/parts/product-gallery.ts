import { Component, computed, input, linkedSignal } from '@angular/core';

import { Media } from '../../../design/media/media';
import type { ProductGalleryImageDto } from '../contracts/catalog.types';

/**
 * The product page's merchandising image area: one large preview and a thumbnail strip.
 *
 * ```html
 * <app-product-gallery
 *   [gallery]="gallery()"
 *   [fallbackImage]="fallbackImage()"
 *   [productName]="productName()"
 *   [ownerKey]="itemSlug()"
 * />
 * ```
 *
 * ## What it belongs to, and what it deliberately ignores
 *
 * The gallery belongs to the **public storefront entity**: a simple Item, or the template
 * of a variant family. A generated variant child owns no gallery, and `resolve_variant`
 * carries none - so this component is never told about a resolved SKU at all. That is the
 * enforcement, not a convention: choosing Orange/Medium cannot reset the preview here,
 * because nothing about the resolved variant is an input.
 *
 * The page keeps the other half of that split. Selecting a variant still changes the item
 * code, the price, the UOM, the stock and the availability - everything transactional -
 * and changes nothing a buyer is looking at in this column.
 *
 * ## Order and primacy are different questions
 *
 * `is_primary` decides which image the page **opens on**. It does not move that image to
 * the front of the strip. A gallery ordered Side / Front / Back with Front primary shows
 * thumbnails in exactly that order and opens on the second one. Nothing here sorts: the
 * contract publishes no sort key, and inventing one would rewrite a merchant's
 * arrangement.
 *
 * ## No requests, ever
 *
 * This component injects nothing. The gallery arrived with `get_item`, so changing a
 * thumbnail is a signal write and nothing else - no fetch, no navigation, no resolution,
 * and no state outside this component.
 *
 * ## Not a carousel
 *
 * Deliberately not the Phase 25 `BannerCarousel` and not `ContentMedia`. There is no
 * autoplay, no timer, no pagination dots, no merchant-set height and no art-directed
 * second asset. This is a picker for one product's photographs; a banner is a merchant's
 * advertisement. Sharing an implementation would give each the other's problems.
 */
@Component({
  selector: 'app-product-gallery',
  imports: [Media],
  template: `
    <div class="flex flex-col gap-3" data-testid="product-gallery">
      <!-- One large image in the DOM, never a stack of hidden heroes. Media owns the
           fixed box, the missing-image placeholder and the broken-image fallback, so a
           gallery row that fails to load looks exactly like a product with no photograph
           and the other thumbnails stay selectable. -->
      <app-media
        class="overflow-hidden rounded-lg border border-slate-200"
        [src]="activeImage()"
        [alt]="activeAlt()"
        ratio="gallery"
        [priority]="true"
        sizes="(min-width: 768px) 50vw, 100vw"
        testId="item-image"
      />

      @if (activeCaption(); as caption) {
        <!-- Rendered only when there is something to say. An always-present caption row
             would reserve empty space under every product that has no captions. -->
        <p class="text-sm text-slate-600" data-testid="product-gallery-caption">{{ caption }}</p>
      }

      @if (hasThumbnails()) {
        <!-- Scrolls inside its own box rather than widening the page. overflow-x-auto
             on this strip is what keeps a 12-image gallery from pushing the product
             column - and therefore the document - sideways. -->
        <ul
          class="-mx-1 flex list-none gap-2 overflow-x-auto px-1 pb-1"
          data-testid="product-gallery-thumbs"
        >
          @for (row of gallery(); track $index) {
            <li class="shrink-0">
              <!-- A real button: it changes what the page shows, it is reachable by
                   keyboard, and aria-pressed is what tells a screen reader which one is
                   current. A clickable &lt;div&gt; would give none of that. -->
              <button
                type="button"
                [attr.aria-pressed]="$index === activeIndex()"
                [attr.aria-label]="thumbnailLabel($index)"
                [class]="thumbnailClass($index)"
                (click)="select($index)"
                data-testid="product-gallery-thumb"
                [attr.data-index]="$index"
                [attr.data-selected]="$index === activeIndex()"
              >
                <!-- Not priority: only the large preview above is worth the queue.
                     Media lazy-loads by default, so a long strip costs nothing until
                     it is scrolled. -->
                <app-media
                  class="w-16 sm:w-20"
                  [src]="row.image"
                  alt=""
                  ratio="thumb"
                  fit="cover"
                  sizes=""
                />
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class ProductGallery {
  /** The owner's gallery, in the backend's order. Empty is ordinary. */
  readonly gallery = input.required<readonly ProductGalleryImageDto[]>();

  /**
   * The product's own `image`, shown when the gallery is empty.
   *
   * The **page product's** image - the simple Item's, or the template's. Never a resolved
   * variant's: the caller must not pass one, and the merchandising area has no business
   * showing a child's photograph in place of its owner's.
   *
   * It is a fallback, not a gallery row. It is never appended to `gallery`, never given a
   * thumbnail, and never counted in "image 1 of n".
   */
  readonly fallbackImage = input.required<string | null>();

  /** The page product's name, used as alt text when a row supplies none. */
  readonly productName = input.required<string>();

  /**
   * Identity of the thing being merchandised - the page product's slug.
   *
   * The reset trigger, and the reason it is an input rather than something inferred:
   * selection must start again for a **different product**, and must survive everything
   * else. Navigating A -> B opens B on its own primary; resolving a variant of A changes
   * this not at all, so the buyer's chosen image stays chosen.
   */
  readonly ownerKey = input.required<string>();

  /**
   * Which row the page opens on: the primary, or the first.
   *
   * `findIndex` takes the first primary if a misconfiguration ever produced two, which is
   * the harmless reading. `-1` - no primary at all - means the first row, which is also
   * what an empty gallery resolves to and is why the index is clamped below.
   */
  private readonly initialIndex = computed(() => {
    const primary = this.gallery().findIndex((row) => row.is_primary);
    return primary === -1 ? 0 : primary;
  });

  /**
   * The buyer's chosen row.
   *
   * A `linkedSignal` so that a click sticks, but a **new owner** starts over. The source
   * names both triggers explicitly rather than relying on what the computation happens to
   * read: a different product, or a different opening image for the same product.
   *
   * What is deliberately absent from that source is any notion of a resolved variant.
   * There is no expression here that could observe one.
   */
  private readonly selectedIndex = linkedSignal<{ owner: string; initial: number }, number>({
    source: () => ({ owner: this.ownerKey(), initial: this.initialIndex() }),
    computation: (source) => source.initial,
  });

  /** The selection, kept inside the gallery it indexes. */
  protected readonly activeIndex = computed(() => {
    const rows = this.gallery();
    if (rows.length === 0) {
      return 0;
    }
    return Math.min(Math.max(this.selectedIndex(), 0), rows.length - 1);
  });

  protected readonly activeRow = computed(() => this.gallery()[this.activeIndex()] ?? null);

  /** The gallery row's image, or the product's own when there is no gallery. */
  protected readonly activeImage = computed(
    () => this.activeRow()?.image ?? this.fallbackImage(),
  );

  /**
   * What the large image is described as.
   *
   * The row's own `alt_text` when the merchant wrote one, the product's name otherwise.
   * This image is the subject of the page, so it is never decorative and never left
   * empty - and never the item code, which describes a record rather than a picture.
   */
  protected readonly activeAlt = computed(() => text(this.activeRow()?.alt_text) ?? this.productName());

  /** The active row's caption, when it has one worth showing. */
  protected readonly activeCaption = computed(() => text(this.activeRow()?.caption));

  /**
   * Whether the strip is worth drawing.
   *
   * One image needs no picker - the preview above already is the gallery, and a
   * single-item strip would be a control that changes nothing. A fallback product image
   * gets no thumbnail either: it is not a gallery row, and drawing one would imply a
   * gallery the merchant never configured.
   */
  protected readonly hasThumbnails = computed(() => this.gallery().length > 1);

  protected select(index: number): void {
    this.selectedIndex.set(index);
  }

  /**
   * A thumbnail's accessible name: position, total, and what it shows.
   *
   * Position and total because a strip of photographs is otherwise a row of unlabelled
   * buttons; the row's own words after that, falling back to the product's name so the
   * button is never announced as bare punctuation.
   */
  protected thumbnailLabel(index: number): string {
    const row = this.gallery()[index];
    const name = text(row?.alt_text) ?? text(row?.caption) ?? this.productName();
    const position = index + 1;
    const total = this.gallery().length;

    return $localize`:@@product.gallery.thumbnail:View image ${position}:position: of ${total}:total: - ${name}:name:`;
  }

  /** Selected state, in the tokens this repository already uses for a chosen control. */
  protected thumbnailClass(index: number): string {
    const base =
      'block overflow-hidden rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2';

    return index === this.activeIndex()
      ? `${base} border-slate-900 ring-1 ring-slate-900`
      : `${base} border-slate-200 hover:border-slate-400`;
  }
}

/**
 * A nullable merchant string, or `null` when there is nothing in it.
 *
 * Whitespace counts as nothing: a caption of `"  "` must not reserve a row, and an
 * `alt_text` of `" "` must not win over the product's name. One place decides that, so
 * the two cannot drift.
 */
function text(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}
