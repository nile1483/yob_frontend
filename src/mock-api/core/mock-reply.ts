/**
 * Builders for mock responses.
 *
 * Everything here emits the **wire** shape, not the shape `YobApiClient` hands to
 * domain code. Mocks that returned an already-unwrapped `YobResponse` would skip the
 * very layer they are supposed to exercise, and a broken envelope would then only be
 * discovered against the real backend.
 *
 * Shapes come from `reference/api/live/verified-responses.json`.
 */

/** A mock's answer, before it becomes an `HttpResponse` or `HttpErrorResponse`. */
export interface MockReply {
  readonly status: number;
  readonly body: unknown;
}

/**
 * A successful YOB envelope inside Frappe's outer `message` wrapper.
 *
 * `notice` and `meta` are omitted when absent, exactly as the backend omits them -
 * `get_session_context` returns neither.
 */
export function mockSuccess(
  data: unknown,
  options: { notice?: string; meta?: Readonly<Record<string, unknown>>; status?: number } = {},
): MockReply {
  const { notice, meta, status = 200 } = options;

  return {
    status,
    body: {
      message: {
        data,
        ...(notice !== undefined ? { notice } : {}),
        ...(meta !== undefined ? { meta } : {}),
      },
    },
  };
}

/** A YOB error envelope: `{message: {errors: [...]}}`. */
export function mockYobError(
  code: string,
  detail: string,
  options: {
    field?: string;
    details?: Readonly<Record<string, unknown>>;
    status?: number;
  } = {},
): MockReply {
  const { field, details, status = 422 } = options;

  return {
    status,
    body: {
      message: {
        errors: [
          {
            code,
            detail,
            ...(field !== undefined ? { field } : {}),
            ...(details !== undefined ? { details } : {}),
          },
        ],
      },
    },
  };
}

/**
 * A raw Frappe exception body - no `message` wrapper, no `errors` array.
 *
 * Frappe rejects these requests before the YOB envelope exists, so the mock has to be
 * able to produce the ugly shape too. The traceback field is present but obviously
 * fake: its job is to prove the network layer discards it, not to look real.
 *
 * Used for `PermissionError` (403, no session) and `CSRFTokenError` (400, missing or
 * stale token).
 */
export function mockFrappeError(excType: string, status: number, summary: string): MockReply {
  return {
    status,
    body: {
      exception: `frappe.exceptions.${excType}: <details><summary>${summary}</summary></details>`,
      exc_type: excType,
      exc: '["Traceback (most recent call last):\\n  <mock traceback - must never reach the user>"]',
      _server_messages: `[{"message":"${summary}"}]`,
    },
  };
}

/** The 403 a guest gets from any secure endpoint. */
export function mockPermissionError(rpcMethod: string): MockReply {
  return mockFrappeError(
    'PermissionError',
    403,
    `You are not permitted to access this resource. Login to access. Function ${rpcMethod} is not whitelisted.`,
  );
}

/** The 400 a mutating call gets without a valid CSRF token. */
export function mockCsrfError(): MockReply {
  return mockFrappeError('CSRFTokenError', 400, 'Invalid Request');
}
