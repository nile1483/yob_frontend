import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';

import { Button } from '../../../design/button/button';

/**
 * A deliberate confirmation before a destructive action.
 *
 * ## Why inline rather than a modal
 *
 * A modal dialog owes focus trapping, restoration, an escape key, scroll locking and a
 * backdrop - real work, and easy to get subtly wrong. `<dialog>` would give some of it,
 * but its focus behaviour still needs care and the project has no dialog primitive.
 *
 * This asks the question **in place of the row's actions**, so nothing moves under the
 * pointer and the browser's own tab order still applies. There is nothing to trap
 * because nothing is layered.
 *
 * ## Focus
 *
 * Replacing the row's actions destroys the button the buyer just pressed, and a focused
 * element that leaves the document takes focus to `<body>` with it - the next Tab then
 * restarts from the top of the page, stranding a keyboard user in the middle of a
 * destructive action. So the confirmation takes focus when it appears, and the page
 * puts focus back on the Delete button when it is dismissed.
 *
 * It lands on **Cancel**, which is also first in the DOM: the reflexive Enter, and the
 * reflexive Tab-then-Enter, both keep the record.
 *
 * The record is named in human terms - the title a buyer recognises, never the Frappe
 * document id.
 */
@Component({
  selector: 'app-confirm-delete',
  imports: [Button],
  template: `
    <div
      class="flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 p-3"
      role="group"
      [attr.aria-label]="prompt()"
      [attr.data-testid]="testId()"
    >
      <p class="text-sm text-red-900">{{ prompt() }}</p>

      <div class="flex flex-wrap gap-2">
        <!-- Cancel first: the safe choice is the one a reflexive Enter reaches. -->
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 underline
                 underline-offset-4"
          #cancel
          (click)="cancelled.emit()"
          [attr.data-testid]="testId() + '-cancel'"
          i18n="@@account.delete.cancel"
        >
          Keep it
        </button>

        <button
          yob-button
          type="button"
          class="bg-red-700 hover:bg-red-800 disabled:hover:bg-red-700"
          [loading]="pending()"
          (click)="confirmed.emit()"
          [attr.data-testid]="testId() + '-confirm'"
          i18n="@@account.delete.confirm"
        >
          Delete
        </button>
      </div>
    </div>
  `,
})
export class ConfirmDelete {
  /** What the buyer calls this record - a title, not an identifier. */
  readonly label = input.required<string>();
  /** A delete is in flight; blocks a second confirmation. */
  readonly pending = input(false);
  readonly testId = input.required<string>();

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly cancelButton = viewChild.required<ElementRef<HTMLButtonElement>>('cancel');

  constructor() {
    afterNextRender(() => this.cancelButton().nativeElement.focus());
  }

  protected readonly prompt = computed(
    () => $localize`:@@account.delete.prompt:Delete ${this.label()}:label:? This cannot be undone.`,
  );
}
