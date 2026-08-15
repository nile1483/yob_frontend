import { Component, booleanAttribute, computed, input } from '@angular/core';

import { Spinner } from '../spinner/spinner';

/** How much weight a button carries on the page. */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'destructive'
  | 'quiet'
  | 'quiet-destructive';

/** Physical size. `sm` is for actions that sit inside a row rather than under a form. */
export type ButtonSize = 'md' | 'sm';

/**
 * The application's button styling and busy state, applied to a real `<button>`.
 *
 * ```html
 * <button yob-button type="submit" [loading]="signingIn()">Sign in</button>
 * <button yob-button variant="secondary" type="button">Add new address</button>
 * <button yob-button variant="destructive" size="sm" type="button">Remove</button>
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
 * ## Variants exist because real screens needed them (Phase 17)
 *
 * This component carried one treatment until Phase 17, on the rule that a second gets
 * added when a screen actually needs it. Three did, and the single treatment was
 * actively misleading by then:
 *
 * - the cart rendered **Remove** at the same weight as **Proceed to checkout**
 * - checkout rendered three **Add new address/contact** buttons heavier than
 *   **Proceed to payment**, which is the entire point of the page
 * - account had given up and hand-written `secondary` and `destructive` class strings
 *   as page fields, which is the duplication a design layer exists to prevent
 *
 * So there are exactly four, chosen by what an action *means* rather than how it should
 * look: one primary action per view, `secondary` for supporting actions, `destructive`
 * for actions that remove something, and `quiet` for actions that must be available
 * without competing for attention. Sizes are two, and no more: `md` under a form,
 * `sm` inside a list row.
 *
 * There is no `colour` or `width` input. Restyling means editing the classes below,
 * which is the point of a master project meant to be copied.
 */
@Component({
  selector: 'button[yob-button]',
  imports: [Spinner],
  host: {
    // Single writer to the DOM property: `disabled` is an input, so a caller's
    // `[disabled]` binds the input rather than racing this host binding.
    '[disabled]': 'isDisabled()',
    '[attr.aria-busy]': 'loading() ? "true" : null',
    '[class]': 'classes()',
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

  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');

  /** A loading button is also a disabled one - it must not fire twice. */
  protected readonly isDisabled = computed(() => this.disabled() || this.loading());

  protected readonly classes = computed(() => `${BASE} ${SIZES[this.size()]} ${VARIANTS[this.variant()]}`);
}

// `min-h` rather than padding alone: a 44px target is the floor for a thumb, and
// padding stops guaranteeing it the moment a caller shortens the label to one word.
const BASE = `inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium
              transition-colors disabled:cursor-not-allowed disabled:opacity-50`;

const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 py-2',
  sm: 'min-h-9 px-3 py-1.5',
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700 disabled:hover:bg-slate-900',
  secondary: `border border-slate-300 bg-white text-slate-900
              hover:border-slate-400 hover:bg-slate-50 disabled:hover:bg-white`,
  // Red on the border and text, not a filled red block: a delete is a normal thing to
  // want, and a wall of red buttons in a list reads as a page full of errors.
  destructive: `border border-red-300 bg-white text-red-700
                hover:border-red-400 hover:bg-red-50 disabled:hover:bg-white`,
  quiet: 'text-slate-700 underline underline-offset-4 hover:text-slate-900',
  // Destructive, but weightless: the colour still says what the action does while the
  // control itself stops competing with the ordinary actions beside it.
  'quiet-destructive': 'text-red-700 underline underline-offset-4 hover:text-red-800',
};
