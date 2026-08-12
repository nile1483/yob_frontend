import type { AddressDto, ContactDto } from '../../app/domains/checkout/contracts/checkout.types';

/**
 * The mock customer's Address and Contact master records.
 *
 * Entirely fictitious. No real customer data, no real GSTIN, and the email domains are
 * `.invalid`, which is reserved by RFC 2606 and can never resolve.
 *
 * Shapes mirror the wire-verified responses from `get_addresses` / `get_contacts`,
 * including the parts that are easy to get wrong: `is_primary_address` is the integer
 * `0`/`1` rather than a boolean, absent values are `null` rather than omitted, and
 * `display` is the backend's pre-rendered **HTML** block.
 *
 * Two addresses in different states on purpose. The mock server charges a destination
 * surcharge on one of them, which is how a test can prove that choosing an address
 * reprices the cart and that the frontend shows the server's new total rather than the
 * one it had.
 */

/** Ahmedabad, Gujarat - the mock company's own state, so no surcharge. */
export const MOCK_ADDRESS_LOCAL = 'ADDR-MOCK-0001';
/** Mumbai, Maharashtra - out of state, so the mock server adds a surcharge. */
export const MOCK_ADDRESS_REMOTE = 'ADDR-MOCK-0002';

export const MOCK_CONTACT_PRIMARY = 'CONT-MOCK-0001';
export const MOCK_CONTACT_SECONDARY = 'CONT-MOCK-0002';

export const MOCK_ADDRESSES: readonly AddressDto[] = [
  {
    name: MOCK_ADDRESS_LOCAL,
    address_title: 'Mock Trading Co - Head Office',
    address_type: 'Billing',
    address_line1: 'Plot 19, Sanand Industrial Estate',
    address_line2: 'Phase II',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '382110',
    country: 'India',
    is_primary_address: 1,
    is_shipping_address: 1,
    display:
      'Plot 19, Sanand Industrial Estate<br>Phase II<br>Ahmedabad<br>Gujarat<br>382110<br>India<br>',
  },
  {
    name: MOCK_ADDRESS_REMOTE,
    address_title: 'Mock Trading Co - Mumbai Depot',
    address_type: 'Shipping',
    address_line1: 'Unit 4, Kandivali Industrial Estate',
    address_line2: null,
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400067',
    country: 'India',
    is_primary_address: 0,
    is_shipping_address: 1,
    display: 'Unit 4, Kandivali Industrial Estate<br>Mumbai<br>Maharashtra<br>400067<br>India<br>',
  },
];

export const MOCK_CONTACTS: readonly ContactDto[] = [
  {
    name: MOCK_CONTACT_PRIMARY,
    full_name: 'Priya Mock',
    salutation: null,
    first_name: 'Priya',
    last_name: 'Mock',
    gender: null,
    company_name: 'Mock Trading Co',
    designation: 'Purchasing Lead',
    email: 'priya.mock@example.invalid',
    phone: '+91 22 5550 0101',
  },
  {
    name: MOCK_CONTACT_SECONDARY,
    full_name: 'Sam Mock',
    salutation: null,
    first_name: 'Sam',
    last_name: 'Mock',
    gender: null,
    company_name: 'Mock Trading Co',
    designation: null,
    email: 'sam.mock@example.invalid',
    phone: null,
  },
];

/**
 * A record the list still shows but the server no longer accepts.
 *
 * Models the ordinary race: the address was deleted elsewhere - another tab, the desk -
 * after this page read the list. It is the only way `billing_address_invalid` and
 * `contact_invalid` are reachable without pretending a customer can guess another
 * customer's record id, and the backend answers both situations identically anyway.
 */
export const MOCK_STALE_ADDRESS: AddressDto = {
  name: 'ADDR-MOCK-STALE',
  address_title: 'Mock Trading Co - Closed Depot',
  address_type: 'Shipping',
  address_line1: '7 Former Lane',
  address_line2: null,
  city: 'Rajkot',
  state: 'Gujarat',
  pincode: '360001',
  country: 'India',
  is_primary_address: 0,
  is_shipping_address: 1,
  display: '7 Former Lane<br>Rajkot<br>Gujarat<br>360001<br>India<br>',
};

export const MOCK_STALE_CONTACT: ContactDto = {
  name: 'CONT-MOCK-STALE',
  full_name: 'Former Mock',
  salutation: null,
  first_name: 'Former',
  last_name: 'Mock',
  gender: null,
  company_name: null,
  designation: null,
  email: 'former.mock@example.invalid',
  phone: null,
};

/**
 * The state the mock company bills from.
 *
 * A destination in a different state attracts {@link MOCK_INTERSTATE_SURCHARGE_RATE}.
 * This stands in for destination-based tax so repricing is observable; it is not a
 * model of GST and nothing in the application depends on the rule.
 */
export const MOCK_HOME_STATE = 'Gujarat';
export const MOCK_INTERSTATE_SURCHARGE_RATE = 0.05;
