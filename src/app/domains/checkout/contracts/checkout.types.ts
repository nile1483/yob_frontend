/**
 * Checkout master-data contracts: the Addresses and Contacts a customer can choose.
 *
 * These are *master records*, not cart state. The cart stores only their `name`, and
 * `CartStore` owns which one is currently selected - nothing here duplicates that.
 *
 * All four shapes are wire-verified against the live bench on 2026-08-12, using the
 * one real Address and one real Contact the storefront customer owns. The create
 * responses are source-verified from `yob_storefront/api/address.py`; see
 * `docs/PROJECT-STATE.md`.
 */

/**
 * One Address the customer may select for billing or shipping.
 *
 * `name` is the Frappe record identifier and the only value ever sent back to the
 * backend. It is human-readable on this bench (`"Shayona Test Buyer-Billing"`) purely
 * because Frappe derives it from the title - it is still an identifier, not a label.
 */
export interface AddressDto {
  readonly name: string;
  readonly address_title: string | null;
  /** `Billing`, `Shipping`, … Allowed values are unverified, so nothing branches on it. */
  readonly address_type: string | null;
  readonly address_line1: string | null;
  readonly address_line2: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly pincode: string | null;
  readonly country: string | null;
  /** Frappe check field: `0`/`1`, not a boolean. */
  readonly is_primary_address: number;
  readonly is_shipping_address: number;
  /**
   * The backend's pre-rendered address block.
   *
   * **Contains HTML** - `<br>` tags, and on this bench the customer's GSTIN. Never
   * bind it as markup. The structured fields above are what the UI renders; this is
   * kept only because it is part of the verified contract.
   */
  readonly display: string | null;
}

/** One Contact the customer may select as the cart's contact person. */
export interface ContactDto {
  readonly name: string;
  /** Composed by Frappe from salutation/first/last. Absent from `add_contact`'s reply. */
  readonly full_name: string | null;
  readonly salutation: string | null;
  readonly first_name: string | null;
  readonly last_name: string | null;
  readonly gender: string | null;
  readonly company_name: string | null;
  readonly designation: string | null;
  /** Flattened from the `email_ids` child table - first row only. */
  readonly email: string | null;
  /** Flattened from the `phone_nos` child table - first row only. */
  readonly phone: string | null;
}

/**
 * The body `add_address` accepts.
 *
 * The same shape the form holds, so a create sends the values as typed. Every key is
 * present, which on a create is exactly right: there is no stored value to preserve.
 *
 * `address_type`, `fax`, the GST fields and the default flags are all accepted by the
 * endpoint and all omitted here - `address_type` defaults to `Billing` server-side,
 * and the rest have either unverified allowed values or no storefront meaning.
 */
export type AddAddressRequest = AddressFormValues;

/**
 * The body `add_contact` accepts.
 *
 * `first_name` is the only field the backend requires (422 `validation_failed`,
 * `field: "first_name"`). `email` and `phone` are written into child tables server-side.
 */
export type AddContactRequest = ContactFormValues;

/**
 * Every address field this storefront lets a customer edit.
 *
 * `phone` and `email` are absent for a different reason than the rest: `get_addresses`
 * does not return them, so the editor could not show a stored value and an empty box
 * beside an address that has a phone would be a lie. Recorded as an API gap.
 *
 * The GST fields and the `is_primary_address` / `is_shipping_address` flags are
 * deliberately absent. The flags are writable but there is **no storefront contract
 * for managing the Customer's default billing or shipping address**, so exposing them
 * would mean inventing a meaning for them; the GST fields have unverified allowed
 * values. See `docs/PROJECT-STATE.md`.
 *
 * Every value is a string because that is what an HTML input holds. Emptiness is
 * meaningful - see {@link UpdateAddressRequest}.
 */
export interface AddressFormValues {
  readonly address_title: string;
  readonly address_line1: string;
  readonly address_line2: string;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
  readonly country: string;
}

/** The same for a contact. */
export interface ContactFormValues {
  readonly first_name: string;
  readonly last_name: string;
  readonly email: string;
  readonly phone: string;
}

/**
 * A **partial** address update: `name` plus only the fields that actually changed.
 *
 * ## Presence is the contract
 *
 * The backend reads `key in data`, not truthiness:
 *
 * ```text
 * omitted        -> unchanged
 * "New Street"   -> updated
 * ""             -> deliberately CLEARED
 * 0              -> set to false
 * ```
 *
 * So the payload must preserve the difference between *not supplied* and *supplied
 * empty*. Padding it with `""` for untouched fields would destroy exactly the data
 * that backend Phase 15B stopped destroying - the same bug, moved to the client.
 *
 * Built by `changedFields`, which compares against the record as loaded.
 */
export type UpdateAddressRequest = { readonly name: string } & Partial<AddressFormValues>;

/** The contact equivalent. Same presence semantics. */
export type UpdateContactRequest = { readonly name: string } & Partial<ContactFormValues>;

/**
 * What `checkout.proceed_to_payment` answers with.
 *
 * Reference 2.0.0, `payment.proceed_to_payment`, verification level **`test`** - the
 * real endpoint executed in-process inside a rolled-back savepoint, so the envelope is
 * genuine but no HTTP round trip happened. Treat it as accurate and unproven on the
 * wire, which is why nothing here is inferred beyond the three documented fields.
 *
 * ## What is deliberately absent
 *
 * No amount, no currency, no cart id, no customer, no fingerprint, no obligation
 * lifecycle state. The endpoint does not return them and the frontend has no business
 * knowing them: a Payment Request is an immutable financial obligation issued by the
 * server, and the browser is told only where to send the buyer next.
 *
 * There is also no `created` / `reused` flag, because the frontend must behave
 * identically for `201` and `200`. Whether the server minted a new obligation, reused
 * an open one, or rotated a credential on an existing one is its own business.
 */
export interface ProceedToPaymentData {
  /** The Payment Request name, e.g. `ACC-PRQ-2026-00002`. Diagnostic only. */
  readonly payment_request: string;
  /**
   * A **relative** SPA path, `/payment/<token>`.
   *
   * The navigation contract. It is used as given rather than rebuilt from `token`,
   * so the server keeps ownership of where the buyer goes next.
   */
  readonly payment_url: string;
  /**
   * The checkout credential.
   *
   * A **bearer credential** that expires an hour after issue. It is present in the
   * response because `payment_url` embeds it; it is never stored, logged, or copied
   * into application state. See `docs/PROJECT-STATE.md`.
   */
  readonly token: string;
}
