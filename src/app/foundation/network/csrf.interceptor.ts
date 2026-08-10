import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { CsrfTokenStore } from './csrf-token.store';
import { YOB_API_CONFIG } from './yob-api.config';

const CSRF_HEADER = 'X-Frappe-CSRF-Token';

/** Frappe only validates CSRF on state-changing requests. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Attach Frappe's CSRF token to mutating YOB requests.
 *
 * Three guards, each load-bearing:
 *
 * 1. Safe methods are skipped - a CSRF header on a GET is noise, and Frappe ignores it.
 * 2. Only URLs under the configured RPC base path are touched. The path is relative,
 *    so an absolute URL to any other host can never match, and third-party requests
 *    are passed through untouched rather than leaking the token off-origin.
 * 3. No token, no header. A blank or invented header value would turn a clean
 *    "not signed in yet" into a confusing `CSRFTokenError`.
 */
export const yobCsrfInterceptor: HttpInterceptorFn = (req, next) => {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next(req);
  }

  const { methodBasePath } = inject(YOB_API_CONFIG);
  if (!req.url.startsWith(methodBasePath)) {
    return next(req);
  }

  const token = inject(CsrfTokenStore).current();
  if (token === null) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { [CSRF_HEADER]: token } }));
};
