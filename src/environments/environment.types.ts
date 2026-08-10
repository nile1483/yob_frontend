import type { HttpInterceptorFn } from '@angular/common/http';

import type { YobApiConfig } from '../app/foundation/network/yob-api.config';

/**
 * Application-level technical configuration.
 *
 * Technical values only - API paths, application code, mock mode. Visual and
 * page-level choices are source edits in a copied client project, never settings.
 */
export interface AppEnvironment {
  readonly production: boolean;

  /**
   * Whether Frappe RPC calls are served by the in-browser mock API.
   *
   * Readable state for humans and tests. The actual wiring is `httpInterceptors`
   * below, because a boolean alone could not keep mock code out of a production
   * bundle.
   */
  readonly mockApi: boolean;

  readonly api: YobApiConfig;

  /**
   * Extra HTTP interceptors this environment contributes, appended after the
   * application's own.
   *
   * This field is why mock mode is safe: `fileReplacements` swaps the whole
   * environment file, and the production file never imports `src/mock-api`, so the
   * mock layer is absent from a production build rather than merely disabled. A
   * runtime `if (mockApi)` would leave the handlers and fixtures in the bundle and
   * one bad flag away from serving fake data to real users.
   */
  readonly httpInterceptors: readonly HttpInterceptorFn[];
}
