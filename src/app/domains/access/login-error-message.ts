import {
  YOB_CLIENT_ERROR_CODES,
  type YobApiError,
} from '../../foundation/network/yob-api-error';

/**
 * Turns a normalized API failure into something worth showing a person trying to
 * sign in.
 *
 * This lives in the access domain, not in `foundation`: the transport layer's job is
 * to produce a stable `code`, and deciding what that means to a *user on this screen*
 * is a product decision that differs per screen. The same `rate_limit_exceeded` reads
 * differently on a sign-in form than it would on a search box.
 *
 * ## What is deliberately never shown
 *
 * `YobApiError` already discards Frappe tracebacks, but `detail` still carries
 * backend wording that can be wrong for this context ("Application is required."
 * describes a misconfiguration, not something the user typed). So the mapping is by
 * `code` only, and every branch returns text written for this screen. Nothing from
 * the backend is echoed: no exception names, no `exc_type`, no server HTML.
 *
 * ## Why invalid credentials is vague on purpose
 *
 * A message that distinguished "no such user" from "wrong password" would turn the
 * sign-in form into a way to test whether an account exists. The backend already
 * refuses to make that distinction; the UI must not undo it.
 *
 * The caller keeps the original `YobApiError` for diagnostics - see
 * `LoginPage.lastError`.
 */
export function loginErrorMessage(error: YobApiError): string {
  switch (error.code) {
    case 'invalid_credentials':
      // Deliberately does not reveal whether the username exists.
      return $localize`:@@login.error.invalidCredentials:The username or password is incorrect.`;

    case 'application_access_denied':
      // Two very different causes: the account genuinely lacks storefront access, or
      // the request did not reach the backend through the edge proxy. The user can
      // act on neither, so the message points at support rather than guessing.
      return $localize`:@@login.error.accessDenied:This account cannot access this store. Please contact support.`;

    case 'login_method_disabled':
      return $localize`:@@login.error.methodDisabled:Signing in with a password is currently unavailable.`;

    case 'rate_limit_exceeded':
      // No countdown: the backend does not return a retry duration, and inventing one
      // would be worse than saying nothing.
      return $localize`:@@login.error.rateLimited:Too many sign-in attempts. Please wait a few minutes and try again.`;

    case 'validation_failed':
      // The form guarantees both fields are filled, so reaching this means the
      // application code sent with the request is wrong - a configuration fault.
      return $localize`:@@login.error.validationFailed:We could not process that sign-in request. Please contact support.`;

    case YOB_CLIENT_ERROR_CODES.networkUnavailable:
      return $localize`:@@login.error.offline:We could not reach the server. Check your connection and try again.`;

    case YOB_CLIENT_ERROR_CODES.requestTimeout:
      return $localize`:@@login.error.timeout:The server took too long to respond. Please try again.`;

    default:
      // Includes internal_server_error and anything the backend adds later. A code we
      // do not recognise must never fall through to the backend's own wording.
      return $localize`:@@login.error.unexpected:Something went wrong. Please try again.`;
  }
}
