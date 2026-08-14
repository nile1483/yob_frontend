import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { Observable } from 'rxjs';

import { Alert } from '../../../design/alert/alert';
import { Button } from '../../../design/button/button';
import { EmptyState } from '../../../design/empty-state/empty-state';
import { PageHeader } from '../../../design/page-header/page-header';
import { Spinner } from '../../../design/spinner/spinner';
import { normalizeYobFailure } from '../../../foundation/network/yob-api-error';
import { toAddressChoice, toContactChoice } from '../../checkout/checkout.choices';
import type {
  AddressDto,
  AddressFormValues,
  ContactDto,
  ContactFormValues,
} from '../../checkout/contracts/checkout.types';
import { AddressBookApi } from '../../checkout/data/address-book.api';
import { AddressForm } from '../../checkout/parts/address-form';
import { ContactForm } from '../../checkout/parts/contact-form';
import {
  accountFailure,
  isUncertainOutcome,
  uncertainDeleteMessage,
  unknownStateMessage,
} from '../account-error-message';
import { changedFields, hasChanges, toFormValues } from '../account.changed-fields';
import { ConfirmDelete } from '../parts/confirm-delete';

/** Which record, if any, has its editor or confirmation open. */
interface OpenEditor {
  readonly kind: 'address' | 'contact';
  readonly name: string;
}

/**
 * An open editor, with the record's values captured at the moment it opened.
 *
 * The snapshot is held here rather than recomputed in the template for two reasons.
 * It is the baseline `changedFields` compares against - "as it was when I started
 * editing" is the only defensible meaning for a diff. And a template expression that
 * builds an object returns a new identity on every change detection, which would
 * re-seed the form's `linkedSignal` and silently discard whatever the buyer had typed.
 */
interface OpenEdit<T> extends OpenEditor {
  readonly values: T;
}

const ADDRESS_KEYS = [
  'address_title',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'pincode',
  'country',
] as const;

const CONTACT_KEYS = ['first_name', 'last_name', 'email', 'phone'] as const;

/**
 * Account: the customer's saved addresses and contacts.
 *
 * ## State decision: page-local, no store
 *
 * Two master-data lists read by one page. There is no second consumer to keep in
 * agreement and nothing derived, so two `rxResource`s and a handful of signals are the
 * whole of it - the same reasoning as Catalog and Orders. Checkout reads the same
 * records through the same API, but it reads them freshly when it opens; sharing a
 * store between the two would mean inventing an invalidation policy for a problem
 * neither page has.
 *
 * ## Account manages, Checkout chooses
 *
 * Deliberately not imported from Checkout: the create → refresh → **select into the
 * cart** flow. Creating an address here does not touch the cart. `CartStore` is never
 * injected, and the two domains meet only at the shared API and the shared form.
 *
 * ## Edits are partial
 *
 * The update endpoint treats a present key as an instruction and `""` as a clear, so
 * the payload is a real before/after comparison - see `changedFields`. Sending the
 * whole form would clear every field the buyer did not touch.
 */
@Component({
  selector: 'app-account-page',
  imports: [AddressForm, Alert, Button, ConfirmDelete, ContactForm, EmptyState, PageHeader, Spinner],
  template: `
    <app-page-header
      heading="Your account"
      i18n-heading="@@account.heading"
      lead="Manage the addresses and contacts used when you place an order."
      i18n-lead="@@account.intro"
    />

    @if (notice(); as message) {
      <div class="mt-6" aria-live="polite" data-testid="account-notice">
        <app-alert [tone]="noticeTone()">{{ message }}</app-alert>
      </div>
    }

    <!-- ================================================================ addresses -->
    <section class="mt-8" aria-labelledby="account-addresses-heading">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 id="account-addresses-heading" class="text-base font-semibold text-slate-900"
            i18n="@@account.addresses.heading">Addresses</h2>

        @if (!creatingAddress()) {
          <button yob-button variant="secondary" size="sm" type="button"
                  (click)="openCreateAddress()"
                  data-testid="account-add-address" i18n="@@account.addresses.add">
            Add address
          </button>
        }
      </div>

      @if (creatingAddress()) {
        <app-address-form
          heading="New address"
          i18n-heading="@@account.addresses.newHeading"
          [pending]="saving()"
          [error]="formError()"
          [fieldErrors]="fieldErrors()"
          (submitted)="onCreateAddress($event)"
          (cancelled)="closeEditors()"
        />
      }

      @if (addresses.isLoading()) {
        <div class="mt-6 flex justify-center" data-testid="addresses-loading">
          <app-spinner label="Loading addresses" i18n-label="@@account.addresses.loading" />
        </div>
      } @else if (addresses.error()) {
        <div class="mt-6" data-testid="addresses-error">
          <app-alert tone="error">
            <span i18n="@@account.addresses.error">
              We could not load your addresses. Please try again.
            </span>
          </app-alert>
        </div>
      } @else if ((addresses.value() ?? []).length === 0) {
        <div class="mt-6" data-testid="addresses-empty">
          <app-empty-state>
            <h3 emptyTitle i18n="@@account.addresses.empty.title">No saved addresses</h3>
            <p emptyBody i18n="@@account.addresses.empty.body">
              Addresses you add will be available at checkout.
            </p>
          </app-empty-state>
        </div>
      } @else {
        <!-- Divided rows, not a card each: these are the same kind of record repeated,
             and a box around every one made the page read as an admin CRUD table. -->
        <ul
          class="mt-4 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200"
          data-testid="address-list"
        >
          @for (address of addresses.value(); track address.name) {
            <li class="p-4" data-testid="address-item">
              @if (editingAddressValues(address.name); as initial) {
                <app-address-form
                  heading="Edit address"
                  i18n-heading="@@account.addresses.editHeading"
                  submitLabel="Save changes"
                  i18n-submitLabel="@@account.save"
                  [initial]="initial"
                  [pending]="saving()"
                  [error]="formError()"
                  [fieldErrors]="fieldErrors()"
                  (submitted)="onUpdateAddress(address, $event)"
                  (cancelled)="closeEditors()"
                />
              } @else {
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div class="min-w-0">
                    <p class="font-medium break-words" data-testid="address-item-title">
                      {{ addressLabel(address) }}
                    </p>
                    @for (line of addressLines(address); track line) {
                      <p class="text-sm break-words text-slate-600">{{ line }}</p>
                    }
                  </div>

                  @if (isConfirming('address', address.name)) {
                    <app-confirm-delete
                      [label]="addressLabel(address)"
                      [pending]="deleting() === address.name"
                      testId="address-confirm"
                      (confirmed)="onDeleteAddress(address)"
                      (cancelled)="cancelConfirm(address.name)"
                    />
                  } @else {
                    <div class="flex shrink-0 flex-wrap gap-2">
                      <button yob-button variant="secondary" size="sm" type="button"
                              (click)="openEditAddress(address)"
                              data-testid="address-edit" i18n="@@account.edit">Edit</button>
                      <button yob-button variant="destructive" size="sm" type="button"
                              (click)="openConfirm('address', address.name)"
                              [attr.data-delete-for]="address.name"
                              data-testid="address-delete" i18n="@@account.delete">Delete</button>
                    </div>
                  }
                </div>
              }
            </li>
          }
        </ul>
      }
    </section>

    <!-- ================================================================= contacts -->
    <section class="mt-10" aria-labelledby="account-contacts-heading">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 id="account-contacts-heading" class="text-base font-semibold text-slate-900"
            i18n="@@account.contacts.heading">Contacts</h2>

        @if (!creatingContact()) {
          <button yob-button variant="secondary" size="sm" type="button"
                  (click)="openCreateContact()"
                  data-testid="account-add-contact" i18n="@@account.contacts.add">
            Add contact
          </button>
        }
      </div>

      @if (creatingContact()) {
        <app-contact-form
          heading="New contact"
          i18n-heading="@@account.contacts.newHeading"
          [pending]="saving()"
          [error]="formError()"
          [fieldErrors]="fieldErrors()"
          (submitted)="onCreateContact($event)"
          (cancelled)="closeEditors()"
        />
      }

      @if (contacts.isLoading()) {
        <div class="mt-6 flex justify-center" data-testid="contacts-loading">
          <app-spinner label="Loading contacts" i18n-label="@@account.contacts.loading" />
        </div>
      } @else if (contacts.error()) {
        <div class="mt-6" data-testid="contacts-error">
          <app-alert tone="error">
            <span i18n="@@account.contacts.error">
              We could not load your contacts. Please try again.
            </span>
          </app-alert>
        </div>
      } @else if ((contacts.value() ?? []).length === 0) {
        <div class="mt-6" data-testid="contacts-empty">
          <app-empty-state>
            <h3 emptyTitle i18n="@@account.contacts.empty.title">No saved contacts</h3>
            <p emptyBody i18n="@@account.contacts.empty.body">
              Contacts you add will be available at checkout.
            </p>
          </app-empty-state>
        </div>
      } @else {
        <ul
          class="mt-4 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200"
          data-testid="contact-list"
        >
          @for (contact of contacts.value(); track contact.name) {
            <li class="p-4" data-testid="contact-item">
              @if (editingContactValues(contact.name); as initial) {
                <app-contact-form
                  heading="Edit contact"
                  i18n-heading="@@account.contacts.editHeading"
                  submitLabel="Save changes"
                  i18n-submitLabel="@@account.save"
                  [initial]="initial"
                  [pending]="saving()"
                  [error]="formError()"
                  [fieldErrors]="fieldErrors()"
                  (submitted)="onUpdateContact(contact, $event)"
                  (cancelled)="closeEditors()"
                />
              } @else {
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div class="min-w-0">
                    <p class="font-medium break-words" data-testid="contact-item-name">
                      {{ contactLabel(contact) }}
                    </p>
                    @for (line of contactLines(contact); track line) {
                      <p class="text-sm break-words text-slate-600">{{ line }}</p>
                    }
                  </div>

                  @if (isConfirming('contact', contact.name)) {
                    <app-confirm-delete
                      [label]="contactLabel(contact)"
                      [pending]="deleting() === contact.name"
                      testId="contact-confirm"
                      (confirmed)="onDeleteContact(contact)"
                      (cancelled)="cancelConfirm(contact.name)"
                    />
                  } @else {
                    <div class="flex shrink-0 flex-wrap gap-2">
                      <button yob-button variant="secondary" size="sm" type="button"
                              (click)="openEditContact(contact)"
                              data-testid="contact-edit" i18n="@@account.edit">Edit</button>
                      <button yob-button variant="destructive" size="sm" type="button"
                              (click)="openConfirm('contact', contact.name)"
                              [attr.data-delete-for]="contact.name"
                              data-testid="contact-delete" i18n="@@account.delete">Delete</button>
                    </div>
                  }
                </div>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class AccountPage {
  private readonly api = inject(AddressBookApi);

  protected readonly addresses = rxResource({ stream: () => this.api.getAddresses() });
  protected readonly contacts = rxResource({ stream: () => this.api.getContacts() });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  private readonly editingAddress = signal<OpenEdit<AddressFormValues> | null>(null);
  private readonly editingContact = signal<OpenEdit<ContactFormValues> | null>(null);
  private readonly confirming = signal<OpenEditor | null>(null);
  protected readonly creatingAddress = signal(false);
  protected readonly creatingContact = signal(false);

  /** One in-flight mutation at a time; blocks every other submit. */
  protected readonly saving = signal(false);
  /** The record currently being deleted, so only its confirmation shows busy. */
  protected readonly deleting = signal<string | null>(null);

  protected readonly notice = signal<string | null>(null);
  protected readonly noticeTone = signal<'success' | 'error' | 'info'>('info');
  protected readonly formError = signal('');
  protected readonly fieldErrors = signal<Readonly<Record<string, string>>>({});

  // ------------------------------------------------------------- presentation

  protected addressLabel(address: AddressDto): string {
    return toAddressChoice(address).label;
  }

  protected addressLines(address: AddressDto): readonly string[] {
    // `get_addresses` returns no phone or email, so there is nothing further to show.
    return toAddressChoice(address).details;
  }

  protected contactLabel(contact: ContactDto): string {
    return toContactChoice(contact).label;
  }

  protected contactLines(contact: ContactDto): readonly string[] {
    return toContactChoice(contact).details;
  }

  /** The record flattened for the form. `null` becomes `''`; see `toFormValues`. */
  protected addressValues(address: AddressDto): AddressFormValues {
    return toFormValues(address as unknown as Record<string, unknown>, ADDRESS_KEYS);
  }

  protected contactValues(contact: ContactDto): ContactFormValues {
    return toFormValues(contact as unknown as Record<string, unknown>, CONTACT_KEYS);
  }

  // ------------------------------------------------------------------ editors

  /** The captured values for the address being edited, or `null`. */
  protected editingAddressValues(name: string): AddressFormValues | null {
    const open = this.editingAddress();
    return open !== null && open.name === name ? open.values : null;
  }

  protected editingContactValues(name: string): ContactFormValues | null {
    const open = this.editingContact();
    return open !== null && open.name === name ? open.values : null;
  }

  protected isConfirming(kind: OpenEditor['kind'], name: string): boolean {
    const open = this.confirming();
    return open !== null && open.kind === kind && open.name === name;
  }

  protected openCreateAddress(): void {
    this.closeEditors();
    this.creatingAddress.set(true);
  }

  protected openCreateContact(): void {
    this.closeEditors();
    this.creatingContact.set(true);
  }

  protected openEditAddress(address: AddressDto): void {
    this.closeEditors();
    this.editingAddress.set({
      kind: 'address',
      name: address.name,
      values: this.addressValues(address),
    });
  }

  protected openEditContact(contact: ContactDto): void {
    this.closeEditors();
    this.editingContact.set({
      kind: 'contact',
      name: contact.name,
      values: this.contactValues(contact),
    });
  }

  protected openConfirm(kind: OpenEditor['kind'], name: string): void {
    this.closeEditors();
    this.confirming.set({ kind, name });
  }

  /**
   * Dismiss a delete confirmation and give focus back to the button that opened it.
   *
   * The confirmation took focus when it appeared, because it had replaced the element
   * that had it. Closing it destroys the confirmation in turn, so the same hand-off has
   * to happen in reverse or the buyer is returned to `<body>` and has to tab from the
   * top of the page to get back to where they were.
   */
  protected cancelConfirm(name: string): void {
    this.closeEditors();

    afterNextRender(
      () => {
        this.host.nativeElement
          .querySelector<HTMLButtonElement>(`[data-delete-for="${CSS.escape(name)}"]`)
          ?.focus();
      },
      { injector: this.injector },
    );
  }

  protected closeEditors(): void {
    this.editingAddress.set(null);
    this.editingContact.set(null);
    this.confirming.set(null);
    this.creatingAddress.set(false);
    this.creatingContact.set(false);
    this.formError.set('');
    this.fieldErrors.set({});
  }

  // ------------------------------------------------------------------ create

  protected onCreateAddress(values: AddressFormValues): void {
    // A create sends every field: there is no stored value to preserve, so an empty
    // input is simply an empty new field rather than an instruction to clear.
    this.mutate(this.api.addAddress(values), 'address', () =>
      $localize`:@@account.addresses.added:Address added.`,
    );
  }

  protected onCreateContact(values: ContactFormValues): void {
    this.mutate(this.api.addContact(values), 'contact', () =>
      $localize`:@@account.contacts.added:Contact added.`,
    );
  }

  // ------------------------------------------------------------------ update

  /**
   * Save only what the buyer actually changed.
   *
   * If nothing changed, no request is made - a payload of `{name}` alone would be a
   * pointless round trip, and the buyer sees the same confirmation either way.
   */
  protected onUpdateAddress(address: AddressDto, values: AddressFormValues): void {
    const baseline = this.editingAddress()?.values ?? this.addressValues(address);
    const patch = changedFields(baseline, values);

    if (!hasChanges(patch)) {
      this.closeEditors();
      return;
    }

    this.mutate(this.api.updateAddress({ name: address.name, ...patch }), 'address', () =>
      $localize`:@@account.addresses.saved:Address updated.`,
    );
  }

  protected onUpdateContact(contact: ContactDto, values: ContactFormValues): void {
    const baseline = this.editingContact()?.values ?? this.contactValues(contact);
    const patch = changedFields(baseline, values);

    if (!hasChanges(patch)) {
      this.closeEditors();
      return;
    }

    this.mutate(this.api.updateContact({ name: contact.name, ...patch }), 'contact', () =>
      $localize`:@@account.contacts.saved:Contact updated.`,
    );
  }

  /**
   * Run a create or update, then re-read the list.
   *
   * The mutation replies with the saved record, but the list read is the canonical
   * collection - it is what the next page load would show, and adopting the reply
   * instead would leave two ideas of what the customer owns.
   */
  private mutate(
    request: { subscribe: (o: { next: () => void; error: (e: unknown) => void }) => void },
    kind: OpenEditor['kind'],
    success: () => string,
  ): void {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.formError.set('');
    this.fieldErrors.set({});
    this.notice.set(null);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeEditors();
        this.refresh(kind);
        this.announce(success(), 'success');
      },
      error: (failure: unknown) => {
        this.saving.set(false);
        const error = normalizeYobFailure(failure);
        const mapped = accountFailure(error);

        // A field error belongs against the input, where the buyer can act on it.
        if (error.code === 'validation_failed' && error.field !== undefined) {
          this.fieldErrors.set({ [error.field]: mapped.message });
          this.formError.set('');
          return;
        }

        if (mapped.kind === 'gone') {
          // The record vanished between load and submit. Close the editor and let the
          // refreshed list be the truth.
          this.closeEditors();
          this.refresh(kind);
          this.announce(mapped.message, 'info');
          return;
        }

        this.formError.set(mapped.message);
      },
    });
  }

  // ------------------------------------------------------------------ delete

  protected onDeleteAddress(address: AddressDto): void {
    this.remove(address.name, 'address', () => this.api.deleteAddress(address.name), () =>
      $localize`:@@account.addresses.deleted:Address deleted.`,
    );
  }

  protected onDeleteContact(contact: ContactDto): void {
    this.remove(contact.name, 'contact', () => this.api.deleteContact(contact.name), () =>
      $localize`:@@account.contacts.deleted:Contact deleted.`,
    );
  }

  /**
   * Delete a record.
   *
   * ## Never retried, and the failure paths differ
   *
   * A delete that succeeded but lost its response answers `404` next time, so an
   * automatic retry would turn a completed deletion into an apparent error. Nothing
   * here retries, and there is no retry operator in the network path.
   *
   * - **`*_in_use`** is a definite refusal. The record stays, the explanation shows,
   *   and no recovery read happens - the server considered it and said no.
   * - **A transport or server fault** leaves the outcome unknown. The recovery is a
   *   **list read**: if the record is gone the deletion evidently worked, and if it is
   *   still there we say we could not confirm rather than guessing either way.
   */
  private remove(
    name: string,
    kind: OpenEditor['kind'],
    request: () => { subscribe: (o: { next: () => void; error: (e: unknown) => void }) => void },
    success: () => string,
  ): void {
    if (this.deleting() !== null) {
      return;
    }

    this.deleting.set(name);
    this.notice.set(null);

    request().subscribe({
      next: () => {
        this.deleting.set(null);
        this.closeEditors();
        this.refresh(kind);
        this.announce(success(), 'success');
      },
      error: (failure: unknown) => {
        this.deleting.set(null);
        const error = normalizeYobFailure(failure);
        const mapped = accountFailure(error);

        if (!isUncertainOutcome(error)) {
          // Definite: in-use, or gone. Keep it simple and say what happened.
          this.closeEditors();
          if (mapped.kind === 'gone') {
            this.refresh(kind);
          }
          this.announce(mapped.message, mapped.kind === 'refused' ? 'info' : 'info');
          return;
        }

        this.recoverAfterUncertainDelete(name, kind);
      },
    });
  }

  /** Re-read the list and let it decide what happened. Never another delete. */
  private recoverAfterUncertainDelete(name: string, kind: OpenEditor['kind']): void {
    const list: Observable<readonly { name: string }[]> =
      kind === 'address' ? this.api.getAddresses() : this.api.getContacts();

    list.subscribe({
      next: (records) => {
        this.closeEditors();
        this.refresh(kind);
        this.announce(uncertainDeleteMessage(records.some((r) => r.name === name)), 'info');
      },
      error: () => {
        this.closeEditors();
        this.announce(unknownStateMessage(), 'error');
      },
    });
  }

  // ------------------------------------------------------------------ helpers

  private refresh(kind: OpenEditor['kind']): void {
    if (kind === 'address') {
      this.addresses.reload();
    } else {
      this.contacts.reload();
    }
  }

  private announce(message: string, tone: 'success' | 'error' | 'info'): void {
    this.noticeTone.set(tone);
    this.notice.set(message);
  }
}
