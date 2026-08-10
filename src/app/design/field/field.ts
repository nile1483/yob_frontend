import { Component, ElementRef, afterRenderEffect, inject, input } from '@angular/core';

let nextFieldId = 0;

/**
 * Form-field structure: label, the consumer's own native control, optional hint, and a
 * validation message.
 *
 * It wraps a control rather than replacing one. Whatever is projected stays a plain
 * `<input>`, `<select>` or `<textarea>`, so Angular's form APIs - `formControlName`,
 * Signal Forms, validators, `[(ngModel)]` - work exactly as documented. There is no
 * value input, no `ControlValueAccessor`, and no form framework hiding underneath.
 *
 * ```html
 * <app-field label="Email" hint="We only use this to contact you" [error]="emailError()">
 *   <input type="email" formControlName="username" required />
 * </app-field>
 * ```
 *
 * ## Contract: exactly one control
 *
 * A field wraps **one** `input`, `select` or `textarea`. That is the whole contract,
 * and the `querySelector` below relies on it: with several controls it would wire
 * `aria-describedby` and `aria-invalid` onto the first one only, and the label's
 * implicit association would point there too.
 *
 * This is deliberate rather than a limitation to route around. A group of controls
 * sharing one label is a different accessibility pattern - a `fieldset` with a
 * `legend`, or a `radiogroup` - and deserves its own primitive built on the right
 * semantics, not a `field` stretched until it fits. Reviewed in Phase 6.5 and left
 * as-is: the alternatives (a required `controlId` input, or a marker directive on the
 * control) push work onto every caller to guard against a case that is already wrong
 * for other reasons.
 *
 * ## Accessibility
 *
 * The control is projected *inside* the `<label>`, which associates the two implicitly
 * - no `id`/`for` pair for a caller to get wrong, and nothing to remember.
 *
 * Hint and error text is linked with `aria-describedby`, and `aria-invalid` is
 * mirrored, by finding the projected control and setting those attributes. That is the
 * one piece of DOM reaching in this file, and it exists because the alternative is
 * asking every caller to wire ids by hand, which is exactly the step people forget.
 * Attributes the caller sets are left alone otherwise.
 *
 * The error also carries `role="alert"`, so it is announced when it appears rather
 * than only when the control is next focused.
 *
 * Angular Aria was considered here and does not apply: this is native HTML with no
 * keyboard or focus behaviour of its own. See the UI implementation decision order in
 * `docs/ARCHITECTURE.md`.
 */
@Component({
  selector: 'app-field',
  template: `
    <div class="flex flex-col gap-1.5">
      <label class="flex flex-col gap-1.5 text-sm font-medium text-slate-900">
        <span>
          {{ label() }}
          @if (required()) {
            <!-- Decorative: the control's own required attribute carries the semantics. -->
            <span aria-hidden="true" class="text-slate-500">*</span>
          }
        </span>
        <ng-content />
      </label>

      @if (hint()) {
        <p [id]="hintId" class="text-sm text-slate-600">{{ hint() }}</p>
      }

      @if (error()) {
        <p [id]="errorId" role="alert" class="text-sm font-medium text-red-700">{{ error() }}</p>
      }
    </div>
  `,
})
export class Field {
  readonly label = input.required<string>();

  /** Supporting text shown under the control. */
  readonly hint = input('');

  /** Validation message. Any non-empty value puts the field in an invalid state. */
  readonly error = input('');

  /** Shows the required marker. Set `required` on the control itself for semantics. */
  readonly required = input(false);

  private readonly instance = nextFieldId++;
  protected readonly hintId = `yob-field-${this.instance}-hint`;
  protected readonly errorId = `yob-field-${this.instance}-error`;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterRenderEffect(() => {
      const describedBy = [
        this.hint() ? this.hintId : null,
        this.error() ? this.errorId : null,
      ].filter((id): id is string => id !== null);

      const control = this.host.nativeElement.querySelector('input, select, textarea');
      if (control === null) {
        return;
      }

      if (describedBy.length > 0) {
        control.setAttribute('aria-describedby', describedBy.join(' '));
      } else {
        control.removeAttribute('aria-describedby');
      }

      control.setAttribute('aria-invalid', this.error() ? 'true' : 'false');
    });
  }
}
