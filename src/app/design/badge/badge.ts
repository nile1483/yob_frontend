import { Component, computed, input } from '@angular/core';

/** What a badge is saying, not what colour it should be. */
export type BadgeTone = 'neutral' | 'success' | 'info' | 'warning' | 'danger';

/**
 * A short status or attribute label.
 *
 * ```html
 * <app-badge tone="success">Completed</app-badge>
 * <app-badge tone="success">10% off</app-badge>
 * ```
 *
 * ## Colour carries meaning, so it is never the only carrier
 *
 * Every badge shows its own text. The tone reinforces that text - it never replaces it -
 * so the meaning survives greyscale, colour blindness and a printed page. Nothing in
 * the storefront should require distinguishing two pills by hue alone.
 *
 * Callers pass a **tone**, not a colour, so "which red" is decided once here rather than
 * per page. Before this existed, the order list rendered every status in the same grey:
 * `Cancelled` and `Completed` were visually identical, which is exactly the distinction
 * a buyer scans an order list for.
 *
 * Deliberately not a `<span class="badge">` utility class: keeping it a component means
 * the tone list is typed, so a page cannot invent `tone="purple"` and quietly add a
 * seventh colour to the storefront.
 */
@Component({
  selector: 'app-badge',
  host: { '[class]': 'classes()' },
  template: `<ng-content />`,
})
export class Badge {
  readonly tone = input<BadgeTone>('neutral');

  protected readonly classes = computed(
    () =>
      `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[this.tone()]}`,
  );
}

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-green-100 text-green-900',
  info: 'bg-blue-100 text-blue-900',
  warning: 'bg-amber-100 text-amber-900',
  danger: 'bg-red-100 text-red-900',
};
