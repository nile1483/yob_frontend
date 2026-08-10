/**
 * Transport-level contracts for the Frappe/YOB RPC API.
 *
 * Nothing here knows about customers, items, orders or carts. Domain DTOs belong in
 * each domain's own `data/` folder and are supplied as the `T` of `YobResponse<T>`.
 *
 * Shapes are taken from `reference/api/live/verified-responses.json`.
 */

/**
 * A Frappe RPC method path, for example
 * `yob_storefront.api.catalog.get_categories`.
 *
 * The client turns this into `/api/method/<method>`; callers never build URLs.
 */
export type YobMethod = string;

/** Query values the client knows how to serialise. `null`/`undefined` are dropped. */
export type YobQueryValue = string | number | boolean;

export type YobQueryParams = Readonly<Record<string, YobQueryValue | null | undefined>>;

/** JSON request body for a POST. Endpoint-specific shapes stay in the domains. */
export type YobRequestBody = Readonly<Record<string, unknown>>;

/**
 * Supporting information: counts, pagination, warnings.
 *
 * Deliberately untyped per endpoint - `meta` is `{count}` on list endpoints but
 * `{subcategory_count, item_count}` on `get_category`. Domains narrow it themselves
 * rather than the transport layer guessing a union.
 */
export type YobMeta = Readonly<Record<string, unknown>>;

/**
 * A successful YOB envelope with Frappe's outer `message` already removed.
 *
 * `notice` and `meta` are genuinely optional: the backend omits them entirely when
 * empty, and `get_session_context` returns no `notice` at all.
 */
export interface YobResponse<T> {
  readonly data: T;
  readonly notice?: string;
  readonly meta?: YobMeta;
}

/**
 * One entry of the YOB `errors` array.
 *
 * `code` is the stable machine-readable contract - branch on it, never on `detail`.
 * `details` currently carries `{correlation_id}` on `internal_server_error`.
 */
export interface YobErrorItem {
  readonly code: string;
  readonly detail: string;
  readonly field?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * The one runtime helper these contracts need: narrowing an untyped JSON value
 * before reading keys off it. Lives here so both the success unwrapper and the
 * failure normaliser can share it without either importing the other.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
