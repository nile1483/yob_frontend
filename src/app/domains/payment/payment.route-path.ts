import { sanitizeReturnUrl } from '../../foundation/session/return-url';

/** The public payment route's base path. Owned here, used by the route table too. */
export const PAYMENT_PATH = '/payment';

/**
 * Accept a server-returned `payment_url` only if it is this application's payment route.
 *
 * `proceed_to_payment` returns the path to send the buyer to, and using it as given is
 * the contract - the server decides where checkout continues. But "the server said so"
 * is not the same as "it is safe to navigate anywhere it names": a bug or a compromised
 * response upstream would turn this into an open redirect out of the storefront, and
 * the buyer would have no way to tell.
 *
 * So the check is narrow on purpose. It is not trying to validate a URL in general - it
 * asserts one specific thing, that this is an internal `/payment/...` path with a
 * non-empty token segment. Anything else is refused and the caller reports an ordinary
 * failure rather than following it.
 *
 * The internal-path rules themselves are reused from {@link sanitizeReturnUrl} rather
 * than rewritten: protocol-relative `//host`, backslash smuggling, embedded schemes and
 * control characters are the same attacks whoever supplied the string, and one
 * implementation of that reasoning is enough.
 *
 * Returns the path unchanged when acceptable, or `null`.
 */
export function sanitizePaymentUrl(candidate: string | null | undefined): string | null {
  const internal = sanitizeReturnUrl(candidate);
  if (internal === null) {
    return null;
  }

  // Strip any query or fragment before matching, so `/payment/x?next=…` cannot smuggle
  // extra routing past the segment check.
  const [path] = internal.split(/[?#]/);

  if (!path.startsWith(`${PAYMENT_PATH}/`)) {
    return null;
  }

  // Exactly one more segment, and it must not be empty: `/payment/` and
  // `/payment/a/b` are both wrong shapes for `/payment/:token`.
  const segments = path.slice(1).split('/');
  if (segments.length !== 2 || segments[1] === '') {
    return null;
  }

  return internal;
}
