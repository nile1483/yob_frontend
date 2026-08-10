import { Service, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { YobApiClient } from '../network/yob-api-client';
import { YOB_API_CONFIG } from '../network/yob-api.config';
import type { YobResponse } from '../network/yob-api.types';
import type {
  LogoutResultDto,
  OtpChallengeCredentials,
  OtpRequest,
  PasswordCredentials,
  SessionContextDto,
} from './auth.types';

const GET_SESSION_CONTEXT = 'yob_auth.api.auth.get_session_context';
const LOGIN_WITH_PASSWORD = 'yob_auth.api.auth.login_with_password';
const LOGIN_WITH_OTP = 'yob_auth.api.auth.login_with_otp';
const REQUEST_OTP = 'yob_auth.api.auth.request_otp';
const LOGOUT = 'yob_auth.api.auth.logout';

/**
 * Typed access to the `yob_auth` RPC endpoints. Transport only - no state.
 *
 * `SessionStore` owns what happens to the results. Keeping the two apart means the
 * session lifecycle can be tested without HTTP, and these calls can be reused by a
 * future OTP flow without dragging session state along.
 *
 * The `application` code is read from `YOB_API_CONFIG` rather than passed in by
 * callers, so no service or page ever names a specific application.
 *
 * Nothing here touches cookies or the CSRF header. The browser owns `sid`, and
 * `yobCsrfInterceptor` adds `X-Frappe-CSRF-Token` to the mutating calls.
 */
@Service()
export class AuthApi {
  private readonly api = inject(YobApiClient);
  private readonly application = inject(YOB_API_CONFIG).application;

  /**
   * Read the current session.
   *
   * Not guest-allowed: without a session Frappe answers a raw 403 `PermissionError`,
   * which the network layer normalises to `client_session_required`. That is the
   * signal for "guest", and it is `SessionStore.restore()` that interprets it -
   * deliberately not the network layer, which must keep treating 403 as a failure.
   */
  getSessionContext(): Observable<YobResponse<SessionContextDto>> {
    return this.api.get<SessionContextDto>(GET_SESSION_CONTEXT, {
      application: this.application,
    });
  }

  /**
   * Password sign-in.
   *
   * Frappe sets the HttpOnly `sid` cookie on the response; nothing in this codebase
   * reads or stores it. The returned payload already carries the full session
   * context, so no follow-up `get_session_context` call is required.
   *
   * Rate limited to 10 attempts per 300 s keyed on the username, counted before
   * authentication - a `rate_limit_exceeded` at HTTP 429 reaches the caller
   * unchanged, distinct from `invalid_credentials` at 401.
   */
  loginWithPassword(credentials: PasswordCredentials): Observable<YobResponse<SessionContextDto>> {
    return this.api.post<SessionContextDto>(LOGIN_WITH_PASSWORD, {
      application: this.application,
      username: credentials.username,
      password: credentials.password,
    });
  }

  /**
   * Exchange an OTP challenge for a session.
   *
   * Takes no `application` - the backend recovers it from the challenge. Returns the
   * same payload as password login.
   *
   * Provided at API level only; OTP state and workflow belong to the authentication
   * UI phase.
   */
  loginWithOtp(credentials: OtpChallengeCredentials): Observable<YobResponse<SessionContextDto>> {
    return this.api.post<SessionContextDto>(LOGIN_WITH_OTP, {
      challenge_id: credentials.challenge_id,
      otp: credentials.otp,
    });
  }

  /**
   * Start an OTP challenge.
   *
   * The request contract is verified; the success `data` keys are NOT - OTP is not
   * exercisable on the current bench. `unknown` is deliberate: capture a real
   * response and type it before building anything on top of this.
   *
   * The envelope `notice` is intentionally non-committal so a client cannot infer
   * whether an account exists. Never branch on it.
   */
  requestOtp(request: OtpRequest): Observable<YobResponse<unknown>> {
    return this.api.post<unknown>(REQUEST_OTP, {
      application: this.application,
      identifier: request.identifier,
      method: request.method,
    });
  }

  /** End the session server-side. Requires the CSRF header, added by the interceptor. */
  logout(): Observable<YobResponse<LogoutResultDto>> {
    return this.api.post<LogoutResultDto>(LOGOUT);
  }
}
