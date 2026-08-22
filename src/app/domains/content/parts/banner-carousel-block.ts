import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';

import { ContentMedia, boundedHeight } from './content-media';
import { DestinationLink } from './destination-link';
import type { BannerCarouselBlockDto } from '../contracts/page.types';

/**
 * The merchant's ordered slides.
 *
 * ## Hand-written, and small
 *
 * No carousel library. This needs one visible slide, two buttons and an optional timer;
 * a dependency for that would ship a router-agnostic gesture engine to solve three
 * `@if`s, and would bring its own opinions about focus and markup that the design system
 * would then have to fight.
 *
 * ## Autoplay stops when a person is using it
 *
 * A slide that moves under a buyer mid-click is a defect, so the timer stops on hover, on
 * focus anywhere inside the carousel, and permanently once the buyer presses a control:
 * they have said which slide they want, and a timer that overrides that is arguing with
 * them. It also never starts when the operating system asks for reduced motion, which is
 * the one preference this component can honour without a design-system animation layer.
 *
 * The interval is the backend's, clamped: a merchant typo of `50` would otherwise strobe.
 *
 * ## Accessibility
 *
 * Real buttons with names that say which direction and where they lead, a live region
 * announcing the position, and the whole thing is a labelled group. Keyboard support is
 * whatever buttons already have, which is the point of using them.
 */
@Component({
  selector: 'app-banner-carousel-block',
  imports: [ContentMedia, DestinationLink],
  host: {
    '(mouseenter)': 'pause()',
    '(mouseleave)': 'resume()',
    '(focusin)': 'pause()',
    '(focusout)': 'resume()',
  },
  template: `
    <section
      class="relative"
      role="group"
      [attr.aria-roledescription]="carouselLabel"
      [attr.aria-label]="block().block_name"
      data-testid="block-banner-carousel"
      [attr.data-block-name]="block().block_name"
      [attr.data-autoplay]="block().auto_play"
      [attr.data-interval]="intervalMs()"
    >
      @if (current(); as slide) {
        <app-destination-link
          [destination]="slide.destination"
          [label]="slide.title ?? slide.alt_text ?? ''"
          linkClass="block overflow-hidden rounded-lg"
        >
          <div
            class="relative w-full"
            [style.height.px]="desktopHeight()"
            data-testid="carousel-slide"
            [attr.data-index]="index()"
            [attr.data-title]="slide.title"
          >
            <app-content-media
              [desktopImage]="slide.desktop_image"
              [mobileImage]="slide.mobile_image"
              [alt]="slide.alt_text ?? ''"
              [mobileHeightPx]="block().mobile_height_px"
            />
          </div>
        </app-destination-link>

        @if (slide.title; as title) {
          <p class="mt-2 text-sm font-medium text-slate-900" data-testid="carousel-title">{{ title }}</p>
        }
      }

      @if (hasSeveral()) {
        <div class="mt-3 flex items-center gap-2">
          <button
            type="button"
            class="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            [attr.aria-label]="previousLabel"
            (click)="previous()"
            data-testid="carousel-previous"
          >
            &#8592;
          </button>
          <button
            type="button"
            class="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            [attr.aria-label]="nextLabel"
            (click)="next()"
            data-testid="carousel-next"
          >
            &#8594;
          </button>

          <!-- Announced on change, so the position is available without sight of the
               images themselves. -->
          <p class="text-sm text-slate-600" aria-live="polite" data-testid="carousel-position">
            {{ position() }}
          </p>
        </div>
      }
    </section>
  `,
})
export class BannerCarouselBlock {
  readonly block = input.required<BannerCarouselBlockDto>();

  protected readonly carouselLabel = $localize`:@@content.carousel.roledescription:carousel`;
  protected readonly previousLabel = $localize`:@@content.carousel.previous:Previous slide`;
  protected readonly nextLabel = $localize`:@@content.carousel.next:Next slide`;

  private readonly indexSignal = signal(0);
  protected readonly index = this.indexSignal.asReadonly();

  private readonly slides = computed(() => this.block().slides);
  protected readonly hasSeveral = computed(() => this.slides().length > 1);
  protected readonly current = computed(() => this.slides()[this.index()] ?? null);

  protected readonly desktopHeight = computed(() => boundedHeight(this.block().desktop_height_px));

  protected readonly position = computed(
    () =>
      $localize`:@@content.carousel.position:Slide ${this.index() + 1}:current: of ${this.slides().length}:total:`,
  );

  /** The backend's interval, clamped so a typo cannot strobe or stall. */
  protected readonly intervalMs = computed(() => {
    const configured = this.block().interval_ms;
    if (configured === null || !Number.isFinite(configured)) {
      return DEFAULT_INTERVAL_MS;
    }
    return Math.min(Math.max(configured, MIN_INTERVAL_MS), MAX_INTERVAL_MS);
  });

  /** Paused while a person is pointing at or inside the carousel. */
  private readonly pausedSignal = signal(false);
  /** Stopped for good once they have chosen a slide themselves. */
  private readonly takenOverSignal = signal(false);

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      const shouldRun =
        this.block().auto_play &&
        this.hasSeveral() &&
        !this.pausedSignal() &&
        !this.takenOverSignal() &&
        !prefersReducedMotion();

      this.stopTimer();
      if (shouldRun) {
        this.timer = setInterval(() => this.advance(1), this.intervalMs());
      }
    });

    inject(DestroyRef).onDestroy(() => this.stopTimer());
  }

  protected next(): void {
    this.takenOverSignal.set(true);
    this.advance(1);
  }

  protected previous(): void {
    this.takenOverSignal.set(true);
    this.advance(-1);
  }

  protected pause(): void {
    this.pausedSignal.set(true);
  }

  protected resume(): void {
    this.pausedSignal.set(false);
  }

  /** Wraps in both directions, so neither control is ever a dead end. */
  private advance(step: number): void {
    const total = this.slides().length;
    if (total === 0) {
      return;
    }
    this.indexSignal.update((current) => (current + step + total) % total);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

const DEFAULT_INTERVAL_MS = 5000;
const MIN_INTERVAL_MS = 2000;
const MAX_INTERVAL_MS = 30000;

/** Honoured when the platform exposes it; absent in a test DOM, which simply means no. */
function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
