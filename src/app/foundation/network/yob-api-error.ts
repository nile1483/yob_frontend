import { HttpErrorResponse } from '@angular/common/http';

import { isRecord, type YobErrorItem } from './yob-api.types';

/**
 * Where a failure came from. Pages normally branch on `code`; `kind` exists so
 * infrastructure (retry, session recovery, logging) can tell a backend refusal from
 * a broken connection without string-matching codes.
 *
 * - `yob`        the backend returned its documented `{message:{errors:[...]}}` envelope
 * - `frappe`     Frappe rejected the request before the YOB envelope existed
 * - `transport`  the request never completed (offline, DNS, connection refused)
 * - `unexpected` a response arrived but did not match any known contract
 */
export type YobErrorKind = 'yob' | 'frappe' | 'transport' | 'unexpected';

/**
 * Codes synthesised by this client for failures the backend does not describe.
 *
 * The `client_` prefix is deliberate: it can never collide with the backend registry
 * in `reference/api/live/verified-responses.json`, so a reader always knows whether a
 * code came off the wire or was inferred here.
 */
export const YOB_CLIENT_ERROR_CODES = {
  /** The request never reached the server. */
  networkUnavailable: 'client_network_unavailable',
  /**
   * The server accepted the connection but did not answer within the caller's bound.
   *
   * Distinct from `networkUnavailable` on purpose: a hang usually means the edge or
   * backend is wedged, not that the client is offline.
   */
  requestTimeout: 'client_request_timeout',
  /** A response arrived but could not be understood (non-JSON, or a broken envelope). */
  unreadableResponse: 'client_unreadable_response',
  /** Frappe refused an unauthenticated call to a secure endpoint (403 PermissionError). */
  sessionRequired: 'client_session_required',
  /** Frappe rejected a mutation for a missing/stale CSRF token (400 CSRFTokenError). */
  csrfTokenInvalid: 'client_csrf_token_invalid',
  /** Anything else that does not fit a documented shape. */
  unexpectedFailure: 'client_unexpected_failure',
} as const;

export type YobClientErrorCode =
  (typeof YOB_CLIENT_ERROR_CODES)[keyof typeof YOB_CLIENT_ERROR_CODES];

const GENERIC_DETAIL = 'Something went wrong. Please try again.';

/**
 * One normalised failure shape for every way a YOB call can fail.
 *
 * SECURITY: raw Frappe failures carry a full server traceback in `exc` and
 * `_server_messages`. None of it is copied onto this object - not the traceback, not
 * the HTML-bearing `exception` string. That is a deliberate departure from the
 * `original?` field sketched in docs/API-CONTRACT.md section 7: keeping a reference to
 * the raw body makes it one careless `console.error(err)` away from leaking. The
 * intended debugging path is the server-side Error Log, which is what
 * `details.correlation_id` links to.
 */
export class YobApiError extends Error {
  readonly kind: YobErrorKind;
  /** HTTP status, or `0` when the request never completed. */
  readonly httpStatus: number;
  /** First error's code. Stable and safe to branch on. */
  readonly code: string;
  /** First error's human-readable text. Safe to display. */
  readonly detail: string;
  readonly field?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  /** Every error the backend returned; `errors` is always a list and may hold several. */
  readonly errors: readonly YobErrorItem[];
  /** Frappe's exception class name, when the failure came from Frappe itself. */
  readonly frappeExcType?: string;
  /** The RPC method that failed, for diagnostics. */
  readonly method?: string;

  constructor(init: {
    kind: YobErrorKind;
    httpStatus: number;
    errors: readonly YobErrorItem[];
    frappeExcType?: string;
    method?: string;
  }) {
    const first = init.errors[0];
    super(first?.detail ?? GENERIC_DETAIL);

    this.name = 'YobApiError';
    this.kind = init.kind;
    this.httpStatus = init.httpStatus;
    this.errors = init.errors;
    this.code = first?.code ?? YOB_CLIENT_ERROR_CODES.unexpectedFailure;
    this.detail = first?.detail ?? GENERIC_DETAIL;

    if (first?.field !== undefined) {
      this.field = first.field;
    }
    if (first?.details !== undefined) {
      this.details = first.details;
    }
    if (init.frappeExcType !== undefined) {
      this.frappeExcType = init.frappeExcType;
    }
    if (init.method !== undefined) {
      this.method = init.method;
    }
  }

  /** True when the caller should re-establish the session before retrying. */
  get isSessionFailure(): boolean {
    return this.code === YOB_CLIENT_ERROR_CODES.sessionRequired;
  }
}

/** Build a `YobApiError` from a single synthesised code. */
export function clientError(init: {
  kind: YobErrorKind;
  httpStatus: number;
  code: YobClientErrorCode;
  detail: string;
  frappeExcType?: string;
  method?: string;
}): YobApiError {
  const { kind, httpStatus, code, detail, frappeExcType, method } = init;
  return new YobApiError({
    kind,
    httpStatus,
    errors: [{ code, detail }],
    ...(frappeExcType !== undefined ? { frappeExcType } : {}),
    ...(method !== undefined ? { method } : {}),
  });
}

/**
 * Read a YOB error envelope out of a response body.
 *
 * Strict about the outer `message` wrapper on purpose. The live API always sends it,
 * and mock handlers are required to reproduce it, so accepting a bare `{errors:[…]}`
 * would only hide a mock that had drifted from the real contract.
 */
export function readYobErrors(body: unknown): YobErrorItem[] | null {
  if (!isRecord(body)) {
    return null;
  }
  const message = body['message'];
  if (!isRecord(message)) {
    return null;
  }
  const raw = message['errors'];
  if (!Array.isArray(raw)) {
    return null;
  }

  const items = raw.filter(isRecord).map(toErrorItem).filter(isErrorItem);
  return items.length > 0 ? items : null;
}

function toErrorItem(raw: Record<string, unknown>): YobErrorItem | null {
  const code = raw['code'];
  if (typeof code !== 'string') {
    return null;
  }

  const detail = raw['detail'];
  const field = raw['field'];
  const details = raw['details'];

  return {
    code,
    detail: typeof detail === 'string' ? detail : GENERIC_DETAIL,
    ...(typeof field === 'string' ? { field } : {}),
    ...(isRecord(details) ? { details } : {}),
  };
}

function isErrorItem(item: YobErrorItem | null): item is YobErrorItem {
  return item !== null;
}

/** Frappe's own exception class name, present only on raw Frappe failures. */
function readFrappeExcType(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }
  const excType = body['exc_type'];
  return typeof excType === 'string' ? excType : null;
}

/**
 * Turn anything thrown by `HttpClient` into a `YobApiError`.
 *
 * Ordering matters: the YOB envelope is checked first because it is the documented
 * contract, then the raw Frappe shape, and everything left over is `unexpected`.
 */
export function normalizeYobFailure(failure: unknown, method?: string): YobApiError {
  if (failure instanceof YobApiError) {
    return failure;
  }

  if (!(failure instanceof HttpErrorResponse)) {
    return clientError({
      kind: 'unexpected',
      httpStatus: 0,
      code: YOB_CLIENT_ERROR_CODES.unexpectedFailure,
      detail: GENERIC_DETAIL,
      ...(method !== undefined ? { method } : {}),
    });
  }

  // Status 0 means the browser never got a response: offline, DNS failure, connection
  // refused, or the dev proxy not running.
  if (failure.status === 0) {
    return clientError({
      kind: 'transport',
      httpStatus: 0,
      code: YOB_CLIENT_ERROR_CODES.networkUnavailable,
      detail: 'Could not reach the server. Check your connection and try again.',
      ...(method !== undefined ? { method } : {}),
    });
  }

  const body: unknown = failure.error;

  const yobErrors = readYobErrors(body);
  if (yobErrors) {
    return new YobApiError({
      kind: 'yob',
      httpStatus: failure.status,
      errors: yobErrors,
      ...(method !== undefined ? { method } : {}),
    });
  }

  const excType = readFrappeExcType(body);
  if (excType !== null) {
    return clientError({
      kind: 'frappe',
      httpStatus: failure.status,
      frappeExcType: excType,
      ...frappeRefusal(failure.status, excType),
      ...(method !== undefined ? { method } : {}),
    });
  }

  // Reached by the edge's non-JSON 421, and by any other body that is not a
  // recognised envelope.
  return clientError({
    kind: 'unexpected',
    httpStatus: failure.status,
    code: YOB_CLIENT_ERROR_CODES.unreadableResponse,
    detail: GENERIC_DETAIL,
    ...(method !== undefined ? { method } : {}),
  });
}

/**
 * Map Frappe's pre-envelope refusals onto stable client codes.
 *
 * Frappe's own wording is unusable: its 403 says "Function X is not whitelisted",
 * which is its generic phrasing for "whitelisted but not guest-allowed" and would be
 * nonsense in front of a user. The status + `exc_type` pair is the real signal.
 */
function frappeRefusal(
  status: number,
  excType: string,
): { code: YobClientErrorCode; detail: string } {
  if (status === 403 && excType === 'PermissionError') {
    return {
      code: YOB_CLIENT_ERROR_CODES.sessionRequired,
      detail: 'Your session is not valid. Please sign in again.',
    };
  }

  // Recovery is to refresh the CSRF token from the session context, NOT to sign the
  // user out - the session itself is still good.
  if (status === 400 && excType === 'CSRFTokenError') {
    return {
      code: YOB_CLIENT_ERROR_CODES.csrfTokenInvalid,
      detail: 'Your session security token is missing or expired. Please try again.',
    };
  }

  return { code: YOB_CLIENT_ERROR_CODES.unexpectedFailure, detail: GENERIC_DETAIL };
}
