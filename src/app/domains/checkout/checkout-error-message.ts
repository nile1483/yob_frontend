import type { YobApiError } from '../../foundation/network/yob-api-error';

/**
 * Safe, localized wording for a checkout selection failure.
 *
 * ## Nothing from the backend is displayed
 *
 * Every message is written here and chosen by stable error `code`. The backend's own
 * `detail` is never rendered - for `*_invalid` it reads "The selected contact does not
 * belong to this customer", which tells the person at the keyboard that the record
 * exists and is somebody else's. The backend already refuses to distinguish a
 * nonexistent record from a foreign one at the *code* level; surfacing its prose would
 * hand back the distinction it withheld.
 *
 * So a stale selection and a probe for another customer's record produce identical
 * wording: the selection is no longer available, choose another.
 */
export function checkoutSelectionErrorMessage(error: YobApiError): string {
  switch (error.code) {
    case 'contact_invalid':
    case 'contact_required':
      return $localize`:@@checkout.error.contact:The selected contact is no longer available. Please select another.`;

    case 'billing_address_invalid':
    case 'billing_address_required':
    case 'shipping_address_invalid':
    case 'shipping_address_required':
      return $localize`:@@checkout.error.address:The selected address is no longer available. Please select another.`;

    case 'shipping_not_applicable':
      // Not a mistake the buyer made - the cart stopped needing shipping. The section
      // will disappear on the next cart read; this explains why.
      return $localize`:@@checkout.error.shippingNotApplicable:This order no longer needs a shipping address.`;

    case 'client_network_unavailable':
      return $localize`:@@checkout.error.offline:We could not reach the server. Check your connection and try again.`;

    default:
      // Includes internal_server_error and every raw Frappe failure. `client_permission_denied`
      // deliberately lands here too: it is not evidence the session ended (see
      // docs/API-CONTRACT.md 7b), so it must not read like a sign-out.
      return $localize`:@@checkout.error.generic:We could not save that selection. Please try again.`;
  }
}

/**
 * Whether this failure means the master list the buyer chose from is out of date.
 *
 * A record the backend rejects as not the customer's has either been deleted or never
 * belonged to them, and either way the list on screen is wrong. Re-reading it is the
 * only way the next choice can be an informed one.
 */
export function selectionNeedsMasterDataRefresh(error: YobApiError): boolean {
  return (
    error.code === 'contact_invalid' ||
    error.code === 'billing_address_invalid' ||
    error.code === 'shipping_address_invalid'
  );
}

/**
 * Safe wording for a failed create.
 *
 * `validation_failed` is the one case where the backend's `field` is worth acting on -
 * it names the input at fault - but the text still comes from here.
 */
export function checkoutCreateErrorMessage(error: YobApiError): string {
  switch (error.code) {
    case 'validation_failed':
      return $localize`:@@checkout.error.create.validation:Please check the details and try again.`;

    case 'client_network_unavailable':
      return $localize`:@@checkout.error.offline:We could not reach the server. Check your connection and try again.`;

    default:
      return $localize`:@@checkout.error.create.generic:We could not save that. Please try again.`;
  }
}
