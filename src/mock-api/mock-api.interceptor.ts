import {
  HttpErrorResponse,
  type HttpEvent,
  type HttpInterceptorFn,
  HttpParams,
  type HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { type Observable, of, switchMap, throwError, timer } from 'rxjs';

import { YOB_API_CONFIG } from '../app/foundation/network/yob-api.config';
import type { MockContext } from './core/mock-handler';
import { type MockReply, mockYobError } from './core/mock-reply';
import { MockServerCart } from './core/mock-server-cart';
import { MockServerSession } from './core/mock-server-session';
import { MOCK_HANDLERS } from './handlers/mock-handlers';
import { MockApiScenario } from './scenarios/mock-scenario';

/**
 * Serves Frappe RPC calls from in-memory handlers instead of the network.
 *
 * It intercepts at the **server boundary**: the request has already travelled through
 * `YobApiClient`, `yobCsrfInterceptor` and `HttpClient` exactly as it would in
 * production, and the reply goes back up through the same unwrapping and error
 * normalisation. Nothing above this line knows the difference, which is the whole
 * point - there are no mock domain services and no mock-aware pages.
 *
 * Registered only when the development environment asks for it. The production
 * environment file does not import this module at all, so mock code cannot reach a
 * production bundle even by accident.
 *
 * Ordering matters: this must sit AFTER `yobCsrfInterceptor` in the interceptor list
 * so that handlers see the CSRF header a real backend would have received.
 */
export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  const { methodBasePath, application } = inject(YOB_API_CONFIG);

  // Split the query string off first: a URL carrying an inline `?application=...`
  // would otherwise become part of the method name and match no handler.
  const queryIndex = req.url.indexOf('?');
  const path = queryIndex === -1 ? req.url : req.url.slice(0, queryIndex);

  // Anything that is not a Frappe RPC call - assets, uploads, third parties - is left
  // completely alone.
  if (!path.startsWith(methodBasePath)) {
    return next(req);
  }

  const rpcMethod = path.slice(methodBasePath.length);
  const session = inject(MockServerSession);
  const cart = inject(MockServerCart);
  const scenario = inject(MockApiScenario);

  // A URL-set scenario spares the auth endpoints, so a browser test can still sign in
  // before reaching the feature whose failure it is testing. See MockApiScenario.
  const sparesAuth = scenario.sparesAuth() && rpcMethod.startsWith('yob_auth.');
  const active = sparesAuth ? 'normal' : scenario.scenario();

  const reply = resolve(
    {
      rpcMethod,
      request: req,
      params: mergedParams(req, queryIndex),
      session,
      cart,
      application,
      scenario: active,
    },
    active,
  );
  const latencyMs = scenario.latencyMs();

  // `delay` would let an error through immediately, so a slow failure would arrive
  // instantly. Deferring the whole reply behind a timer delays both alike.
  return latencyMs > 0
    ? timer(latencyMs).pipe(switchMap(() => emit(reply, req)))
    : emit(reply, req);
};

/** Query parameters from `HttpParams` and from an inline query string alike. */
function mergedParams(req: HttpRequest<unknown>, queryIndex: number): HttpParams {
  let params =
    queryIndex === -1
      ? new HttpParams()
      : new HttpParams({ fromString: req.url.slice(queryIndex + 1) });

  for (const key of req.params.keys()) {
    for (const value of req.params.getAll(key) ?? []) {
      params = params.append(key, value);
    }
  }

  return params;
}

function resolve(context: MockContext, scenario: string): MockReply {
  if (scenario === 'server-error') {
    return mockYobError('internal_server_error', 'Something went wrong. Please try again.', {
      details: { correlation_id: 'mock000000000000' },
      status: 500,
    });
  }

  const handler = MOCK_HANDLERS[context.rpcMethod];
  if (handler === undefined) {
    // Loud on purpose. Falling through to the real backend would produce a session
    // that is half mock and half live, which is far harder to debug than a clear stop.
    return mockYobError(
      'mock_handler_not_implemented',
      `No mock handler is registered for "${context.rpcMethod}". Add one under src/mock-api/handlers/.`,
      { status: 501 },
    );
  }

  return handler(context);
}

/** Turn a reply into the same events `HttpClient` would produce for a real response. */
function emit(reply: MockReply, req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
  const url = req.urlWithParams;

  if (reply.status >= 400) {
    return throwError(
      () =>
        new HttpErrorResponse({
          error: reply.body,
          status: reply.status,
          statusText: statusTextFor(reply.status),
          url,
        }),
    );
  }

  return of(
    new HttpResponse({
      body: reply.body,
      status: reply.status,
      statusText: statusTextFor(reply.status),
      url,
    }),
  );
}

function statusTextFor(status: number): string {
  switch (status) {
    case 200:
      return 'OK';
    case 201:
      return 'Created';
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    case 422:
      return 'Unprocessable Entity';
    case 429:
      return 'Too Many Requests';
    case 500:
      return 'Internal Server Error';
    case 501:
      return 'Not Implemented';
    default:
      return 'Unknown';
  }
}
