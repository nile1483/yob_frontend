/**
 * Transport DTOs for the `yob_auth` RPC endpoints.
 *
 * Field names match the backend exactly - snake_case included - because there is no
 * mismatch worth a mapping layer. Every field here was observed on the wire during
 * Phase 1; see `reference/api/live/verified-responses.json`.
 */

/** The user block of an authenticated payload. */
export interface SessionUserDto {
  /** Frappe user id, e.g. `storefront@yob.test`. */
  readonly name: string;
  readonly full_name: string | null;
  readonly user_image: string | null;
  readonly email: string | null;
  readonly mobile_no: string | null;
}

/**
 * Which application the session is authenticated against, and which business profile
 * it maps to.
 *
 * `roles` and `company` are deliberately withheld by the backend: authorization is
 * re-decided server-side on every request, so the client must never gate on them.
 */
export interface SessionApplicationContextDto {
  readonly application: string;
  readonly profile_doctype: string;
  readonly profile_name: string;
}

/**
 * The authenticated payload.
 *
 * `login_with_password`, `login_with_otp` and `get_session_context` all return this
 * same shape, differing only in `authentication_method` (`password`, the OTP method,
 * or `session`). That is why login needs no follow-up context call.
 */
export interface SessionContextDto {
  readonly authenticated: boolean;
  readonly authentication_method: string;
  readonly user: SessionUserDto;
  readonly context: SessionApplicationContextDto;
  /**
   * Frappe CSRF token. Belongs in `CsrfTokenStore`, never in persisted or logged
   * session state - `SessionContext` omits it for exactly that reason.
   */
  readonly csrf_token: string;
}

/** `logout` returns only the flipped flag. */
export interface LogoutResultDto {
  readonly authenticated: boolean;
}

export interface PasswordCredentials {
  readonly username: string;
  readonly password: string;
}

export interface OtpChallengeCredentials {
  /** Identifier returned by `request_otp`. */
  readonly challenge_id: string;
  readonly otp: string;
}

export interface OtpRequest {
  /** Email or mobile number, depending on `method`. */
  readonly identifier: string;
  /** Delivery method configured for the application. */
  readonly method: string;
}
