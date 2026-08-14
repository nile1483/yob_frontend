import { Component, ElementRef, inject, input, output } from '@angular/core';

import { Spinner } from '../../../design/spinner/spinner';

/** One selectable record, reduced to what a chooser needs to show. */
export interface ChoiceOption {
  /** The backend record `name`. Submitted verbatim; never displayed. */
  readonly value: string;
  /** The heading a person recognises the record by. */
  readonly label: string;
  /** Supporting lines - address parts, an email, a phone. Already filtered of blanks. */
  readonly details: readonly string[];
}

/**
 * A single-selection list of backend records.
 *
 * Contacts and addresses are the same interaction - pick one record from a short list,
 * or add a new one - and differ only in which fields become the label and the detail
 * lines. Mapping both to {@link ChoiceOption} means one keyboard implementation, one
 * grouping structure, and one place where the DOM/cart sync below is correct.
 *
 * ## Native radios, and nothing else
 *
 * A `fieldset` with a `legend` and plain `<input type="radio">`. Grouping, arrow-key
 * navigation, roving focus and screen-reader announcement of "3 of 4" all come from
 * the browser. There is no `role="radiogroup"`, no `keydown` handler and no CDK
 * dependency, because native radios already do every part of this correctly.
 *
 * `app-field` is deliberately not used: it wraps exactly one control and says so - a
 * group sharing one label is the `fieldset`/`legend` pattern instead.
 *
 * ## The radio shows the cart, not the click
 *
 * `checked` is bound to {@link selected}, which comes from the cart. But a click
 * changes the DOM itself, before any request is made - and if the server refuses the
 * choice, or a selection was already in flight and this one was dropped, the bound
 * value never changes, so Angular has nothing to re-apply. The list would sit there
 * showing a selection the cart does not have.
 *
 * So the handler immediately puts the radios back to `selected()` and *then* asks for
 * the change. A click is a request, not a result. If the server adopts it, `selected()`
 * changes and the binding moves the dot; if it does not, the dot never moved.
 *
 * This is also why there is no local "chosen" value here: the pending choice is not
 * stored anywhere, so it cannot drift from the cart.
 */
@Component({
  selector: 'app-choice-list',
  imports: [Spinner],
  template: `
    <fieldset [attr.aria-busy]="busy() ? 'true' : null" [attr.data-testid]="testId()">
      <legend class="text-base font-semibold text-slate-900">
        {{ legend() }}
        @if (busy()) {
          <span class="ml-2 align-middle" data-testid="choice-busy">
            <app-spinner label="Saving your selection" i18n-label="@@checkout.choice.saving" />
          </span>
        }
      </legend>

      @if (options().length === 0) {
        <p class="mt-3 text-sm text-slate-600" data-testid="choice-empty">{{ emptyText() }}</p>
      } @else {
        <!-- One bordered group with divided rows, rather than a card per option. With
             five saved addresses, a card each turns a simple choice into a wall of
             boxes; the selected row is the only one that needs emphasis, and it gets it
             from a tint and an inset ring instead of yet another border. -->
        <ul class="mt-3 divide-y divide-slate-200 overflow-hidden rounded-md border border-slate-200">
          @for (option of options(); track option.value) {
            <li>
              <label
                class="flex cursor-pointer items-start gap-3 border-l-4 border-transparent p-3
                       hover:bg-slate-50 has-checked:border-slate-900 has-checked:bg-slate-50"
              >
                <input
                  type="radio"
                  class="mt-1 size-4 shrink-0"
                  [name]="groupName()"
                  [value]="option.value"
                  [checked]="option.value === selected()"
                  (change)="onChange()"
                  [attr.data-testid]="testId() + '-option'"
                  [attr.data-value]="option.value"
                />
                <span class="min-w-0">
                  <span class="block font-medium break-words">{{ option.label }}</span>
                  @for (detail of option.details; track detail) {
                    <span class="block text-sm break-words text-slate-600">{{ detail }}</span>
                  }
                </span>
              </label>
            </li>
          }
        </ul>
      }
    </fieldset>
  `,
})
export class ChoiceList {
  readonly legend = input.required<string>();
  /** Shared `name` attribute - what makes these one radio group to the browser. */
  readonly groupName = input.required<string>();
  readonly options = input.required<readonly ChoiceOption[]>();
  /** The currently selected record `name`, straight from the cart. */
  readonly selected = input<string | null>(null);
  /** A selection for this group is in flight. */
  readonly busy = input(false);
  readonly emptyText = input('');
  readonly testId = input.required<string>();

  readonly choose = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * Ask for the clicked value, having first put the radios back where the cart has
   * them.
   *
   * Reading the DOM rather than taking the value from the template is deliberate: the
   * browser has already moved the checked state by the time this runs, and this is the
   * one place that knows which element the user actually activated.
   */
  protected onChange(): void {
    const radios = Array.from(
      this.host.nativeElement.querySelectorAll('input[type="radio"]'),
    ) as HTMLInputElement[];

    const clicked = radios.find((radio) => radio.checked)?.value;
    if (clicked === undefined) {
      return;
    }

    // Back to cart truth. Setting the property leaves focus alone, so a keyboard user
    // stays exactly where they were.
    const selected = this.selected();
    for (const radio of radios) {
      radio.checked = radio.value === selected;
    }

    this.choose.emit(clicked);
  }
}
