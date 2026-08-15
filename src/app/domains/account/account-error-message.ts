import type { YobApiError } from '../../foundation/network/yob-api-error';

/** What the page should do about a failed Account mutation. */
export type AccountFailureKind =
  /** The server refused for a business reason. Definite - keep the record, no retry. */
  | 'refused'
  /** The record is gone or was never this customer's. Re-read the list. */
  | 'gone'
  /** Completion is unknown. Re-read the list and let it decide. */
  | 'uncertain'
  /** Anything else. */
  | 'generic';

export interface AccountFailure {
  readonly kind: AccountFailureKind;
  readonly message: string;
}

/**
 * Safe wording for an Account mutation failure.
 *
 * Every message is written here and chosen by stable code. The backend's `detail` is
 * never rendered: it has carried Frappe link-integrity text with Desk URLs in it, and
 * although Phase 15B stopped that particular leak, the rule is that server prose does
 * not reach the page.
 *
 * ## `*_in_use` is a normal outcome, not a fault
 *
 * A referenced record cannot be deleted, and the server detaches nothing. That is the
 * system working. Wording it like a failure - or offering a retry - would tell the
 * buyer to keep pressing a button that can never succeed.
 *
 * So it is phrased as information with a way forward ("you can edit it instead") rather
 * than as a refusal. It is shown in the page's ordinary notice tone, never as an error:
 * nothing went wrong, and a red banner would suggest otherwise.
 *
 * The referring document is deliberately not named: a buyer does not need to know which
 * internal record holds the link, and naming it would leak order and cart identifiers
 * into the account page.
 */
export function accountFailure(error: YobApiError): AccountFailure {
  switch (error.code) {
    case 'address_in_use':
      return {
        kind: 'refused',
        message: $localize`:@@account.error.addressInUse:This address is used by an existing order, so it needs to stay on your account. You can edit it instead.`,
      };

    case 'contact_in_use':
      return {
        kind: 'refused',
        message: $localize`:@@account.error.contactInUse:This contact is used by an existing order, so it needs to stay on your account. You can edit it instead.`,
      };

    case 'address_not_found':
      // Unknown and another customer's answer identically, deliberately. The wording
      // must not imply we know which, because we do not.
      return {
        kind: 'gone',
        message: $localize`:@@account.error.addressGone:That address is no longer available. Your list has been refreshed.`,
      };

    case 'contact_not_found':
      return {
        kind: 'gone',
        message: $localize`:@@account.error.contactGone:That contact is no longer available. Your list has been refreshed.`,
      };

    case 'validation_failed':
      // Attached to the named input by the caller. Deliberately short: the field it
      // sits under says which value, and the backend's own wording is not shown.
      return {
        kind: 'refused',
        message: $localize`:@@account.error.validation:Please check this value.`,
      };

    case 'client_network_unavailable':
      return {
        kind: 'uncertain',
        message: $localize`:@@account.error.offline:We could not reach the server. Check your connection and try again.`,
      };

    default:
      return {
        kind: 'generic',
        message: $localize`:@@account.error.generic:We could not save that change. Please try again.`,
      };
  }
}

/**
 * Whether a failure leaves a **delete** outcome genuinely unknown.
 *
 * Only transport faults and server errors qualify. A `409 in_use` or a `404 not_found`
 * is the server having considered the request and answered it - nothing to recover
 * from, and re-reading the list on every business refusal would be noise.
 *
 * The distinction matters because deletes must never be retried: a delete that
 * succeeded and lost its response answers `404` the second time, so the recovery for
 * an unknown outcome is a **read**, never another delete.
 */
export function isUncertainOutcome(error: YobApiError): boolean {
  return error.httpStatus === 0 || error.httpStatus >= 500;
}

/** Wording for a delete whose outcome could not be determined. */
export function uncertainDeleteMessage(stillPresent: boolean): string {
  return stillPresent
    ? $localize`:@@account.delete.unconfirmed:We couldn't confirm whether that was deleted. It is still listed - please check before trying again.`
    : $localize`:@@account.delete.confirmedGone:We couldn't confirm the deletion, but the record is no longer in your account.`;
}

/** Wording when even the recovery read failed, so nothing is known. */
export function unknownStateMessage(): string {
  return $localize`:@@account.delete.unknown:We couldn't confirm the result. Please refresh and check your account before trying again.`;
}
