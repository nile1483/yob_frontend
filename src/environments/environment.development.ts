import { mockApiInterceptor } from '../mock-api/mock-api.interceptor';
import type { AppEnvironment } from './environment.types';

/**
 * Flip this to develop without the YOB backend.
 *
 * `false` - requests go through `proxy.conf.json` to the real edge on :8080.
 * `true`  - requests are served by `src/mock-api` handlers, in memory.
 *
 * Defaults to `false` so `ng serve` keeps talking to the real backend and
 * `scripts/live-smoke.mjs` keeps working unchanged.
 */
const USE_MOCK_API = false;

/**
 * Development environment values.
 *
 * `methodBasePath` stays relative: `proxy.conf.json` forwards `/api` to the YOB edge
 * proxy on `127.0.0.1:8080` with `Host: storefront.local`. Pointing this at an
 * absolute URL, or at Frappe on `:8000` directly, bypasses the edge and every
 * authenticated call answers `403 application_access_denied`.
 */
export const environment: AppEnvironment = {
  production: false,
  mockApi: USE_MOCK_API,
  api: {
    methodBasePath: '/api/method/',
    application: 'STOREFRONT',
  },
  httpInterceptors: USE_MOCK_API ? [mockApiInterceptor] : [],
  devRoutes: [
    {
      path: '__design',
      loadComponent: () => import('../dev/design-gallery').then((m) => m.DesignGallery),
      title: 'Design gallery',
    },
  ],
};
