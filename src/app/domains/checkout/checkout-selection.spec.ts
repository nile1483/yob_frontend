import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { MockServerAddressBook } from '../../../mock-api/core/mock-server-address-book';
import { MockServerCart } from '../../../mock-api/core/mock-server-cart';
import { MockServerSession } from '../../../mock-api/core/mock-server-session';
import {
  MOCK_ADDRESS_LOCAL,
  MOCK_ADDRESS_REMOTE,
  MOCK_CONTACT_PRIMARY,
  MOCK_CONTACT_SECONDARY,
} from '../../../mock-api/fixtures/address-book.fixture';
import { mockApiInterceptor } from '../../../mock-api/mock-api.interceptor';
import { MockApiScenario } from '../../../mock-api/scenarios/mock-scenario';
import { yobCsrfInterceptor } from '../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../foundation/network/yob-api.config';
import { SessionStore } from '../../foundation/session/session.store';
import { CartStore } from '../cart/state/cart.store';
import { AddressBookApi } from './data/address-book.api';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const BOLT = 'YOB-BOLT-M10';

/**
 * Checkout selection against the mock server.
 *
 * Exercised through `CartStore`, because that is how the page reaches it - there is no
 * separate checkout state to test.
 */
describe('Checkout selection', () => {
  let store: CartStore;
  let addressBook: AddressBookApi;
  let session: SessionStore;
  let mockSession: MockServerSession;
  let mockCart: MockServerCart;
  let mockBook: MockServerAddressBook;
  let scenario: MockApiScenario;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([yobCsrfInterceptor, mockApiInterceptor])),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    store = TestBed.inject(CartStore);
    addressBook = TestBed.inject(AddressBookApi);
    session = TestBed.inject(SessionStore);
    mockSession = TestBed.inject(MockServerSession);
    mockCart = TestBed.inject(MockServerCart);
    mockBook = TestBed.inject(MockServerAddressBook);
    scenario = TestBed.inject(MockApiScenario);
    http = TestBed.inject(HttpTestingController);

    mockSession.signIn('TEST_APP', 'password');
    session.restore().subscribe();
    mockCart.setQuantity(BOLT, 2);
  });

  afterEach(() => {
    scenario.reset();
    mockCart.reset();
    mockBook.reset();
    http.verify();
  });

  // ------------------------------------------------------------ master data

  it('loads the address and contact lists', () => {
    let addresses: readonly { name: string }[] = [];
    let contacts: readonly { name: string }[] = [];
    addressBook.getAddresses().subscribe((v) => (addresses = v));
    addressBook.getContacts().subscribe((v) => (contacts = v));

    expect(addresses.map((a) => a.name)).toContain(MOCK_ADDRESS_LOCAL);
    expect(contacts.map((c) => c.name)).toContain(MOCK_CONTACT_PRIMARY);
  });

  it('serves one address list for billing and shipping alike', () => {
    // Not two endpoints and not a filtered subset - the same records answer both.
    let first: readonly { name: string }[] = [];
    let second: readonly { name: string }[] = [];
    addressBook.getAddresses().subscribe((v) => (first = v));
    addressBook.getAddresses().subscribe((v) => (second = v));

    expect(first.map((a) => a.name)).toEqual(second.map((a) => a.name));
    expect(first.length).toBeGreaterThan(1);
  });

  // -------------------------------------------------------------- selection

  it('preselects the contact, billing and shipping the cart already holds', () => {
    store.load().subscribe();

    expect(store.contactName()).toBe(MOCK_CONTACT_PRIMARY);
    expect(store.billingAddressName()).toBe(MOCK_ADDRESS_LOCAL);
    expect(store.shippingAddressName()).toBe(MOCK_ADDRESS_LOCAL);
  });

  it('adopts a new contact from the cart the server returns', () => {
    store.load().subscribe();

    store.setContact(MOCK_CONTACT_SECONDARY).subscribe();

    expect(store.contactName()).toBe(MOCK_CONTACT_SECONDARY);
    expect(store.selectionError()).toBeNull();
    expect(store.selecting()).toBeNull();
  });

  it('re-reads the cart after a setter instead of ingesting the acknowledgement', () => {
    store.load().subscribe();
    store.setContact(MOCK_CONTACT_SECONDARY).subscribe();

    // The setter reply is `{contact_person}` alone. Had the store adopted it, the cart
    // document would have been replaced by a two-field object and these would be gone.
    expect(store.cart()?.items.length).toBe(1);
    expect(store.currency()).toBe('INR');
    expect(store.payload()?.removed_items).toEqual([]);
  });

  it('replaces the total when a selection reprices the cart', () => {
    store.load().subscribe();
    const before = store.cart()?.grand_total ?? 0;

    // The mock server charges a destination surcharge on the out-of-state address.
    store.setBillingAddress(MOCK_ADDRESS_REMOTE).subscribe();

    const cart = store.cart();
    const after = cart?.grand_total ?? 0;
    expect(after).toBeGreaterThan(before);
    // The figure is the server's, and the surcharge landed in the server's tax total -
    // nothing here recomputed it from the lines.
    expect(cart?.tax_total).toBeGreaterThan(0);
  });

  it('reflects a shipping address the backend filled in from billing', () => {
    // The backend copies billing into shipping only when shipping is empty, which is
    // the state a first-time cart is in.
    mockCart.clearShippingAddress();
    store.load().subscribe();
    expect(store.shippingAddressName()).toBeNull();

    store.setBillingAddress(MOCK_ADDRESS_REMOTE).subscribe();

    expect(store.billingAddressName()).toBe(MOCK_ADDRESS_REMOTE);
    // Never requested by the frontend. It arrived on the cart, and is shown because of
    // that alone - no local "same as billing" rule produced it.
    expect(store.shippingAddressName()).toBe(MOCK_ADDRESS_REMOTE);
  });

  it('does not overwrite a shipping address the buyer already chose', () => {
    store.load().subscribe();
    store.setShippingAddress(MOCK_ADDRESS_REMOTE).subscribe();

    store.setBillingAddress(MOCK_ADDRESS_LOCAL).subscribe();

    // Shipping was already set, so the backend leaves it alone.
    expect(store.shippingAddressName()).toBe(MOCK_ADDRESS_REMOTE);
    expect(store.billingAddressName()).toBe(MOCK_ADDRESS_LOCAL);
  });

  it('changes the shipping address on its own', () => {
    store.load().subscribe();

    store.setShippingAddress(MOCK_ADDRESS_REMOTE).subscribe();

    expect(store.shippingAddressName()).toBe(MOCK_ADDRESS_REMOTE);
    // Billing is untouched - the two are independent once both are set.
    expect(store.billingAddressName()).toBe(MOCK_ADDRESS_LOCAL);
  });

  // ---------------------------------------------------------- shippability

  it('reports the cart as shippable from the server value only', () => {
    store.load().subscribe();
    expect(store.isShippable()).toBe(true);
  });

  it('reports a non-shippable cart and refuses a shipping address', () => {
    scenario.scenario.set('cart-not-shippable');
    store.load().subscribe();

    expect(store.isShippable()).toBe(false);

    store.setShippingAddress(MOCK_ADDRESS_REMOTE).subscribe();
    expect(store.selectionError()?.code).toBe('shipping_not_applicable');
  });

  it('re-evaluates shippability on every cart response rather than caching it', () => {
    store.load().subscribe();
    expect(store.isShippable()).toBe(true);

    scenario.scenario.set('cart-not-shippable');
    store.load().subscribe();

    expect(store.isShippable()).toBe(false);
  });

  // -------------------------------------------------------------- failures

  it('reports an unknown contact without confirming whether it exists', () => {
    store.load().subscribe();

    store.setContact('SOMEONE-ELSES-CONTACT').subscribe();

    expect(store.selectionError()?.code).toBe('contact_invalid');
    // The previous selection is untouched: nothing was applied optimistically.
    expect(store.contactName()).toBe(MOCK_CONTACT_PRIMARY);
  });

  it('reports an unknown billing address the same way', () => {
    store.load().subscribe();

    store.setBillingAddress('SOMEONE-ELSES-ADDRESS').subscribe();

    expect(store.selectionError()?.code).toBe('billing_address_invalid');
    expect(store.billingAddressName()).toBe(MOCK_ADDRESS_LOCAL);
  });

  it('leaves the session signed in when a selection is refused', () => {
    store.load().subscribe();

    store.setContact('SOMEONE-ELSES-CONTACT').subscribe();

    // A business validation failure is not a session failure - Phase 9.5 semantics.
    expect(session.isAuthenticated()).toBe(true);
    expect(session.status()).toBe('authenticated');
  });

  it('drops a second selection while one is in flight', () => {
    store.load().subscribe();

    // Both subscribe synchronously against the in-memory mock, so the first has not
    // settled when the second is attempted only if we inspect mid-flight; instead
    // assert the guard directly by starting one and checking the other returns EMPTY.
    let secondEmitted = false;
    store.setContact(MOCK_CONTACT_SECONDARY).subscribe({
      next: () => {
        // Re-entrant: a selection attempted while this one is still settling.
        store.setBillingAddress(MOCK_ADDRESS_REMOTE).subscribe(() => (secondEmitted = true));
      },
    });

    expect(secondEmitted).toBe(false);
    expect(store.billingAddressName()).toBe(MOCK_ADDRESS_LOCAL);
  });

  // ----------------------------------------------------------------- create

  it('creates an address that then appears in the list', () => {
    let created: { name: string } | undefined;
    addressBook
      .addAddress({
        address_title: 'New Depot',
        address_line1: 'Shed 7',
        address_line2: '',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
        country: 'India',
      })
      .subscribe((value) => (created = value));

    expect(created?.name).toBeTruthy();

    let addresses: readonly { name: string }[] = [];
    addressBook.getAddresses().subscribe((v) => (addresses = v));
    expect(addresses.map((a) => a.name)).toContain(created?.name);
  });

  it('selects a newly created address as billing', () => {
    store.load().subscribe();

    let created = '';
    addressBook
      .addAddress({
        address_title: 'New Depot',
        address_line1: 'Shed 7',
        address_line2: '',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
        country: 'India',
      })
      .subscribe((value) => (created = value.name));

    store.setBillingAddress(created).subscribe();

    expect(store.billingAddressName()).toBe(created);
  });

  it('creates a contact whose full_name only the list knows', () => {
    let created: { name: string; full_name: string | null } | undefined;
    addressBook
      .addContact({ first_name: 'Ravi', last_name: 'Mock', email: '', phone: '' })
      .subscribe((value) => (created = value));

    // The create reply omits full_name, exactly as the backend does - which is why the
    // application re-reads the list rather than appending this record to it.
    expect(created?.full_name).toBeUndefined();

    let contacts: readonly { name: string; full_name: string | null }[] = [];
    addressBook.getContacts().subscribe((v) => (contacts = v));
    expect(contacts.find((c) => c.name === created?.name)?.full_name).toBe('Ravi Mock');
  });

  it('selects a newly created contact', () => {
    store.load().subscribe();

    let created = '';
    addressBook
      .addContact({ first_name: 'Ravi', last_name: 'Mock', email: '', phone: '' })
      .subscribe((value) => (created = value.name));

    store.setContact(created).subscribe();

    expect(store.contactName()).toBe(created);
  });

  it('forgets records created in a session once it ends', () => {
    let created = '';
    addressBook
      .addContact({ first_name: 'Ravi', last_name: 'Mock', email: '', phone: '' })
      .subscribe((value) => (created = value.name));

    session.signOut().subscribe();
    mockSession.signIn('TEST_APP', 'password');
    session.restore().subscribe();

    // Master data is read per customer; it must not survive into the next session.
    let contacts: readonly { name: string }[] = [];
    addressBook.getContacts().subscribe((v) => (contacts = v));
    expect(contacts.map((c) => c.name)).not.toContain(created);
  });

  it('rejects a contact with no first name, naming the field', () => {
    let code: string | undefined;
    let field: string | undefined;
    addressBook.addContact({ first_name: '', last_name: '', email: '', phone: '' }).subscribe({
      error: (e: { code: string; field?: string }) => {
        code = e.code;
        field = e.field;
      },
    });

    expect(code).toBe('validation_failed');
    expect(field).toBe('first_name');
  });
});
