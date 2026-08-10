/**
 * Return-URL handling for the sign-in redirect.
 *
 * A guest bounced off a secure route carries the URL they wanted in a query
 * parameter, and the sign-in page sends them back there afterwards. That parameter is
 * attacker-controlled - anyone can hand out
 * `…/login?returnUrl=https://phish.example` - so it is never trusted, only validated.
 */

/** Where guests are sent. Structural, not domain knowledge. */
export const LOGIN_PATH = '/login';

/** Where a caller lands when the session could not be resolved at all. */
export const SESSION_UNAVAILABLE_PATH = '/session-unavailable';

export const RETURN_URL_PARAM = 'returnUrl';

/**
 * Where an authenticated user goes when no valid destination was requested.
 *
 * The safe fallback for every return-URL consumer, and the target of the root
 * redirect, so the two cannot drift apart.
 */
export const DEFAULT_AUTHENTICATED_PATH = '/catalog';

/**
 * Accept a return URL only if it is a path inside this application.
 *
 * Rejected, and why each matters:
 *
 * - anything not starting with `/` - absolute URLs (`https://evil.example`) and bare
 *   words that would resolve relative to the current page
 * - `//host` and `/\host` - protocol-relative URLs. Browsers treat both as
 *   *external*, and the backslash form slips past a naive `startsWith('//')` check
 * - any backslash at all - browsers normalise `\` to `/` in URLs, so it can be used
 *   to smuggle a host past path parsing
 * - a scheme after the leading slashes, such as `/javascript:alert(1)`
 * - whitespace and control characters, which can be used to break naive parsers
 *
 * Returns the URL unchanged when it is safe, or `null` when it is not. Callers treat
 * `null` as "no destination was requested" and fall back to their own default, so a
 * hostile value degrades to an ordinary sign-in rather than an error.
 */
export function sanitizeReturnUrl(candidate: string | null | undefined): string | null {
  if (typeof candidate !== 'string' || candidate === '') {
    return null;
  }

  if (/[\s\u0000-\u001f\u007f]/.test(candidate)) {
    return null;
  }

  if (candidate.includes('\\')) {
    return null;
  }

  if (!candidate.startsWith('/') || candidate.startsWith('//')) {
    return null;
  }

  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    return null;
  }

  return candidate;
}
