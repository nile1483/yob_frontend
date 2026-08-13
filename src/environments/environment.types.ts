import type { HttpInterceptorFn } from '@angular/common/http';
import type { Provider } from '@angular/core';
import type { Routes } from '@angular/router';

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
   * Locale defaults for this copied client project.
   *
   * There is no runtime language or currency switch; a project ships with one. The
   * currency lives here because the catalog endpoints return prices as bare numbers
   * with no currency field - see `CATALOG_CURRENCY`. `get_config.default_currency` is
   * the authoritative source and should supersede this once store context is loaded.
   */
  readonly locale: {
    readonly defaultCurrency: string;
  };

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

  /**
   * Extra routes this environment contributes.
   *
   * Empty in production. Development and mock builds add the design gallery, a page
   * that exists only so the visual primitives can be exercised in a real browser
   * before any screen uses them. It is routed from here, and not from
   * `app.routes.ts`, for the same reason the mock API is: the production environment
   * file never imports it, so it cannot reach a production bundle - it is absent
   * rather than merely unreachable.
   */
  readonly devRoutes: Routes;

  /**
   * Extra providers this environment contributes.
   *
   * Empty in production, and for the same structural reason as `httpInterceptors`:
   * `fileReplacements` swaps the whole file, and the production one imports nothing
   * from `src/mock-api`, so a development substitute is absent from a production
   * bundle rather than merely unused.
   *
   * Today this carries the deterministic Razorpay Checkout stand-in, so browser tests
   * never load the real third-party widget. A runtime flag would have left the fake in
   * the bundle, one mistake away from taking a real payment through a fake modal.
   */
  readonly providers: readonly Provider[];
}
