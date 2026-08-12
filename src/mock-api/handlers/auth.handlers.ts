import { isRecord } from '../../app/foundation/network/yob-api.types';
import {
  type MockReply,
  mockCsrfError,
  mockPermissionError,
  mockSuccess,
  mockYobError,
} from '../core/mock-reply';
import type { MockContext, MockHandler } from '../core/mock-handler';
import { MOCK_CREDENTIALS } from '../fixtures/session.fixture';

const CSRF_HEADER = 'X-Frappe-CSRF-Token';

/**
 * `get_session_context` - the call `SessionStore.restore()` makes on boot.
 *
 * Not guest-allowed, so with no session it must answer the raw Frappe 403, which the
 * network layer normalises to `client_permission_denied` and the session store reads as
 * guest. Returning a tidy YOB error here would quietly break that path.
 */
const getSessionContext: MockHandler = (ctx) => {
  const missing = requireField(ctx, 'application', readParam(ctx, 'application'));
  if (missing) {
    return missing;
  }

  const context = ctx.session.currentContext('session');
  if (context === null) {
    return mockPermissionError(ctx.rpcMethod);
  }

  // No notice on this endpoint, matching the verified response.
  return mockSuccess(context);
};

/**
 * `login_with_password` - public, so no CSRF token is required or expected.
 *
 * Failure codes and statuses mirror the backend: `validation_failed` (422) for a blank
 * field, `invalid_credentials` (401) for a bad password.
 */
const loginWithPassword: MockHandler = (ctx) => {
  const application = readBody(ctx, 'application');
  const username = readBody(ctx, 'username');
  const password = readBody(ctx, 'password');

  const missing =
    requireField(ctx, 'application', application) ??
    requireField(ctx, 'username', username) ??
    requireField(ctx, 'password', password);
  if (missing) {
    return missing;
  }

  if (username !== MOCK_CREDENTIALS.username || password !== MOCK_CREDENTIALS.password) {
    return mockYobError('invalid_credentials', 'Invalid login credentials.', { status: 401 });
  }

  const context = ctx.session.signIn(ctx.application, 'password');
  return mockSuccess(context, { notice: 'Login successful.' });
};

/**
 * `logout` - secure and CSRF-protected.
 *
 * The token check is real: the value must match what the mock server issued at login,
 * which is only true if `CsrfTokenStore` captured it and `yobCsrfInterceptor` attached
 * it. Skipping the check "because it is only a mock" would leave that whole path
 * untested until the first run against Frappe.
 */
const logout: MockHandler = (ctx) => {
  if (!ctx.session.isAuthenticated()) {
    return mockPermissionError(ctx.rpcMethod);
  }

  const presented = ctx.request.headers.get(CSRF_HEADER);
  if (presented === null || presented !== ctx.session.expectedCsrfToken()) {
    return mockCsrfError();
  }

  ctx.session.signOut();
  // The cart belongs to the session on the real backend, so it goes with it - and so
  // does the address book, which is read per customer. Without this, a contact created
  // in one session would still be listed after signing in as someone else.
  ctx.cart.reset();
  ctx.addressBook.reset();
  return mockSuccess({ authenticated: false }, { notice: 'Logout successful.' });
};

export const AUTH_HANDLERS: Readonly<Record<string, MockHandler>> = {
  'yob_auth.api.auth.get_session_context': getSessionContext,
  'yob_auth.api.auth.login_with_password': loginWithPassword,
  'yob_auth.api.auth.logout': logout,
};

function readParam(ctx: MockContext, name: string): string | null {
  return ctx.params.get(name);
}

function readBody(ctx: MockContext, name: string): string | null {
  const body: unknown = ctx.request.body;
  if (!isRecord(body)) {
    return null;
  }
  const value = body[name];
  return typeof value === 'string' ? value : null;
}

/** Reproduces the backend's blank-field check, including its wording and field name. */
function requireField(_ctx: MockContext, name: string, value: string | null): MockReply | null {
  if (value !== null && value !== '') {
    return null;
  }
  const label = name.replace(/_/g, ' ');
  return mockYobError(
    'validation_failed',
    `${label.charAt(0).toUpperCase()}${label.slice(1)} is required.`,
    { field: name, status: 422 },
  );
}
