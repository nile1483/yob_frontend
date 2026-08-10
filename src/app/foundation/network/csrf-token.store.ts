import { Service, computed, signal } from '@angular/core';

/**
 * In-memory holder for the Frappe CSRF token.
 *
 * The token arrives at `message.data.csrf_token` from `login_with_password`,
 * `login_with_otp` and `get_session_context`. This class only holds it so the CSRF
 * interceptor has something to read; the session domain (Phase 3) owns its
 * lifecycle - setting it on login and session restore, clearing it on logout.
 *
 * Deliberately NOT persisted. It lives for the lifetime of the page and is
 * re-established by `get_session_context` on reload, which is also the documented
 * recovery from a `CSRFTokenError`.
 *
 * Never log the token.
 */
@Service()
export class CsrfTokenStore {
  private readonly token = signal<string | null>(null);

  /** Whether a token has been established. Never exposes the value itself. */
  readonly hasToken = computed(() => this.token() !== null);

  set(token: string): void {
    this.token.set(token);
  }

  clear(): void {
    this.token.set(null);
  }

  /**
   * Read the raw token. Intended for the CSRF interceptor; prefer `hasToken` when
   * you only need to know whether a session has been established.
   */
  current(): string | null {
    return this.token();
  }
}
