import { Component, computed, effect, inject, input, linkedSignal, output, untracked } from '@angular/core';
import { FormField, form, required, submit } from '@angular/forms/signals';

import { Alert } from '../../../design/alert/alert';
import { Button } from '../../../design/button/button';
import { Field } from '../../../design/field/field';
import { SearchSelect, type SearchSelectOption } from '../../../design/search-select/search-select';
import { AddressLocationService } from '../../../foundation/locations/address-location.service';
import type { AddressFormConfig, AddressFormValues } from '../contracts/checkout.types';

const CONTROL_CLASS = 'w-full rounded-md border border-slate-300 px-3 py-2 text-base sm:text-sm';

/**
 * The address form, used for creating and for editing.
 *
 * One component serves Checkout's billing and shipping sections and Account's edit
 * flow. It collects and validates; it never calls an API. It emits the values it
 * holds, and the page decides what they mean:
 *
 * - Checkout sends them as a create, then selects the new record into a cart slot.
 * - Account compares them against {@link initial} and sends only what changed, because
 *   the update endpoint treats a present key as an instruction and `""` as a clear.
 *
 * Emitting *values* rather than a request payload is what avoids a `mode` flag and the
 * branching that comes with it.
 *
 * ## Which fields are required, and why only those
 *
 * Frappe's Address doctype marks `address_line1`, `city` and `country` mandatory, and
 * `address_type` - which the storefront defaults to `Billing` server-side, so it is not
 * asked. `address_title` is *not* required of the caller: Frappe derives it from the
 * linked Customer when it is absent.
 *
 * `state` and `pincode` are collected but not required. India makes both matter in
 * practice, but the contract does not mandate them for every country and inventing
 * that rule here would reject valid addresses elsewhere. The backend owns it.
 *
 * The client-side checks are not decoration. `add_address` wraps everything in a bare
 * `except Exception`, so a Frappe mandatory-field error surfaces as a generic
 * `internal_server_error` rather than a `validation_failed` naming the field - the
 * buyer would be told "something went wrong" with nothing to fix. Catching it here is
 * what makes the failure actionable.
 */
@Component({
  selector: 'app-address-form',
  imports: [Alert, Button, Field, FormField, SearchSelect],
  template: `
    <form
      class="mt-4 flex flex-col gap-4 rounded-md border border-slate-200 p-4"
      (submit)="onSubmit($event)"
      novalidate
      data-testid="address-form"
    >
      <h3 class="text-base font-semibold">{{ heading() }}</h3>

      @if (error()) {
        <app-alert tone="error" data-testid="address-form-error">{{ error() }}</app-alert>
      }

      <app-field label="Address title" i18n-label="@@checkout.address.title" [error]="titleError()">
        <input
          [formField]="addressForm.address_title"
          type="text"
          [class]="control"
          data-testid="address-title"
        />
      </app-field>

      <app-field
        label="Address line 1"
        i18n-label="@@checkout.address.line1"
        [required]="true"
        [error]="line1Error()"
      >
        <input
          [formField]="addressForm.address_line1"
          type="text"
          [class]="control"
          autocomplete="address-line1"
          data-testid="address-line1"
        />
      </app-field>

      <app-field label="Address line 2" i18n-label="@@checkout.address.line2">
        <input
          [formField]="addressForm.address_line2"
          type="text"
          [class]="control"
          autocomplete="address-line2"
          data-testid="address-line2"
        />
      </app-field>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <app-field
          label="City"
          i18n-label="@@checkout.address.city"
          [required]="true"
          [error]="cityError()"
        >
          <input
            [formField]="addressForm.city"
            type="text"
            [class]="control"
            autocomplete="address-level2"
            data-testid="address-city"
          />
        </app-field>

        <app-field label="State" i18n-label="@@checkout.address.state" [error]="stateError()">
          <!-- A controlled list only where one exists. For a country with no bundled
               subdivisions a picker would offer nothing, so the field stays free text -
               which is what the backend accepts there anyway. -->
          @if (hasSubdivisions()) {
            <app-search-select
              [formField]="addressForm.state"
              [options]="stateOptions()"
              placeholder="Select a state"
              i18n-placeholder="@@checkout.address.state.placeholder"
              ariaLabel="State"
              i18n-ariaLabel="@@checkout.address.state"
              testId="address-state"
            />
          } @else {
            <input
              [formField]="addressForm.state"
              type="text"
              [class]="control"
              autocomplete="address-level1"
              data-testid="address-state"
            />
          }
        </app-field>

        <app-field
          label="Postal code"
          i18n-label="@@checkout.address.pincode"
          [error]="pincodeError()"
        >
          <input
            [formField]="addressForm.pincode"
            type="text"
            [class]="control"
            autocomplete="postal-code"
            inputmode="numeric"
            data-testid="address-pincode"
          />
        </app-field>

        <app-field
          label="Country"
          i18n-label="@@checkout.address.country"
          [required]="true"
          [error]="countryError()"
        >
          <app-search-select
            [formField]="addressForm.country"
            [options]="countryOptions()"
            placeholder="Select a country"
            i18n-placeholder="@@checkout.address.country.placeholder"
            ariaLabel="Country"
            i18n-ariaLabel="@@checkout.address.country"
            testId="address-country"
          />
        </app-field>
      </div>

      <div class="flex flex-wrap gap-3">
        <button
          yob-button
          type="submit"
          [loading]="pending()"
          data-testid="address-form-submit"
        >
          {{ submitLabel() }}
        </button>
        <button
          type="button"
          class="rounded-md px-4 py-2 text-sm font-medium text-slate-700 underline underline-offset-4"
          (click)="cancelled.emit()"
          data-testid="address-form-cancel"
          i18n="@@checkout.address.form.cancel"
        >
          Cancel
        </button>
      </div>
    </form>
  `,
})
export class AddressForm {
  /** A create is in flight; owned by the page, which is the thing doing the creating. */
  readonly pending = input(false);
  /** An already-safe message. Never the backend's own text. */
  readonly error = input('');
  /**
   * Server-reported field errors, keyed by the backend's `field` value.
   *
   * `validation_failed` names the offending input, so the message can be attached to
   * it rather than floating at the top of the form.
   */
  readonly fieldErrors = input<Readonly<Record<string, string>>>({});

  /**
   * The record's current values, when editing.
   *
   * Absent for a create, where every field starts empty. The caller keeps this
   * snapshot too: it is what `changedFields` compares against to build a partial
   * update, so the form itself needs no notion of create-versus-edit beyond seeding.
   */
  readonly initial = input<AddressFormValues | null>(null);

  /** Wording and new-address defaults. See {@link AddressFormConfig}. */
  readonly config = input<AddressFormConfig>({});

  protected readonly heading = computed(
    () => this.config().heading ?? $localize`:@@checkout.address.form.heading:New address`,
  );
  protected readonly submitLabel = computed(
    () => this.config().submitLabel ?? $localize`:@@checkout.address.form.submit:Save address`,
  );

  /**
   * The form's values as typed.
   *
   * Emitting values rather than a request payload is what lets one component serve
   * both flows: Checkout sends them as a create, Account diffs them against
   * {@link initial} and sends only what changed.
   */
  readonly submitted = output<AddressFormValues>();
  readonly cancelled = output<void>();

  protected readonly control = CONTROL_CLASS;

  private readonly locations = inject(AddressLocationService);

  protected readonly countryOptions: () => readonly SearchSelectOption[] = computed(() =>
    this.locations.countries.map((c) => ({ value: c.name, label: c.name, hint: c.code })),
  );

  /**
   * Subdivisions for whatever country is currently selected.
   *
   * Driven by the live form value rather than by `initial`, so switching country
   * repopulates the list immediately. The GST state number rides along as a hint, which
   * also makes a state findable by typing its code.
   */
  protected readonly stateOptions: () => readonly SearchSelectOption[] = computed(() =>
    this.locations
      .subdivisionsFor(this.addressForm.country().value())
      .map((s) => ({ value: s.name, label: s.name, hint: s.code })),
  );

  protected readonly hasSubdivisions = computed(() => this.stateOptions().length > 0);

  /**
   * The values being edited.
   *
   * A `linkedSignal` rather than a plain one because `initial` is an input: a field
   * initializer runs before Angular has bound it, so seeding from `this.initial()`
   * there would always see `null` and the editor would open empty over a populated
   * record. This re-seeds when the input arrives and stays writable for typing.
   */
  private readonly draft = linkedSignal<AddressFormValues>(() => {
    const existing = this.initial();
    if (existing !== null) {
      // Editing: the stored record wins outright. Applying a default country here is
      // how an address in Kenya silently becomes an address in India on save.
      return existing;
    }

    const config = this.config();
    return {
      address_title: '',
      address_line1: '',
      address_line2: '',
      city: '',
      state: config.defaultState ?? '',
      pincode: '',
      country: config.defaultCountry ?? this.locations.defaultCountry,
    };
  });

  protected readonly addressForm = form(this.draft, (path) => {
    required(path.address_line1, {
      message: $localize`:@@checkout.address.line1.required:Enter the street address.`,
    });
    required(path.city, {
      message: $localize`:@@checkout.address.city.required:Enter the city.`,
    });
    required(path.country, {
      message: $localize`:@@checkout.address.country.required:Enter the country.`,
    });
  });

  protected readonly titleError = this.errorFor('address_title', () => '');
  protected readonly line1Error = this.errorFor('address_line1', () =>
    this.firstError(this.addressForm.address_line1()),
  );
  protected readonly cityError = this.errorFor('city', () =>
    this.firstError(this.addressForm.city()),
  );
  protected readonly stateError = this.errorFor('state', () => '');
  protected readonly pincodeError = this.errorFor('pincode', () => '');
  protected readonly countryError = this.errorFor('country', () =>
    this.firstError(this.addressForm.country()),
  );

  /**
   * The country last observed, so a *change* can be told from the initial seeding.
   *
   * `undefined` until the first run. Without this the effect would fire while the form
   * is being populated from a stored record and wipe that record's state.
   */
  private previousCountry: string | undefined = undefined;

  constructor() {
    effect(() => {
      const country = this.addressForm.country().value();

      untracked(() => {
        const previous = this.previousCountry;
        this.previousCountry = country;

        // First run is the seeding, not a change: an address loaded for editing keeps
        // exactly the state it was stored with.
        if (previous === undefined || previous === country) {
          return;
        }

        const state = this.addressForm.state().value();
        if (state === '') {
          return;
        }

        // A state belonging to the country the buyer just left cannot stay selected:
        // `Gujarat` is not a subdivision of Kenya. It survives only when the new country
        // has a controlled list *and* the value is in it. Where the new country has no
        // list, nothing here can validate the value - but it was chosen for a different
        // country, so keeping it would submit something known to be wrong.
        const survives =
          this.locations.hasSubdivisions(country) &&
          this.locations.isValidSubdivision(country, state);

        if (!survives) {
          this.addressForm.state().value.set('');
        }
      });
    });
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();

    // `submit()` runs validation and marks fields touched, so the messages appear.
    // The action only emits: the page owns the request, and `pending` keeps the
    // button disabled for its duration.
    await submit(this.addressForm, {
      action: async () => {
        if (!this.pending()) {
          this.submitted.emit(this.draft());
        }
        return undefined;
      },
    });
  }

  /** A server error for this field wins over the local one - it is the newer fact. */
  private errorFor(field: string, local: () => string) {
    return computed(() => this.fieldErrors()[field] ?? local());
  }

  private firstError(state: {
    touched: () => boolean;
    errors: () => readonly { message?: string }[];
  }): string {
    return state.touched() ? (state.errors()[0]?.message ?? '') : '';
  }
}
