import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  InjectionToken,
  makeEnvironmentProviders,
  type EnvironmentProviders,
} from '@angular/core';

import { yobCsrfInterceptor } from './csrf.interceptor';

/**
 * Application-wide technical configuration for the YOB API.
 *
 * This is the only kind of configuration the architecture allows: environment/API
 * values that genuinely cannot be a source edit. Visual and page-level choices stay
 * in the markup.
 */
export interface YobApiConfig {
  /**
   * Prefix for every Frappe RPC call.
   *
   * Relative on purpose. The browser must stay same-origin with the API because the
   * Frappe `sid` cookie is host-scoped (no `Domain` attribute), and in development
   * `/api` is forwarded to the YOB edge proxy by `proxy.conf.json`.
   */
  readonly methodBasePath: string;

  /**
   * The YOB application code this storefront authenticates as.
   *
   * Required by `login_with_password`, `request_otp` and `get_session_context`. It
   * lives here rather than in domain code because a copied client project may be
   * issued a different code. Not consumed until the session domain lands in Phase 3.
   */
  readonly application: string;
}

export const YOB_API_CONFIG = new InjectionToken<YobApiConfig>('YOB_API_CONFIG');

/**
 * Wire up the YOB network foundation: transport configuration, `HttpClient`, and the
 * CSRF interceptor.
 *
 * `withFetch()` is deliberately not enabled - the XHR backend is the default and
 * nothing here needs the fetch backend yet.
 */
export function provideYobNetwork(config: YobApiConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: YOB_API_CONFIG, useValue: config },
    provideHttpClient(withInterceptors([yobCsrfInterceptor])),
  ]);
}
