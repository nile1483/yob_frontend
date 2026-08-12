import { Service, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';

import { YobApiClient } from '../../../foundation/network/yob-api-client';
import type {
  AddAddressRequest,
  AddContactRequest,
  AddressDto,
  ContactDto,
} from '../contracts/checkout.types';

const GET_ADDRESSES = 'yob_storefront.api.address.get_addresses';
const GET_CONTACTS = 'yob_storefront.api.address.get_contacts';
const ADD_ADDRESS = 'yob_storefront.api.address.add_address';
const ADD_CONTACT = 'yob_storefront.api.address.add_contact';

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
 * Lives in the checkout domain because checkout is its only consumer today. A later
 * Account phase that manages the address book should lift it into that domain rather
 * than import it across domains.
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
}
