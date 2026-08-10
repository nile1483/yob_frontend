import { Service, computed, inject, signal } from '@angular/core';
import { type Observable, catchError, map, of, tap, throwError, timeout } from 'rxjs';

import { AuthApi } from '../auth/auth.api';
import type { SessionContextDto, PasswordCredentials } from '../auth/auth.types';
import { CsrfTokenStore } from '../network/csrf-token.store';
import {
  YOB_CLIENT_ERROR_CODES,
  YobApiError,
  clientError,
  normalizeYobFailure,
} from '../network/yob-api-error';
import type { SessionContext, SessionStatus } from './session.types';

/**
 * How long session restoration waits before giving up.
 *
 * Restore runs inside the app initializer, so a request that never answers would
 * leave the application permanently blank - a hung backend must degrade to a visible
 * error, not a white screen. Bounded here rather than in the network client because
 * this is a property of bootstrapping, not of HTTP: ordinary calls happen behind a
 * rendered UI that can show its own pending state.
 *
 * Exported so tests can advance exactly this far. It is a constant, not a setting.
 */
export const SESSION_RESTORE_TIMEOUT_MS = 10_000;

/**
 * The single source of truth for who is signed in.
 *
 * Holds the session context in memory and nothing else. Specifically it does NOT
 * touch localStorage or sessionStorage, and never reads or writes `sid`: that cookie
 * is HttpOnly and host-scoped, so the browser owns it entirely. After a refresh the
 * state is rebuilt by asking the backend, which is the only authority that can
 * actually answer the question.
 *
 * The CSRF token is routed straight to `CsrfTokenStore` and is never held here - see
 * `SessionContext`.
 */
@Service()
export class SessionStore {
  private readonly auth = inject(AuthApi);
  private readonly csrf = inject(CsrfTokenStore);

  private readonly statusSignal = signal<SessionStatus>('unknown');
  private readonly contextSignal = signal<SessionContext | null>(null);
  private readonly restoreErrorSignal = signal<YobApiError | null>(null);

  readonly status = this.statusSignal.asReadonly();

  /** The authenticated context, or `null` for guest/unknown. */
  readonly context = this.contextSignal.asReadonly();

  /**
   * Why the last restore failed unexpectedly.
   *
   * Only set when the outcome was neither `authenticated` nor a legitimate `guest`.
   * A confirmed guest is not an error and leaves this `null`.
   */
  readonly restoreError = this.restoreErrorSignal.asReadonly();

  readonly isAuthenticated = computed(() => this.statusSignal() === 'authenticated');
  readonly isGuest = computed(() => this.statusSignal() === 'guest');

  /** Whether the session question has been answered either way. */
  readonly isResolved = computed(() => this.isAuthenticated() || this.isGuest());

  /** The signed-in user, or `null`. Derived - never a second copy of the truth. */
  readonly user = computed(() => this.contextSignal()?.user ?? null);

  /** The business profile this session acts as, for example a Customer. */
  readonly profileName = computed(() => this.contextSignal()?.context.profile_name ?? null);

  /**
   * Ask the backend who we are. Safe to call on boot and after a refresh.
   *
   * Never errors its stream. It runs inside the app initializer, where a thrown error
   * would break bootstrap, so an unexpected failure is surfaced as state
   * (`status === 'unknown'` plus `restoreError`) rather than as a thrown value. That
   * is a deliberate exception to the usual "do not swallow failures" rule, and it is
   * why the resolved status is returned to the caller.
   *
   * A permission denial here - and only here - means guest.
   *
   * `get_session_context` is not guest-allowed, so Frappe answers a raw 403
   * `PermissionError` when there is no session. The network layer reports that as the
   * neutral `client_permission_denied`, because on an arbitrary endpoint the same
   * response can equally mean an authenticated user was refused a doctype. The
   * session meaning comes from *which call was made*, not from the response: asking
   * "who am I?" and being told "you may not know" answers the question.
   *
   * That inference is confined to this method. A 500, a network outage, a timeout or
   * an `application_access_denied` must stay distinguishable - treating those as "not
   * signed in" would silently sign users out whenever the backend hiccuped.
   *
   * Bounded by {@link SESSION_RESTORE_TIMEOUT_MS}. On expiry the in-flight request is
   * cancelled and the outcome is the same unresolved state as any other unexpected
   * failure, so calling `restore()` again is a clean retry.
   */
  restore(): Observable<SessionStatus> {
    this.statusSignal.set('restoring');
    this.restoreErrorSignal.set(null);

    return this.auth.getSessionContext().pipe(
      timeout({
        each: SESSION_RESTORE_TIMEOUT_MS,
        with: () =>
          throwError(() =>
            clientError({
              kind: 'transport',
              httpStatus: 0,
              code: YOB_CLIENT_ERROR_CODES.requestTimeout,
              detail: 'The server did not respond in time. Please try again.',
            }),
          ),
      }),
      tap((response) => this.establish(response.data)),
      map((): SessionStatus => 'authenticated'),
      catchError((failure: unknown) => {
        const error = normalizeYobFailure(failure);

        // Contextual, not generic: see the note above.
        if (error.code === YOB_CLIENT_ERROR_CODES.permissionDenied) {
          this.becomeGuest();
          return of<SessionStatus>('guest');
        }

        this.clearContext();
        this.statusSignal.set('unknown');
        this.restoreErrorSignal.set(error);
        return of<SessionStatus>('unknown');
      }),
    );
  }

  /**
   * Sign in with a username and password.
   *
   * The login payload is the same shape `get_session_context` returns, so the session
   * is established directly from it - no second round trip, and no invented fields.
   * Frappe's own top-level `home_page` and `full_name` keys are ignored; the network
   * layer never surfaces them.
   *
   * Failures propagate unchanged so the caller can distinguish `invalid_credentials`
   * (401) from `rate_limit_exceeded` (429) from `application_access_denied` (403).
   * A failed attempt never marks the session authenticated.
   */
  signInWithPassword(credentials: PasswordCredentials): Observable<SessionContext> {
    return this.auth
      .loginWithPassword(credentials)
      .pipe(map((response) => this.establish(response.data)));
  }

  /**
   * Sign out.
   *
   * If `logout` is refused with a permission denial, the local state still becomes
   * guest. `logout` is a secure endpoint, so being told we may not call it means the
   * session we were trying to end is already gone - the user asked to leave, and they
   * have. Refusing would trap them in a dead authenticated state.
   *
   * Again this reading is tied to the operation. The same code from a catalog call
   * says nothing about the session and must never reach here.
   *
   * Any other failure - 500, offline, a stale CSRF token - propagates and leaves the
   * local state untouched. Clearing it there would tell the user they are signed out
   * while their server session is still alive, which is worse than a visible error
   * they can retry.
   */
  signOut(): Observable<void> {
    return this.auth.logout().pipe(
      map(() => undefined),
      tap(() => this.becomeGuest()),
      catchError((failure: unknown) => {
        const error = normalizeYobFailure(failure);

        // Contextual, not generic: see the note above.
        if (error.code === YOB_CLIENT_ERROR_CODES.permissionDenied) {
          this.becomeGuest();
          return of(undefined);
        }

        return throwError(() => error);
      }),
    );
  }

  /** Adopt an authenticated payload, routing the CSRF token to its own store. */
  private establish(dto: SessionContextDto): SessionContext {
    const { csrf_token, ...context } = dto;

    this.csrf.set(csrf_token);
    this.contextSignal.set(context);
    this.restoreErrorSignal.set(null);
    this.statusSignal.set('authenticated');

    return context;
  }

  /** Confirmed no session: drop every trace of the previous one. */
  private becomeGuest(): void {
    this.clearContext();
    this.restoreErrorSignal.set(null);
    this.statusSignal.set('guest');
  }

  private clearContext(): void {
    this.csrf.clear();
    this.contextSignal.set(null);
  }
}
