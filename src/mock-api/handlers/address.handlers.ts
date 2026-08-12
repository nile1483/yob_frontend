import { isRecord } from '../../app/foundation/network/yob-api.types';
import type { MockContext, MockHandler } from '../core/mock-handler';
import { type MockReply, mockPermissionError, mockSuccess, mockYobError } from '../core/mock-reply';

/**
 * Address and Contact master-data handlers.
 *
 * Reproduce `yob_storefront/api/address.py` as it behaves today, including two details
 * a convenient mock would smooth over:
 *
 * - the create replies are `201`, not `200`
 * - `add_contact`'s reply omits `full_name`, because Frappe composes that on save and
 *   the endpoint returns the fields it set rather than the saved document
 *
 * The second one is why the application re-reads the list after creating: a UI that
 * adopted the create reply would show a contact with no name. A mock that helpfully
 * included `full_name` would hide that from every test.
 */

const getAddresses: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  applyStaleScenario(ctx);
  const addresses = ctx.scenario === 'empty' ? [] : ctx.addressBook.addresses();
  return mockSuccess(addresses, {
    notice: 'Addresses loaded',
    meta: { count: addresses.length },
  });
};

const getContacts: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  applyStaleScenario(ctx);
  const contacts = ctx.scenario === 'empty' ? [] : ctx.addressBook.contacts();
  return mockSuccess(contacts, {
    notice: 'Contacts loaded',
    meta: { count: contacts.length },
  });
};

/**
 * Create an Address.
 *
 * The storefront endpoint itself validates nothing - it hands the values to Frappe,
 * whose Address doctype requires `address_line1`, `city` and `country`. Because
 * `add_address` wraps everything in a bare `except Exception`, that mandatory-field
 * failure surfaces as a generic 500 `internal_server_error` rather than a
 * `validation_failed` naming the field. Unhelpful, and reproduced faithfully: the
 * frontend's own required-field checks exist precisely because of it.
 */
const addAddress: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  const body = readBody(ctx);
  const line1 = readString(body, 'address_line1');
  const city = readString(body, 'city');
  const country = readString(body, 'country');

  if (line1 === '' || city === '' || country === '') {
    return mockYobError('internal_server_error', 'Failed to create address', {
      details: { correlation_id: 'mock000000000000' },
      status: 500,
    });
  }

  const created = ctx.addressBook.createAddress({
    address_title: readString(body, 'address_title'),
    address_line1: line1,
    address_line2: readString(body, 'address_line2'),
    city,
    state: readString(body, 'state'),
    pincode: readString(body, 'pincode'),
    country,
  });

  return mockSuccess(created, { notice: 'Address created', status: 201 });
};

/**
 * Create a Contact.
 *
 * `first_name` is the one field the endpoint checks itself, and it reports it properly:
 * 422 `validation_failed` with `field: "first_name"`.
 */
const addContact: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  const body = readBody(ctx);
  const firstName = readString(body, 'first_name');

  if (firstName === '') {
    return mockYobError('validation_failed', 'First name is required.', {
      field: 'first_name',
      status: 422,
    });
  }

  const created = ctx.addressBook.createContact({
    first_name: firstName,
    last_name: readString(body, 'last_name'),
    email: readString(body, 'email'),
    phone: readString(body, 'phone'),
  });

  // Exactly the fields the backend returns - note the absent `full_name`.
  return mockSuccess(
    {
      name: created.name,
      first_name: created.first_name,
      last_name: created.last_name,
      salutation: created.salutation,
      designation: created.designation,
      email: created.email,
      phone: created.phone,
    },
    { notice: 'Contact created', status: 201 },
  );
};

/** Mirror the scenario onto the mock server's master data. */
function applyStaleScenario(ctx: MockContext): void {
  ctx.addressBook.setIncludeStale(ctx.scenario === 'checkout-stale-records');
}

function readBody(ctx: MockContext): Record<string, unknown> {
  const body: unknown = ctx.request.body;
  return isRecord(body) ? body : {};
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

function requireSession(ctx: MockContext): MockReply | null {
  return ctx.session.isAuthenticated() ? null : mockPermissionError(ctx.rpcMethod);
}

export const ADDRESS_HANDLERS: Readonly<Record<string, MockHandler>> = {
  'yob_storefront.api.address.get_addresses': getAddresses,
  'yob_storefront.api.address.get_contacts': getContacts,
  'yob_storefront.api.address.add_address': addAddress,
  'yob_storefront.api.address.add_contact': addContact,
};
