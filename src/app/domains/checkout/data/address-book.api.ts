import { Service, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';

import { YobApiClient } from '../../../foundation/network/yob-api-client';
import type {
  AddAddressRequest,
  AddContactRequest,
  AddressDto,
  ContactDto,
  UpdateAddressRequest,
  UpdateContactRequest,
} from '../contracts/checkout.types';

const GET_ADDRESSES = 'yob_storefront.api.address.get_addresses';
const GET_CONTACTS = 'yob_storefront.api.address.get_contacts';
const ADD_ADDRESS = 'yob_storefront.api.address.add_address';
const ADD_CONTACT = 'yob_storefront.api.address.add_contact';
const UPDATE_ADDRESS = 'yob_storefront.api.address.update_address';
const UPDATE_CONTACT = 'yob_storefront.api.address.update_contact';
const DELETE_ADDRESS = 'yob_storefront.api.address.delete_address';
const DELETE_CONTACT = 'yob_storefront.api.address.delete_contact';

/**
 * The customer's Address and Contact master records.
 *
 * One service for both because they are one thing: the backend serves them from a
 * single module (`api/address.py`), they are read together on one page, and a Contact
 * with no Address is not a separate concern anyone reasons about. Splitting this into
 * `CheckoutAddressApi` and `CheckoutContactApi` would double the indirection for one
 * consumer.
 *
 * It answers *what the customer may choose*. It has no opinion about what is currently
 * chosen - that is cart state and belongs to `CartStore`.
 *
 * Depends on `YobApiClient` and nothing else: no `HttpClient`, no envelope handling,
 * no mock awareness, no navigation.
 *
 * Shared master-data access: Checkout selects from these records, Account manages
 * them. It stayed in the checkout folder when Account arrived because moving it is a
 * mechanical import change with no behavioural benefit, and Phase 11's flow is the
 * more delicate of the two consumers. Worth relocating the day a third consumer
 * appears.
 */
@Service()
export class AddressBookApi {
  private readonly api = inject(YobApiClient);

  /**
   * Every Address linked to the authenticated customer.
   *
   * Serves billing *and* shipping - the backend keeps no separate shipping list, and
   * `is_shipping_address` is a hint on the record rather than a filter. Loading it
   * twice for the two sections would be two requests for one answer.
   *
   * Wire-verified: `data` is an array, `meta.count` accompanies it. The backend caches
   * this per customer for 30 minutes and invalidates on create, so a refresh after
   * `addAddress` genuinely reflects the write.
   */
  getAddresses(): Observable<readonly AddressDto[]> {
    return this.api.get<readonly AddressDto[]>(GET_ADDRESSES).pipe(map((r) => r.data));
  }

  /** Every Contact linked to the authenticated customer. Wire-verified, same shape rules. */
  getContacts(): Observable<readonly ContactDto[]> {
    return this.api.get<readonly ContactDto[]>(GET_CONTACTS).pipe(map((r) => r.data));
  }

  /**
   * Create an Address for the authenticated customer.
   *
   * The Customer link is appended server-side from the session, which is exactly why
   * this endpoint exists instead of letting the browser POST to `/api/resource/Address`
   * with a `links` array of its own choosing.
   *
   * Answers `201` with the created record including its `name`. The caller still
   * re-reads the list afterwards: the backend normalises fields on insert, and the
   * list is the authoritative view of what the customer now owns.
   */
  addAddress(request: AddAddressRequest): Observable<AddressDto> {
    return this.api.post<AddressDto>(ADD_ADDRESS, { ...request }).pipe(map((r) => r.data));
  }

  /**
   * Create a Contact for the authenticated customer.
   *
   * `201`, and the reply carries `name` but **not** `full_name` - Frappe composes that
   * on save and `add_contact` does not return it. A UI that adopted this reply directly
   * would show a contact with no name, which is the concrete reason the caller
   * re-reads the list rather than appending the created record.
   */
  addContact(request: AddContactRequest): Observable<ContactDto> {
    return this.api.post<ContactDto>(ADD_CONTACT, { ...request }).pipe(map((r) => r.data));
  }

  /**
   * Update an address, sending **only** what changed.
   *
   * ## The request must not be padded
   *
   * The backend applies a field when the key is *present*, whatever it holds. So
   * `""` clears a field and an omitted key preserves it. Serialising every input -
   * including the ones the buyer never touched - would clear all of them, which is
   * precisely the data loss backend Phase 15B removed. `changedFields` builds the
   * payload from a real before/after comparison; nothing here uses truthiness.
   *
   * Answers with the **saved** address, not an acknowledgement - but the canonical
   * Account collection is still the list read, so callers refresh rather than
   * splicing this into local state.
   *
   * Failures: 422 `validation_failed` with `field` naming the offending input
   * (including an explicit clear of a required field), 404 `address_not_found` for an
   * unknown or another customer's record.
   */
  updateAddress(request: UpdateAddressRequest): Observable<AddressDto> {
    return this.api.post<AddressDto>(UPDATE_ADDRESS, { ...request }).pipe(map((r) => r.data));
  }

  /** Update a contact. Same presence semantics; answers with the saved fields. */
  updateContact(request: UpdateContactRequest): Observable<ContactDto> {
    return this.api.post<ContactDto>(UPDATE_CONTACT, { ...request }).pipe(map((r) => r.data));
  }

  /**
   * Delete an address.
   *
   * ## Never retry this automatically
   *
   * A delete that succeeded but whose response was lost answers `404
   * address_not_found` on a second attempt - indistinguishable from "that was never
   * yours". An automatic retry would therefore turn a completed deletion into an
   * apparent failure. There is no retry operator in this path, and a test pins that.
   *
   * A referenced address answers **409 `address_in_use`**: a Cart, a historical Sales
   * Order or the Customer default still points at it. Nothing is detached
   * automatically, so this is a definite refusal rather than something to retry, and
   * the referring document is deliberately not named.
   *
   * Answers `{}` on success - re-read the list.
   */
  deleteAddress(name: string): Observable<void> {
    return this.api.post<void>(DELETE_ADDRESS, { name }).pipe(map(() => undefined));
  }

  /** Delete a contact. Mirrors `deleteAddress`, including 409 `contact_in_use`. */
  deleteContact(name: string): Observable<void> {
    return this.api.post<void>(DELETE_CONTACT, { name }).pipe(map(() => undefined));
  }
}
