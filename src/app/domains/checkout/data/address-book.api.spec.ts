import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { YobApiError } from '../../../foundation/network/yob-api-error';
import { YOB_API_CONFIG, type YobApiConfig } from '../../../foundation/network/yob-api.config';
import { CartApi } from '../../cart/data/cart.api';
import { AddressBookApi } from './address-book.api';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

const GET_ADDRESSES = '/api/method/yob_storefront.api.address.get_addresses';
const GET_CONTACTS = '/api/method/yob_storefront.api.address.get_contacts';
const ADD_ADDRESS = '/api/method/yob_storefront.api.address.add_address';
const ADD_CONTACT = '/api/method/yob_storefront.api.address.add_contact';
const SET_CONTACT = '/api/method/yob_storefront.api.cart.set_cart_contact';
const SET_BILLING = '/api/method/yob_storefront.api.cart.set_cart_billing_address';
const SET_SHIPPING = '/api/method/yob_storefront.api.cart.set_cart_shipping_address';

/** A record identifier, deliberately different from anything a label would contain. */
const ADDRESS_NAME = 'Mock Trading Co - Head Office-Billing';
const CONTACT_NAME = 'CONT-MOCK-0001';

describe('Checkout master data', () => {
  let addressBook: AddressBookApi;
  let cart: CartApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    addressBook = TestBed.inject(AddressBookApi);
    cart = TestBed.inject(CartApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('AddressBookApi', () => {
    it('reads addresses from the documented RPC method', () => {
      let value: readonly unknown[] | undefined;
      addressBook.getAddresses().subscribe((v) => (value = v));

      const req = http.expectOne(GET_ADDRESSES);
      expect(req.request.method).toBe('GET');
      // No parameters: the customer comes from the session, never the query string.
      expect(req.request.params.keys()).toEqual([]);

      req.flush({ message: { data: [{ name: ADDRESS_NAME }], meta: { count: 1 } } });
      expect(value).toEqual([{ name: ADDRESS_NAME }]);
    });

    it('reads contacts from the documented RPC method', () => {
      let value: readonly unknown[] | undefined;
      addressBook.getContacts().subscribe((v) => (value = v));

      const req = http.expectOne(GET_CONTACTS);
      expect(req.request.method).toBe('GET');

      req.flush({ message: { data: [{ name: CONTACT_NAME }], meta: { count: 1 } } });
      expect(value).toEqual([{ name: CONTACT_NAME }]);
    });

    it('posts the address fields under their documented names', () => {
      addressBook
        .addAddress({
          address_title: 'Depot',
          address_line1: 'Unit 4',
          address_line2: '',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400067',
          country: 'India',
        })
        .subscribe();

      const req = http.expectOne(ADD_ADDRESS);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        address_title: 'Depot',
        address_line1: 'Unit 4',
        address_line2: '',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400067',
        country: 'India',
      });

      req.flush(
        { message: { data: { name: ADDRESS_NAME } } },
        { status: 201, statusText: 'Created' },
      );
    });

    it('does not send address_type or any GST field', () => {
      addressBook
        .addAddress({
          address_title: '',
          address_line1: 'Unit 4',
          address_line2: '',
          city: 'Mumbai',
          state: '',
          pincode: '',
          country: 'India',
        })
        .subscribe();

      const req = http.expectOne(ADD_ADDRESS);
      const body = req.request.body as Record<string, unknown>;
      // The backend defaults address_type; the allowed values of the GST fields are
      // unverified, so guessing one would be inventing contract data.
      for (const forbidden of [
        'address_type',
        'gstin',
        'gst_category',
        'gst_state',
        'tax_category',
      ]) {
        expect(body[forbidden]).toBeUndefined();
      }

      req.flush(
        { message: { data: { name: ADDRESS_NAME } } },
        { status: 201, statusText: 'Created' },
      );
    });

    it('posts the contact fields under their documented names', () => {
      addressBook
        .addContact({
          first_name: 'Priya',
          last_name: 'Mock',
          email: 'priya.mock@example.invalid',
          phone: '+91 22 5550 0101',
        })
        .subscribe();

      const req = http.expectOne(ADD_CONTACT);
      expect(req.request.method).toBe('POST');
      // `email`/`phone`, which the backend maps into its child tables - not `email_id`.
      expect(req.request.body).toEqual({
        first_name: 'Priya',
        last_name: 'Mock',
        email: 'priya.mock@example.invalid',
        phone: '+91 22 5550 0101',
      });

      req.flush(
        { message: { data: { name: CONTACT_NAME } } },
        { status: 201, statusText: 'Created' },
      );
    });

    it('surfaces the backend field on a contact validation failure', () => {
      let error: YobApiError | undefined;
      addressBook
        .addContact({ first_name: '', last_name: '', email: '', phone: '' })
        .subscribe({ error: (e: YobApiError) => (error = e) });

      http
        .expectOne(ADD_CONTACT)
        .flush(
          {
            message: { errors: [{ code: 'validation_failed', detail: 'x', field: 'first_name' }] },
          },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      expect(error?.code).toBe('validation_failed');
      expect(error?.field).toBe('first_name');
    });
  });

  describe('cart selection setters', () => {
    it('sends the contact record name under contact_person', () => {
      cart.setContact(CONTACT_NAME).subscribe();

      const req = http.expectOne(SET_CONTACT);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ contact_person: CONTACT_NAME });
      req.flush({ message: { data: { contact_person: CONTACT_NAME } } });
    });

    it('sends the address record name under billing_address', () => {
      cart.setBillingAddress(ADDRESS_NAME).subscribe();

      const req = http.expectOne(SET_BILLING);
      // The record `name`, never the human-readable title shown in the list.
      expect(req.request.body).toEqual({ billing_address: ADDRESS_NAME });
      req.flush({ message: { data: { billing_address: ADDRESS_NAME } } });
    });

    it('sends the address record name under shipping_address', () => {
      cart.setShippingAddress(ADDRESS_NAME).subscribe();

      const req = http.expectOne(SET_SHIPPING);
      expect(req.request.body).toEqual({ shipping_address: ADDRESS_NAME });
      req.flush({ message: { data: { shipping_address: ADDRESS_NAME } } });
    });

    it('reports shipping_not_applicable without a field', () => {
      let error: YobApiError | undefined;
      cart.setShippingAddress(ADDRESS_NAME).subscribe({ error: (e: YobApiError) => (error = e) });

      http.expectOne(SET_SHIPPING).flush(
        {
          message: {
            errors: [{ code: 'shipping_not_applicable', detail: 'Shipping is not required.' }],
          },
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

      expect(error?.code).toBe('shipping_not_applicable');
      // No input is at fault, so the backend names no field and nor may we.
      expect(error?.field).toBeUndefined();
    });
  });
});
