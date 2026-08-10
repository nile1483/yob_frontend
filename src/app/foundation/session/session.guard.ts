import { inject } from '@angular/core';
import { Router, type CanActivateFn, type UrlTree } from '@angular/router';

import {
  LOGIN_PATH,
  RETURN_URL_PARAM,
  SESSION_UNAVAILABLE_PATH,
  sanitizeReturnUrl,
} from './return-url';
import { SessionStore } from './session.store';

/**
 * Protects the secure route branch.
 *
 * Reads `SessionStore` and nothing else. It issues no HTTP request of its own: the
 * app initializer already resolved the session before the first navigation, and
 * asking again on every route change would put a network round trip in front of every
 * click while creating a second, competing answer to "who is signed in".
 *
 * The three-way session status is exactly why it is not a boolean. Each branch means
 * something different to a user:
 *
 * - `authenticated`   let them through
 * - `guest`           send them to sign in, remembering where they were going
 * - anything else     the session could not be resolved - a backend outage, a
 *                     timeout, or `application_access_denied` from a misconfigured
 *                     proxy. Sending those to the sign-in page would be a lie: their
 *                     credentials are fine, and signing in again cannot help. It also
 *                     invites a loop, because the next restore fails the same way.
 *
 * Only `/login` and `/session-unavailable` are named here. Both are structural parts
 * of the route tree rather than business routes, and both live in the public branch,
 * so neither redirect can bounce back into this guard.
 */
export const secureRouteGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const session = inject(SessionStore);
  const router = inject(Router);

  if (session.isAuthenticated()) {
    return true;
  }

  // `state.url` is produced by the router, so it is already local. Passing it through
  // the shared validator anyway keeps one definition of "a URL we are willing to
  // return to", rather than a second rule that only looks equivalent.
  const returnUrl = sanitizeReturnUrl(state.url);
  const queryParams = returnUrl === null ? {} : { [RETURN_URL_PARAM]: returnUrl };

  if (session.isGuest()) {
    return router.createUrlTree([LOGIN_PATH], { queryParams });
  }

  // The destination is preserved here too: a backend outage is a delay, not a reason
  // to lose where the user was going. Retrying can send them straight on.
  return router.createUrlTree([SESSION_UNAVAILABLE_PATH], { queryParams });
};
