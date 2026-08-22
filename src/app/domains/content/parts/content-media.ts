import { Component, computed, input } from '@angular/core';

import { mediaUrl } from '../../../foundation/media/media-url';

/**
 * One responsive content image, with the heights the merchant configured.
 *
 * ## Why not `app-media`
 *
 * The design system's `Media` is built for product and category imagery: a fixed aspect
 * ratio, a placeholder, a known set of shapes. Content banners are the opposite - the
 * merchant sets an explicit pixel height per breakpoint, and there are two source files
 * rather than one. Bending `Media` to take a pair of sources and a numeric height would
 * make every catalogue card carry that complexity to describe a case it never has.
 *
 * What is **not** re-implemented is URL resolution: `mediaUrl()` is the one place a
 * stored path becomes a URL, and it is used here exactly as it is everywhere else.
 *
 * ## Why not `NgOptimizedImage` either
 *
 * The project's rule is to use it for ordinary static and product images, and this is
 * neither. It has no `<picture>`/`<source>` support - the art-directed two-asset case it
 * would have to serve here - and its `fill` mode requires a positioned direct parent,
 * which `<picture>` is not. A plain `<img>` with `loading` and `decoding` set is the
 * correct tool for a merchant banner whose height the merchant has already fixed.
 *
 * ## Two files, one picture
 *
 * `<picture>` with a `source` for the wide breakpoint: the browser picks before it
 * fetches, so a phone never downloads the desktop asset. With only one asset configured
 * that asset is used at both sizes - the sensible fallback, and better than a blank frame
 * on the breakpoint the merchant did not fill in.
 *
 * ## Heights are bounded, not passed through
 *
 * A height arrives as an integer and is clamped before it reaches a style. Nothing from
 * the backend becomes CSS text: the merchant controls how tall, the source controls
 * everything else about how it looks.
 */
@Component({
  selector: 'app-content-media',
  imports: [],
  template: `
    @if (desktopSrc(); as desktop) {
      <picture class="block h-full w-full">
        @if (mobileSrc(); as mobile) {
          <source [srcset]="desktop" media="(min-width: 640px)" />
        }
        <img
          [src]="mobileSrc() ?? desktop"
          [alt]="alt()"
          loading="lazy"
          decoding="async"
          class="h-full w-full object-cover"
          data-testid="content-image"
          [attr.data-desktop]="desktop"
          [attr.data-mobile]="mobileSrc()"
        />
      </picture>
    }
  `,
  host: { class: 'block' },
})
export class ContentMedia {
  readonly desktopImage = input.required<string | null>();
  readonly mobileImage = input.required<string | null>();
  readonly alt = input('');

  /** Resolved through the one media helper, never re-implemented here. */
  protected readonly desktopSrc = computed(
    () => mediaUrl(this.desktopImage()) ?? mediaUrl(this.mobileImage()),
  );
  protected readonly mobileSrc = computed(() => mediaUrl(this.mobileImage()));

  /** Kept for callers that set a per-breakpoint height; the frame applies it. */
  readonly mobileHeightPx = input<number | null>(null);
  protected readonly mobileHeight = computed(() => boundedHeight(this.mobileHeightPx()));
}

/**
 * A merchant height, kept inside what a page can survive.
 *
 * Bounded rather than trusted: a mistyped 40000 would push every block below it off the
 * screen, and a 2 would render a sliver. `null` means "no configured height", and the
 * caller falls back to its own layout.
 */
export function boundedHeight(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(Math.max(Math.round(value), MIN_HEIGHT_PX), MAX_HEIGHT_PX);
}

const MIN_HEIGHT_PX = 80;
const MAX_HEIGHT_PX = 900;
