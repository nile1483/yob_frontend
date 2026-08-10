import { Service, computed, signal } from '@angular/core';

import type { SessionContextDto } from '../../app/foundation/auth/auth.types';
import { MOCK_CSRF_TOKEN, mockSessionContext } from '../fixtures/session.fixture';

/**
 * The mock API's server-side session.
 *
 * This is deliberately modelled as *server* state, not client state: it lives behind
 * the interceptor, and the application reaches it only by making HTTP calls. That
 * keeps the frontend behaving exactly as it does against Frappe - it asks who it is
 * and believes the answer.
 *
 * There is no `sid` cookie. A real Frappe issues one so it can recognise a browser
 * across requests; a mock serving exactly one browser has nothing to recognise. The
 * absence changes nothing for the frontend, which never reads that cookie either way -
 * it is HttpOnly. Nothing is written to localStorage or sessionStorage.
 */
@Service()
export class MockServerSession {
  private readonly context = signal<SessionContextDto | null>(null);

  /** Whether the mock server currently holds a session. */
  readonly isAuthenticated = computed(() => this.context() !== null);

  /** Establish a session, as a successful login would. */
  signIn(application: string, authenticationMethod: 'password' | 'session' | string): SessionContextDto {
    const context = mockSessionContext(application, authenticationMethod);
    this.context.set(context);
    return context;
  }

  /** Drop the session, as logout would. */
  signOut(): void {
    this.context.set(null);
  }

  /**
   * The current session payload, re-stamped with the requested authentication method.
   *
   * `get_session_context` reports `session` where the original login reported
   * `password`, and the mock reproduces that rather than echoing a stale value.
   */
  currentContext(authenticationMethod: 'session' | string): SessionContextDto | null {
    const context = this.context();
    if (context === null) {
      return null;
    }
    return { ...context, authentication_method: authenticationMethod };
  }

  /**
   * The CSRF token the mock expects on mutating calls, or `null` when signed out.
   *
   * Mirrors Frappe: the token is tied to the session, so it is worthless once the
   * session ends.
   */
  expectedCsrfToken(): string | null {
    return this.context() === null ? null : MOCK_CSRF_TOKEN;
  }

  /** Test/dev helper: forget everything. */
  reset(): void {
    this.context.set(null);
  }
}
