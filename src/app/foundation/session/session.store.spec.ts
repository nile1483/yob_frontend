import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import type { SessionContextDto } from '../auth/auth.types';
import { CsrfTokenStore } from '../network/csrf-token.store';
import { yobCsrfInterceptor } from '../network/csrf.interceptor';
import { YOB_CLIENT_ERROR_CODES, YobApiError } from '../network/yob-api-error';
import { YOB_API_CONFIG, type YobApiConfig } from '../network/yob-api.config';
import { SESSION_RESTORE_TIMEOUT_MS, SessionStore } from './session.store';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

const SESSION_CONTEXT = '/api/method/yob_auth.api.auth.get_session_context';
const LOGIN = '/api/method/yob_auth.api.auth.login_with_password';
const LOGOUT = '/api/method/yob_auth.api.auth.logout';

/** Exactly the payload captured in reference/api/live/verified-responses.json. */
function authenticatedPayload(overrides: Partial<SessionContextDto> = {}): SessionContextDto {
  return {
    authenticated: true,
    authentication_method: 'session',
    user: {
      name: 'storefront@yob.test',
      full_name: 'Storefront',
      user_image: null,
      email: 'storefront@yob.test',
      mobile_no: null,
    },
    context: {
      application: 'TEST_APP',
      profile_doctype: 'Customer',
      profile_name: 'Shayona Test Buyer',
    },
    csrf_token: 'csrf-from-backend',
    ...overrides,
  };
}

/** The raw Frappe 403 body a guest gets from a secure endpoint. */
const RAW_FRAPPE_403 = {
  exception:
    'frappe.exceptions.PermissionError: <details><summary>You are not permitted to access this resource. Login to access</summary></details>',
  exc_type: 'PermissionError',
  exc: '["Traceback (most recent call last): ..."]',
};

describe('SessionStore', () => {
  let session: SessionStore;
  let csrf: CsrfTokenStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([yobCsrfInterceptor])),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    session = TestBed.inject(SessionStore);
    csrf = TestBed.inject(CsrfTokenStore);
    http = TestBed.inject(HttpTestingController);

    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => http.verify());

  /** Drive a restore to completion and hand back the resolved status. */
  function restoreWith(respond: (req: ReturnType<HttpTestingController['expectOne']>) => void) {
    let resolved: string | undefined;
    session.restore().subscribe((status) => (resolved = status));
    respond(http.expectOne((r) => r.url === SESSION_CONTEXT));
    return () => resolved;
  }

  describe('initial state', () => {
    it('starts as unknown, not guest and not authenticated', () => {
      expect(session.status()).toBe('unknown');
      expect(session.isAuthenticated()).toBe(false);
      expect(session.isGuest()).toBe(false);
      expect(session.isResolved()).toBe(false);
      expect(session.context()).toBeNull();
      expect(session.user()).toBeNull();
      expect(session.restoreError()).toBeNull();
    });
  });

  describe('restore', () => {
    it('becomes authenticated on a successful context read', () => {
      const resolved = restoreWith((req) =>
        req.flush({ message: { data: authenticatedPayload() } }),
      );

      expect(resolved()).toBe('authenticated');
      expect(session.status()).toBe('authenticated');
      expect(session.isAuthenticated()).toBe(true);
      expect(session.isResolved()).toBe(true);
      expect(session.user()?.name).toBe('storefront@yob.test');
      expect(session.profileName()).toBe('Shayona Test Buyer');
      expect(session.restoreError()).toBeNull();
    });

    it('stores the CSRF token so mutating calls can be signed', () => {
      restoreWith((req) => req.flush({ message: { data: authenticatedPayload() } }));

      expect(csrf.hasToken()).toBe(true);
      expect(csrf.current()).toBe('csrf-from-backend');
    });

    it('keeps the CSRF token out of the session context entirely', () => {
      restoreWith((req) => req.flush({ message: { data: authenticatedPayload() } }));

      expect(JSON.stringify(session.context())).not.toContain('csrf-from-backend');
      expect(Object.keys(session.context() ?? {})).not.toContain('csrf_token');
    });

    it('reads a permission denial on this call as a confirmed guest', () => {
      const resolved = restoreWith((req) =>
        req.flush(RAW_FRAPPE_403, { status: 403, statusText: 'Forbidden' }),
      );

      expect(resolved()).toBe('guest');
      expect(session.status()).toBe('guest');
      expect(session.isGuest()).toBe(true);
      expect(session.isResolved()).toBe(true);
      // A confirmed guest is an answer, not a failure.
      expect(session.restoreError()).toBeNull();
    });

    it('derives guest from the operation, not from the error code alone', () => {
      // The network layer reports the neutral `client_permission_denied`, which on a
      // business endpoint means "authenticated but not allowed". It means guest only
      // because the call was `get_session_context`, which is not guest-allowed - the
      // interpretation lives here, not in the transport layer.
      const resolved = restoreWith((req) =>
        req.flush(RAW_FRAPPE_403, { status: 403, statusText: 'Forbidden' }),
      );

      expect(resolved()).toBe('guest');
      // And the transport layer never claimed to know: it said permission denied.
      expect(RAW_FRAPPE_403.exc_type).toBe('PermissionError');
    });

    it('clears stale context and CSRF when a previous session turns out to be gone', () => {
      restoreWith((req) => req.flush({ message: { data: authenticatedPayload() } }));
      expect(session.isAuthenticated()).toBe(true);
      expect(csrf.hasToken()).toBe(true);

      restoreWith((req) => req.flush(RAW_FRAPPE_403, { status: 403, statusText: 'Forbidden' }));

      expect(session.status()).toBe('guest');
      expect(session.context()).toBeNull();
      expect(session.user()).toBeNull();
      expect(csrf.hasToken()).toBe(false);
      expect(csrf.current()).toBeNull();
    });

    it('does not mistake a server error for a guest session', () => {
      const resolved = restoreWith((req) =>
        req.flush(
          {
            message: {
              errors: [
                {
                  code: 'internal_server_error',
                  detail: 'Something went wrong. Please try again.',
                  details: { correlation_id: 'abc123' },
                },
              ],
            },
          },
          { status: 500, statusText: 'Internal Server Error' },
        ),
      );

      expect(resolved()).toBe('unknown');
      expect(session.status()).toBe('unknown');
      expect(session.isGuest()).toBe(false);
      expect(session.isAuthenticated()).toBe(false);
      expect(session.isResolved()).toBe(false);
      expect(session.restoreError()?.code).toBe('internal_server_error');
      expect(session.restoreError()?.httpStatus).toBe(500);
    });

    it('does not mistake an offline backend for a guest session', () => {
      const resolved = restoreWith((req) => req.error(new ProgressEvent('error')));

      expect(resolved()).toBe('unknown');
      expect(session.isGuest()).toBe(false);
      expect(session.restoreError()?.code).toBe(YOB_CLIENT_ERROR_CODES.networkUnavailable);
    });

    it('does not mistake application_access_denied for a guest session', () => {
      // A valid session arriving through the wrong domain. Signing the user out here
      // would hide a proxy misconfiguration behind a login screen.
      const resolved = restoreWith((req) =>
        req.flush(
          {
            message: {
              errors: [
                {
                  code: 'application_access_denied',
                  detail: 'This application is not allowed from the current domain',
                },
              ],
            },
          },
          { status: 403, statusText: 'Forbidden' },
        ),
      );

      expect(resolved()).toBe('unknown');
      expect(session.isGuest()).toBe(false);
      expect(session.restoreError()?.code).toBe('application_access_denied');
    });

    it('reports restoring while the call is in flight', () => {
      session.restore().subscribe();

      expect(session.status()).toBe('restoring');
      expect(session.isResolved()).toBe(false);

      http
        .expectOne((r) => r.url === SESSION_CONTEXT)
        .flush({ message: { data: authenticatedPayload() } });
    });

    it('clears a previous restore error when a later restore succeeds', () => {
      restoreWith((req) => req.error(new ProgressEvent('error')));
      expect(session.restoreError()).not.toBeNull();

      restoreWith((req) => req.flush({ message: { data: authenticatedPayload() } }));
      expect(session.restoreError()).toBeNull();
    });
  });

  describe('restore timeout', () => {
    // `provideAppInitializer` waits for restore() to COMPLETE. These tests therefore
    // assert completion, not just emission: a stream that emits but never completes
    // would still leave the application blank.
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    /** Start a restore, confirm the request went out, then never answer it. */
    function hangingRestore() {
      let resolved: string | undefined;
      let completed = false;
      session.restore().subscribe({
        next: (status) => (resolved = status),
        complete: () => (completed = true),
      });

      // Asserting the request exists also removes it from the controller's open list,
      // so an abandoned request cannot mask a later expectation.
      http.expectOne((r) => r.url === SESSION_CONTEXT);

      expect(session.status()).toBe('restoring');
      expect(completed).toBe(false);

      return { resolved: () => resolved, completed: () => completed };
    }

    it('completes bootstrap instead of hanging forever when the backend never answers', () => {
      const restore = hangingRestore();

      vi.advanceTimersByTime(SESSION_RESTORE_TIMEOUT_MS);

      expect(restore.completed()).toBe(true);
      expect(restore.resolved()).toBe('unknown');
    });

    it('does not treat a timeout as a guest session', () => {
      const restore = hangingRestore();

      vi.advanceTimersByTime(SESSION_RESTORE_TIMEOUT_MS);

      expect(restore.resolved()).toBe('unknown');
      expect(session.status()).toBe('unknown');
      expect(session.isGuest()).toBe(false);
      expect(session.isAuthenticated()).toBe(false);
      expect(session.isResolved()).toBe(false);
      expect(session.restoreError()?.code).toBe(YOB_CLIENT_ERROR_CODES.requestTimeout);
      expect(session.restoreError()?.kind).toBe('transport');
    });

    it('stays pending right up to the bound, so a slow-but-working backend still wins', () => {
      const restore = hangingRestore();

      vi.advanceTimersByTime(SESSION_RESTORE_TIMEOUT_MS - 1);
      expect(restore.completed()).toBe(false);
      expect(session.status()).toBe('restoring');

      vi.advanceTimersByTime(1);
      expect(restore.completed()).toBe(true);
    });

    it('can retry after a timeout and establish an authenticated session', () => {
      const first = hangingRestore();
      vi.advanceTimersByTime(SESSION_RESTORE_TIMEOUT_MS);
      expect(first.resolved()).toBe('unknown');
      expect(session.restoreError()).not.toBeNull();

      let retried: string | undefined;
      session.restore().subscribe((status) => (retried = status));
      http
        .expectOne((r) => r.url === SESSION_CONTEXT)
        .flush({ message: { data: authenticatedPayload() } });

      expect(retried).toBe('authenticated');
      expect(session.status()).toBe('authenticated');
      expect(session.user()?.name).toBe('storefront@yob.test');
      expect(csrf.current()).toBe('csrf-from-backend');
      // The stale timeout error must not linger once the question is answered.
      expect(session.restoreError()).toBeNull();
    });

    it('leaves a normal restore that answers in time completely unaffected', () => {
      let resolved: string | undefined;
      session.restore().subscribe((status) => (resolved = status));

      http
        .expectOne((r) => r.url === SESSION_CONTEXT)
        .flush({ message: { data: authenticatedPayload() } });

      // No timer ever fires; advancing past the bound must change nothing.
      vi.advanceTimersByTime(SESSION_RESTORE_TIMEOUT_MS * 2);

      expect(resolved).toBe('authenticated');
      expect(session.status()).toBe('authenticated');
      expect(session.restoreError()).toBeNull();
    });

    it('leaves a guest restore that answers in time completely unaffected', () => {
      let resolved: string | undefined;
      session.restore().subscribe((status) => (resolved = status));

      http
        .expectOne((r) => r.url === SESSION_CONTEXT)
        .flush(RAW_FRAPPE_403, { status: 403, statusText: 'Forbidden' });

      vi.advanceTimersByTime(SESSION_RESTORE_TIMEOUT_MS * 2);

      expect(resolved).toBe('guest');
      expect(session.status()).toBe('guest');
      expect(session.restoreError()).toBeNull();
    });
  });

  describe('password sign-in', () => {
    it('establishes an authenticated session from the login payload alone', () => {
      let established = false;
      session
        .signInWithPassword({ username: 'storefront@yob.test', password: 'secret' })
        .subscribe(() => (established = true));

      http.expectOne(LOGIN).flush({
        message: {
          data: authenticatedPayload({ authentication_method: 'password' }),
          notice: 'Login successful.',
        },
        // Frappe's own sibling keys. Nothing may depend on them.
        home_page: '/desk',
        full_name: 'Storefront',
      });

      expect(established).toBe(true);
      expect(session.status()).toBe('authenticated');
      expect(session.user()?.email).toBe('storefront@yob.test');
      expect(csrf.current()).toBe('csrf-from-backend');
      // No second round trip: the login payload is already the session context.
      http.expectNone(SESSION_CONTEXT);
    });

    it('sends the application from environment configuration, never a literal', () => {
      session.signInWithPassword({ username: 'a@b.test', password: 'x' }).subscribe();

      const req = http.expectOne(LOGIN);
      expect(req.request.body).toEqual({
        application: 'TEST_APP',
        username: 'a@b.test',
        password: 'x',
      });
      req.flush({ message: { data: authenticatedPayload() } });
    });

    it('never reads or writes sid, and leaves the cookie to the browser', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');

      session.signInWithPassword({ username: 'a@b.test', password: 'x' }).subscribe();

      const req = http.expectOne(LOGIN);
      expect(req.request.headers.has('Cookie')).toBe(false);
      req.flush({ message: { data: authenticatedPayload() } });

      expect(setItem).not.toHaveBeenCalled();
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
      expect(JSON.stringify(session.context())).not.toContain('sid');
      setItem.mockRestore();
    });

    it('does not mark the session authenticated when credentials are rejected', () => {
      let error: YobApiError | undefined;
      session
        .signInWithPassword({ username: 'a@b.test', password: 'wrong' })
        .subscribe({ error: (e: YobApiError) => (error = e) });

      http.expectOne(LOGIN).flush(
        {
          message: {
            errors: [{ code: 'invalid_credentials', detail: 'Invalid login credentials.' }],
          },
        },
        { status: 401, statusText: 'Unauthorized' },
      );

      expect(error?.code).toBe('invalid_credentials');
      expect(session.status()).toBe('unknown');
      expect(session.isAuthenticated()).toBe(false);
      expect(session.context()).toBeNull();
      expect(csrf.hasToken()).toBe(false);
    });

    it('passes a 429 rate limit through as the normalized API error', () => {
      let error: YobApiError | undefined;
      session
        .signInWithPassword({ username: 'a@b.test', password: 'x' })
        .subscribe({ error: (e: YobApiError) => (error = e) });

      http.expectOne(LOGIN).flush(
        {
          message: {
            errors: [
              { code: 'rate_limit_exceeded', detail: 'Too many attempts. Try again later.' },
            ],
          },
        },
        { status: 429, statusText: 'Too Many Requests' },
      );

      expect(error).toBeInstanceOf(YobApiError);
      expect(error?.code).toBe('rate_limit_exceeded');
      expect(error?.httpStatus).toBe(429);
      // Distinguishable from a wrong password, so the UI can say something useful.
      expect(error?.code).not.toBe('invalid_credentials');
      expect(session.isAuthenticated()).toBe(false);
    });
  });

  describe('sign-out', () => {
    beforeEach(() => {
      restoreWith((req) => req.flush({ message: { data: authenticatedPayload() } }));
      expect(session.isAuthenticated()).toBe(true);
    });

    it('becomes guest and sends the CSRF header the interceptor added', () => {
      let completed = false;
      session.signOut().subscribe(() => (completed = true));

      const req = http.expectOne(LOGOUT);
      expect(req.request.headers.get('X-Frappe-CSRF-Token')).toBe('csrf-from-backend');
      req.flush({ message: { data: { authenticated: false }, notice: 'Logout successful.' } });

      expect(completed).toBe(true);
      expect(session.status()).toBe('guest');
      expect(session.context()).toBeNull();
      expect(session.user()).toBeNull();
    });

    it('clears the CSRF token', () => {
      session.signOut().subscribe();
      http
        .expectOne(LOGOUT)
        .flush({ message: { data: { authenticated: false }, notice: 'Logout successful.' } });

      expect(csrf.hasToken()).toBe(false);
      expect(csrf.current()).toBeNull();
    });

    it('still clears local state when logout is refused, meaning the session is gone', () => {
      let completed = false;
      let error: unknown;
      session.signOut().subscribe({ next: () => (completed = true), error: (e) => (error = e) });

      http.expectOne(LOGOUT).flush(RAW_FRAPPE_403, { status: 403, statusText: 'Forbidden' });

      // The session is provably gone: honour the intent rather than trapping the user.
      expect(error).toBeUndefined();
      expect(completed).toBe(true);
      expect(session.status()).toBe('guest');
      expect(session.context()).toBeNull();
      expect(csrf.hasToken()).toBe(false);
    });

    it('surfaces an unrelated failure and leaves the session intact', () => {
      let error: YobApiError | undefined;
      session.signOut().subscribe({ error: (e: YobApiError) => (error = e) });

      http.expectOne(LOGOUT).flush(
        {
          message: {
            errors: [{ code: 'internal_server_error', detail: 'Something went wrong.' }],
          },
        },
        { status: 500, statusText: 'Internal Server Error' },
      );

      // Claiming "signed out" while the server session lives is worse than an error
      // the user can retry.
      expect(error?.code).toBe('internal_server_error');
      expect(session.status()).toBe('authenticated');
      expect(csrf.hasToken()).toBe(true);
    });

    it('surfaces an offline failure and leaves the session intact', () => {
      let error: YobApiError | undefined;
      session.signOut().subscribe({ error: (e: YobApiError) => (error = e) });

      http.expectOne(LOGOUT).error(new ProgressEvent('error'));

      expect(error?.code).toBe(YOB_CLIENT_ERROR_CODES.networkUnavailable);
      expect(session.status()).toBe('authenticated');
    });
  });

  describe('page refresh', () => {
    it('rebuilds authenticated state from the backend alone, with no browser storage', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');

      // A fresh store is exactly what a reload produces: nothing remembered.
      const reloaded = TestBed.inject(SessionStore);
      expect(reloaded.status()).toBe('unknown');
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);

      reloaded.restore().subscribe();
      http
        .expectOne((r) => r.url === SESSION_CONTEXT)
        .flush({ message: { data: authenticatedPayload() } });

      expect(reloaded.status()).toBe('authenticated');
      expect(reloaded.user()?.name).toBe('storefront@yob.test');
      expect(csrf.current()).toBe('csrf-from-backend');

      // The whole state came from the response; nothing was persisted on the way.
      expect(setItem).not.toHaveBeenCalled();
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
      setItem.mockRestore();
    });
  });
});
