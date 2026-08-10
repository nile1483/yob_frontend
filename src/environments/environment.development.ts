import type { YobApiConfig } from '../app/foundation/network/yob-api.config';

/**
 * Development environment values.
 *
 * `methodBasePath` stays relative: `proxy.conf.json` forwards `/api` to the YOB edge
 * proxy on `127.0.0.1:8080` with `Host: storefront.local`. Pointing this at an
 * absolute URL, or at Frappe on `:8000` directly, bypasses the edge and every
 * authenticated call answers `403 application_access_denied`.
 */
export const environment: {
  readonly production: boolean;
  readonly api: YobApiConfig;
} = {
  production: false,
  api: {
    methodBasePath: '/api/method/',
    application: 'STOREFRONT',
  },
};
