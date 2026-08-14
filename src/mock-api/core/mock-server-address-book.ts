import { Service, signal } from '@angular/core';

import type {
  AddAddressRequest,
  AddContactRequest,
  AddressDto,
  ContactDto,
} from '../../app/domains/checkout/contracts/checkout.types';
import {
  MOCK_ADDRESSES,
  MOCK_CONTACTS,
  MOCK_STALE_ADDRESS,
  MOCK_STALE_CONTACT,
} from '../fixtures/address-book.fixture';

/**
 * The mock API's Address and Contact master data.
 *
 * Server state, behind the interceptor, like `MockServerSession` and `MockServerCart`.
 * Nothing is written to localStorage or sessionStorage, so a reload restores the
 * fixtures - the accepted limitation for the whole mock.
 *
 * It owns ownership, too: creation always links to the one mock customer, exactly as
 * the backend appends the Customer link from the session rather than trusting the
 * caller. That is what makes "this record is not yours" a reachable state here.
 */
@Service()
export class MockServerAddressBook {
  private readonly addressList = signal<readonly AddressDto[]>(MOCK_ADDRESSES);
  private readonly contactList = signal<readonly ContactDto[]>(MOCK_CONTACTS);

  private nextAddress = 1;
  private nextContact = 1;

  /**
   * Whether the reads include a record the writes will refuse.
   *
   * The two halves disagree on purpose: `addresses()` returns the stale record because
   * that is what a list read before the deletion would contain, while `hasAddress()`
   * consults only what actually exists. That gap is the bug the UI has to survive.
   */
  private readonly includeStale = signal(false);

  setIncludeStale(value: boolean): void {
    this.includeStale.set(value);
  }

  addresses(): readonly AddressDto[] {
    return this.includeStale() ? [...this.addressList(), MOCK_STALE_ADDRESS] : this.addressList();
  }

  contacts(): readonly ContactDto[] {
    return this.includeStale() ? [...this.contactList(), MOCK_STALE_CONTACT] : this.contactList();
  }

  hasAddress(name: string): boolean {
    return this.addressList().some((address) => address.name === name);
  }

  hasContact(name: string): boolean {
    return this.contactList().some((contact) => contact.name === name);
  }

  findAddress(name: string): AddressDto | undefined {
    return this.addressList().find((address) => address.name === name);
  }

  /**
   * Create an Address.
   *
   * The generated `name` follows Frappe's own convention - `<title>-<type>` - because
   * the real identifiers are human-readable strings rather than opaque ids, and a mock
   * using `addr-1` would let a UI bug that displays the identifier pass unnoticed.
   *
   * `address_type` is not accepted from the caller: the backend defaults it to
   * `Billing`, and so does this.
   */
  /**
   * Apply a **partial** update: only the keys present in the patch are touched.
   *
   * Mirrors the backend's `supplied(data, key) -> key in data`. A key holding `""` is
   * a deliberate clear; an absent key preserves the stored value. Reproducing this
   * exactly is the point - a mock that merged truthy values only would let a client
   * that pads its payload pass every test and then destroy real data.
   */
  updateAddress(name: string, patch: Readonly<Record<string, string>>): AddressDto | null {
    const existing = this.addressList().find((a) => a.name === name);
    if (existing === undefined) {
      return null;
    }

    const merged: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'name') {
        continue;
      }
      // `email` is the request key; the record stores it under `email` too here.
      merged[key] = value === '' ? null : value;
    }

    const updated = merged as unknown as AddressDto;
    this.addressList.set(this.addressList().map((a) => (a.name === name ? updated : a)));
    return updated;
  }

  /** The contact equivalent, same presence semantics. */
  updateContact(name: string, patch: Readonly<Record<string, string>>): ContactDto | null {
    const existing = this.contactList().find((c) => c.name === name);
    if (existing === undefined) {
      return null;
    }

    const merged: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'name') {
        continue;
      }
      merged[key] = value === '' ? null : value;
    }

    // `full_name` is composed by the backend on save, not sent by the client.
    const first = (merged['first_name'] as string | null) ?? '';
    const last = (merged['last_name'] as string | null) ?? '';
    merged['full_name'] = [first, last].filter((part) => part !== '').join(' ') || null;

    const updated = merged as unknown as ContactDto;
    this.contactList.set(this.contactList().map((c) => (c.name === name ? updated : c)));
    return updated;
  }

  removeAddress(name: string): void {
    this.addressList.set(this.addressList().filter((a) => a.name !== name));
  }

  removeContact(name: string): void {
    this.contactList.set(this.contactList().filter((c) => c.name !== name));
  }

  createAddress(request: AddAddressRequest): AddressDto {
    const title = request.address_title.trim() || 'Mock Trading Co';
    const created: AddressDto = {
      name: `${title}-Billing${this.nextAddress > 1 ? `-${this.nextAddress}` : ''}`,
      address_title: title,
      address_type: 'Billing',
      address_line1: request.address_line1,
      address_line2: emptyToNull(request.address_line2),
      city: request.city,
      state: emptyToNull(request.state),
      pincode: emptyToNull(request.pincode),
      country: request.country,
      is_primary_address: 0,
      is_shipping_address: 0,
      display: [
        request.address_line1,
        request.city,
        request.state,
        request.pincode,
        request.country,
      ]
        .filter((part) => part !== '')
        .join('<br>'),
    };

    this.nextAddress += 1;
    this.addressList.set([...this.addressList(), created]);
    return created;
  }

  /**
   * Create a Contact.
   *
   * Note the reply the handler builds from this deliberately omits `full_name`, as the
   * real `add_contact` does - the record stored here has it, because a later
   * `get_contacts` must return it.
   */
  createContact(request: AddContactRequest): ContactDto {
    const first = request.first_name.trim();
    const last = request.last_name.trim();

    const created: ContactDto = {
      name: `${first}${last === '' ? '' : `-${last}`}-${this.nextContact}`,
      full_name: last === '' ? first : `${first} ${last}`,
      salutation: null,
      first_name: first,
      last_name: emptyToNull(last),
      gender: null,
      company_name: null,
      designation: null,
      email: emptyToNull(request.email),
      phone: emptyToNull(request.phone),
    };

    this.nextContact += 1;
    this.contactList.set([...this.contactList(), created]);
    return created;
  }

  /** Logout ends the session, and master data is read per customer. */
  reset(): void {
    this.addressList.set(MOCK_ADDRESSES);
    this.contactList.set(MOCK_CONTACTS);
    this.nextAddress = 1;
    this.nextContact = 1;
    this.includeStale.set(false);
  }
}

/** Frappe stores an untouched optional field as `null`, not `""`. */
function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
