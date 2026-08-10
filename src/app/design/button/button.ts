import { Component, booleanAttribute, computed, input } from '@angular/core';

import { Spinner } from '../spinner/spinner';

/**
 * The application's button styling and busy state, applied to a real `<button>`.
 *
 * ```html
 * <button yob-button type="submit" [loading]="signingIn()">Sign in</button>
 * ```
 *
 * ## Why an attribute-selector component rather than a directive
 *
 * The host element *is* the `<button>`, so every native attribute and API keeps
 * working untouched: `type`, `form`, `formaction`, `name`, `value`, `autofocus`,
 * `(click)`, implicit form submission, and the browser's own keyboard handling.
 * Nothing here reimplements any of it, and there is no wrapper element - so no
 * `display: contents` workaround and no invisible strip that could swallow a click.
 *
 * A directive would preserve all of that too, but a directive has no template, so the
 * loading spinner would have to be hand-written at every call site. A component with
 * an attribute selector keeps the native element *and* can project content around it.
 * That is the only reason it is a component.
 *
 * ## Native semantics are preserved, including the sharp edge
 *
 * `type` is deliberately **not** an input. A bare `<button yob-button>` inside a form
 * therefore submits it, exactly as plain HTML does. That is the native default, and
 * shadowing it with a friendlier one would mean this button behaved differently from
 * every other button on the page.
 *
 * ## One treatment
 *
 * No `variant`, `size`, `colour` or `width` inputs. Restyling means editing the
 * classes below, which is the point of a master project meant to be copied. A second
 * treatment gets added when a real screen needs one.
 */
@Component({
  selector: 'button[yob-button]',
  imports: [Spinner],
  host: {
    // Single writer to the DOM property: `disabled` is an input, so a caller's
    // `[disabled]` binds the input rather than racing this host binding.
    '[disabled]': 'isDisabled()',
    '[attr.aria-busy]': 'loading() ? "true" : null',
    class: `inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2
            text-sm font-medium text-white transition-colors
            hover:bg-slate-700
            disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-slate-900`,
  },
  template: `
    @if (loading()) {
      <!-- Decorative: aria-busy on the button already announces the wait. -->
      <app-spinner label="" />
    }
    <ng-content />
  `,
})
export class Button {
  /**
   * Disables the button.
   *
   * `booleanAttribute` so the bare HTML form works: `<button yob-button disabled>`.
   */
  readonly disabled = input(false, { transform: booleanAttribute });

  /**
   * Shows a spinner, marks the button busy, and blocks interaction.
   *
   * The label stays visible rather than being replaced, so the button does not change
   * width mid-click and shift whatever sits next to it.
   */
  readonly loading = input(false, { transform: booleanAttribute });

  /** A loading button is also a disabled one - it must not fire twice. */
  protected readonly isDisabled = computed(() => this.disabled() || this.loading());
}
