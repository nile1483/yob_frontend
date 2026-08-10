import { HttpClient, HttpParams, type HttpResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { catchError, map, type Observable, throwError } from 'rxjs';

import {
  YOB_CLIENT_ERROR_CODES,
  YobApiError,
  clientError,
  normalizeYobFailure,
  readYobErrors,
} from './yob-api-error';
import { YOB_API_CONFIG } from './yob-api.config';
import {
  isRecord,
  type YobMethod,
  type YobQueryParams,
  type YobRequestBody,
  type YobResponse,
} from './yob-api.types';

/**
 * A Frappe dotted method path: `app.module.function`, at least two segments.
 *
 * Validated so a caller cannot smuggle a path segment (`../`) or a query string into
 * the URL through what is supposed to be a method name.
 */
const METHOD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;

/**
 * The one Frappe-aware HTTP helper. Every domain API file goes through it.
 *
 * It owns exactly four things: building `/api/method/<method>`, removing Frappe's
 * outer `message` wrapper, returning the typed YOB envelope, and turning every
 * failure into a `YobApiError`. It holds no endpoint list and no business knowledge -
 * a giant `ApiService` is explicitly what this is not.
 *
 * Session handling is the browser's job. This class never reads or writes cookies,
 * and does not set `withCredentials`: the RPC path is relative, so requests are
 * same-origin and the HttpOnly `sid` cookie is attached automatically. Enabling
 * `withCredentials` would buy nothing today and would silently start sending
 * credentials cross-origin if the base path ever became absolute.
 */
@Service()
export class YobApiClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(YOB_API_CONFIG);

  /**
   * Call a Frappe RPC method with `GET`.
   *
   * `null`/`undefined` params are dropped so callers can pass optional values
   * directly instead of assembling a params object conditionally.
   */
  get<T>(method: YobMethod, params?: YobQueryParams): Observable<YobResponse<T>> {
    return this.http
      .get(this.methodUrl(method), {
        observe: 'response',
        params: toHttpParams(params),
      })
      .pipe(
        map((response) => this.unwrap<T>(response, method)),
        catchError((failure: unknown) => throwError(() => normalizeYobFailure(failure, method))),
      );
  }

  /**
   * Call a Frappe RPC method with `POST`.
   *
   * The body defaults to `{}` because several documented mutations take no arguments
   * and Frappe expects a JSON body regardless.
   */
  post<T>(method: YobMethod, body: YobRequestBody = {}): Observable<YobResponse<T>> {
    return this.http.post(this.methodUrl(method), body, { observe: 'response' }).pipe(
      map((response) => this.unwrap<T>(response, method)),
      catchError((failure: unknown) => throwError(() => normalizeYobFailure(failure, method))),
    );
  }

  /**
   * Build `/api/method/<method>`.
   *
   * Throws synchronously rather than returning a failing stream: an invalid method
   * name is a programming mistake, not a runtime API condition, and should surface at
   * the call site.
   */
  private methodUrl(method: YobMethod): string {
    if (!METHOD_PATTERN.test(method)) {
      throw new Error(`Invalid Frappe RPC method name: "${method}"`);
    }
    return `${this.config.methodBasePath}${method}`;
  }

  /**
   * Remove Frappe's outer `message` wrapper and hand back the YOB envelope.
   *
   * Frappe puts its own keys (`home_page`, `full_name`) next to `message` on login,
   * so unknown top-level siblings are ignored rather than rejected.
   */
  private unwrap<T>(response: HttpResponse<unknown>, method: YobMethod): YobResponse<T> {
    const body: unknown = response.body;

    // An error envelope can arrive under a 2xx status - the OpenAPI `get_item` 200
    // example is exactly that. `errors` wins over the status code.
    const errors = readYobErrors(body);
    if (errors) {
      throw new YobApiError({ kind: 'yob', httpStatus: response.status, errors, method });
    }

    if (!isRecord(body) || !isRecord(body['message'])) {
      throw this.malformed(response.status, method);
    }

    const message = body['message'];
    if (!('data' in message)) {
      throw this.malformed(response.status, method);
    }

    const notice = message['notice'];
    const meta = message['meta'];

    return {
      // The only cast in the transport layer. Runtime validation of every domain
      // payload belongs to the domains, not here.
      data: message['data'] as T,
      ...(typeof notice === 'string' ? { notice } : {}),
      ...(isRecord(meta) ? { meta } : {}),
    };
  }

  private malformed(httpStatus: number, method: YobMethod): YobApiError {
    return clientError({
      kind: 'unexpected',
      httpStatus,
      code: YOB_CLIENT_ERROR_CODES.unreadableResponse,
      detail: 'Something went wrong. Please try again.',
      method,
    });
  }
}

function toHttpParams(params?: YobQueryParams): HttpParams {
  let httpParams = new HttpParams();
  if (!params) {
    return httpParams;
  }

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      continue;
    }
    httpParams = httpParams.set(key, String(value));
  }

  return httpParams;
}
