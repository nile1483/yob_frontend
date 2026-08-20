import type { HttpRequest } from '@angular/common/http';

/**
 * What the browser really sent, recorded at the mock's server boundary.
 *
 * ## Why this exists
 *
 * In mock mode the interceptor answers inside `HttpClient`, so **no network request is
 * ever made** and a browser test cannot observe one. That is normally a feature - the
 * suite is deterministic and needs no backend - but it leaves one thing unprovable in a
 * real browser: the exact shape of the request Angular composes. For a wire-contract
 * sign-off (Phase 24D-2) that is the very thing under test.
 *
 * So the mock records each RPC it serves, after the request has travelled through
 * `YobApiClient`, the CSRF interceptor and `HttpClient` - the same journey it would make
 * to a real server, one step before the socket.
 *
 * ## Why it is safe
 *
 * This file lives under `src/mock-api/`, which the production environment never imports;
 * `fileReplacements` keeps the whole folder out of production builds, and a purity scan
 * asserts it. The log is capped, held in memory only, and cleared on reload.
 */
export interface MockRequestRecord {
  readonly method: string;
  readonly rpcMethod: string;
  /** The full URL including the serialised query string, exactly as HttpClient built it. */
  readonly urlWithParams: string;
  readonly params: Readonly<Record<string, string>>;
  readonly body: unknown;
}

/** Bounded, so a long session cannot grow it without limit. */
const LIMIT = 200;

const records: MockRequestRecord[] = [];

/** Where a browser test reads the log from. Mock builds only. */
export const MOCK_REQUEST_LOG_KEY = '__yobMockRequests';

export function recordMockRequest(rpcMethod: string, req: HttpRequest<unknown>): void {
  const params: Record<string, string> = {};
  for (const key of req.params.keys()) {
    const value = req.params.get(key);
    if (value !== null) {
      params[key] = value;
    }
  }

  records.push({
    method: req.method,
    rpcMethod,
    urlWithParams: req.urlWithParams,
    params,
    body: req.body,
  });

  if (records.length > LIMIT) {
    records.shift();
  }

  // Exposed for browser tests only. Reading it from application code would be reaching
  // into the mock, which no page is allowed to know exists.
  (globalThis as Record<string, unknown>)[MOCK_REQUEST_LOG_KEY] = records;
}

/** Every RPC served so far, oldest first. */
export function mockRequestLog(): readonly MockRequestRecord[] {
  return records;
}

export function clearMockRequestLog(): void {
  records.length = 0;
}
