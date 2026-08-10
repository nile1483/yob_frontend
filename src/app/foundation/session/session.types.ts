import type { SessionContextDto } from '../auth/auth.types';

/**
 * The session lifecycle.
 *
 * Deliberately not a boolean: "not authenticated" and "we have not asked yet" lead to
 * completely different behaviour, and collapsing them is how apps end up flashing a
 * sign-in screen at users who are already signed in.
 *
 * - `unknown`       not yet resolved, or a restore attempt failed unexpectedly
 * - `restoring`     a `get_session_context` call is in flight
 * - `guest`         confirmed no session
 * - `authenticated` confirmed session, context available
 *
 * `unknown` after a failed restore is distinguishable from `guest` by
 * `SessionStore.restoreError`.
 */
export type SessionStatus = 'unknown' | 'restoring' | 'guest' | 'authenticated';

/**
 * The authenticated context held in memory.
 *
 * `Omit<…, 'csrf_token'>` is load-bearing, not cosmetic: the token lives in
 * `CsrfTokenStore` alone, and this type makes a second copy inside session state a
 * compile error rather than a code-review question.
 */
export type SessionContext = Omit<SessionContextDto, 'csrf_token'>;
