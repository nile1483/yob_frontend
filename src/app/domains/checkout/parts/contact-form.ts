import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { FormField, form, required, submit } from '@angular/forms/signals';

import { Alert } from '../../../design/alert/alert';
import { Button } from '../../../design/button/button';
import { Field } from '../../../design/field/field';
import type { ContactFormValues } from '../contracts/checkout.types';

const CONTROL_CLASS = 'w-full rounded-md border border-slate-300 px-3 py-2 text-base sm:text-sm';

/**
 * Add a contact person, from checkout.
 *
 * Just enough to complete an order - not contact management. Salutation, gender,
 * designation and company are all accepted by `add_contact` and all deliberately
 * omitted: none of them is needed to reach payment, and every extra field is another
 * thing between a buyer and a finished order. Editing and deleting belong to a later
 * account phase.
 *
 * `first_name` is the only field the backend requires, and it says so properly - 422
 * `validation_failed` with `field: "first_name"` - so the client-side rule here
 * mirrors a real contract rule rather than inventing one.
 */
@Component({
  selector: 'app-contact-form',
  imports: [Alert, Button, Field, FormField],
  template: `
    <form
      class="mt-4 flex flex-col gap-4 rounded-md border border-slate-200 p-4"
      (submit)="onSubmit($event)"
      novalidate
      data-testid="contact-form"
    >
      <h3 class="text-base font-semibold">{{ heading() }}</h3>

      @if (error()) {
        <app-alert tone="error" data-testid="contact-form-error">{{ error() }}</app-alert>
      }

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <app-field
          label="First name"
          i18n-label="@@checkout.contact.firstName"
          [required]="true"
          [error]="firstNameError()"
        >
          <input
            [formField]="contactForm.first_name"
            type="text"
            [class]="control"
            autocomplete="given-name"
            data-testid="contact-first-name"
          />
        </app-field>

        <app-field label="Last name" i18n-label="@@checkout.contact.lastName">
          <input
            [formField]="contactForm.last_name"
            type="text"
            [class]="control"
            autocomplete="family-name"
            data-testid="contact-last-name"
          />
        </app-field>

        <app-field label="Email" i18n-label="@@checkout.contact.email" [error]="emailError()">
          <input
            [formField]="contactForm.email"
            type="email"
            [class]="control"
            autocomplete="email"
            autocapitalize="none"
            spellcheck="false"
            data-testid="contact-email"
          />
        </app-field>

        <app-field label="Phone" i18n-label="@@checkout.contact.phone" [error]="phoneError()">
          <input
            [formField]="contactForm.phone"
            type="tel"
            [class]="control"
            autocomplete="tel"
            data-testid="contact-phone"
          />
        </app-field>
      </div>

      <div class="flex flex-wrap gap-3">
        <button
          yob-button
          type="submit"
          [loading]="pending()"
          data-testid="contact-form-submit"
          i18n="@@checkout.contact.form.submit"
        >
          Save contact
        </button>
        <button
          type="button"
          class="rounded-md px-4 py-2 text-sm font-medium text-slate-700 underline underline-offset-4"
          (click)="cancelled.emit()"
          data-testid="contact-form-cancel"
          i18n="@@checkout.contact.form.cancel"
        >
          Cancel
        </button>
      </div>
    </form>
  `,
})
export class ContactForm {
  readonly pending = input(false);
  readonly error = input('');
  readonly fieldErrors = input<Readonly<Record<string, string>>>({});

  readonly heading = input($localize`:@@checkout.contact.form.heading:New contact`);
  /** The record's current values when editing; absent for a create. */
  readonly initial = input<ContactFormValues | null>(null);
  readonly submitLabel = input($localize`:@@checkout.contact.form.submit:Save contact`);

  readonly submitted = output<ContactFormValues>();
  readonly cancelled = output<void>();

  protected readonly control = CONTROL_CLASS;

  /** See the note in `AddressForm`: seeded from an input, so it must be linked. */
  private readonly draft = linkedSignal<ContactFormValues>(
    () => this.initial() ?? { first_name: '', last_name: '', email: '', phone: '' },
  );

  protected readonly contactForm = form(this.draft, (path) => {
    required(path.first_name, {
      message: $localize`:@@checkout.contact.firstName.required:Enter a first name.`,
    });
    // No email-shape rule: the backend accepts a contact with no email at all, and a
    // stricter client would reject records the API is happy to store.
  });

  protected readonly firstNameError = computed(
    () => this.fieldErrors()['first_name'] ?? this.firstError(this.contactForm.first_name()),
  );
  protected readonly emailError = computed(() => this.fieldErrors()['email'] ?? '');
  protected readonly phoneError = computed(() => this.fieldErrors()['phone'] ?? '');

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();

    await submit(this.contactForm, {
      action: async () => {
        if (!this.pending()) {
          this.submitted.emit(this.draft());
        }
        return undefined;
      },
    });
  }

  private firstError(state: {
    touched: () => boolean;
    errors: () => readonly { message?: string }[];
  }): string {
    return state.touched() ? (state.errors()[0]?.message ?? '') : '';
  }
}
