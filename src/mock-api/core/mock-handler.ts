import type { HttpParams, HttpRequest } from '@angular/common/http';

import type { MockScenario } from '../scenarios/mock-scenario';
import type { MockReply } from './mock-reply';
import type { MockServerCart } from './mock-server-cart';
import type { MockServerSession } from './mock-server-session';

/**
 * Everything a handler is allowed to see.
 *
 * Handlers are plain functions rather than services: the interceptor does the
 * injecting and passes what is needed, so a handler can be called directly in a test
 * with no DI, and cannot quietly reach for application state it has no business
 * knowing about.
 */
export interface MockContext {
  /** The Frappe RPC method name, with `/api/method/` already stripped. */
  readonly rpcMethod: string;
  /** The outgoing request, including headers the real interceptors have added. */
  readonly request: HttpRequest<unknown>;
  /**
   * Query parameters, however they were supplied.
   *
   * `YobApiClient` uses `HttpParams`, but a caller may put the query string inline in
   * the URL. Handlers must not care which, so the interceptor merges both.
   */
  readonly params: HttpParams;
  /** The mock server's session state. */
  readonly session: MockServerSession;
  /** The mock server's cart. Owned by the session - logout empties it. */
  readonly cart: MockServerCart;
  /** The configured application code, so handlers never name one themselves. */
  readonly application: string;
  /**
   * The active scenario.
   *
   * `server-error` is handled centrally before dispatch; handlers only see the rest.
   * A handler that has no empty variant can simply ignore it.
   */
  readonly scenario: MockScenario;
}

export type MockHandler = (context: MockContext) => MockReply;

/** Registry of RPC method name to handler. */
export type MockHandlerRegistry = Readonly<Record<string, MockHandler>>;
