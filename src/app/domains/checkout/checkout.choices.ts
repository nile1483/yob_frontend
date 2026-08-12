import type { AddressDto, ContactDto } from './contracts/checkout.types';
import type { ChoiceOption } from './parts/choice-list';

/**
 * Turning master records into something a person can choose between.
 *
 * Presentation only - no API knowledge, no cart knowledge. Kept out of the components
 * so the "which fields identify this record to a human" decision is testable on its
 * own and identical wherever a record appears.
 *
 * Every field is optional in the contract, so each falls back until something
 * meaningful is left. The record `name` is the last resort only: it is an internal
 * identifier, and showing it by default would put `"Shayona Test Buyer-Billing"` on
 * screen where an address belongs.
 */

/**
 * Address label plus enough detail to tell two of them apart.
 *
 * The backend's `display` field is deliberately unused: it is pre-rendered **HTML**,
 * and on the verified bench it embeds the customer's GSTIN. Rendering it would mean
 * either binding server HTML as markup or showing raw `<br>` tags to the buyer.
 */
export function toAddressChoice(address: AddressDto): ChoiceOption {
  const cityState = joinPresent([address.city, address.state], ', ');
  const postal = joinPresent([address.pincode, address.country], ' ');

  return {
    value: address.name,
    label: present(address.address_title) ?? present(address.address_line1) ?? address.name,
    details: [present(address.address_line1), present(address.address_line2), cityState, postal]
      // The first line is already the label when there is no title; do not repeat it.
      .filter((line): line is string => line !== null && line !== address.address_title)
      .filter((line, index, all) => all.indexOf(line) === index),
  };
}

/** Contact label plus whatever contact details exist. */
export function toContactChoice(contact: ContactDto): ChoiceOption {
  const composed = joinPresent([contact.first_name, contact.last_name], ' ');

  return {
    value: contact.name,
    label: present(contact.full_name) ?? composed ?? contact.name,
    details: [
      present(contact.email),
      present(contact.phone),
      joinPresent([contact.designation, contact.company_name], ', '),
    ].filter((line): line is string => line !== null),
  };
}

/** A trimmed non-empty string, or `null`. Frappe returns `null` and `""` alike. */
function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function joinPresent(values: readonly (string | null | undefined)[], separator: string) {
  const parts = values.map(present).filter((value): value is string => value !== null);
  return parts.length === 0 ? null : parts.join(separator);
}
