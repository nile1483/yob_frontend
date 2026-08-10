import type { YobApiConfig } from '../app/foundation/network/yob-api.config';

/**
 * Production environment values.
 *
 * Technical configuration only - API paths, application code, and later the mock-API
 * flag. Visual and page-level choices are source edits in a copied client project,
 * not settings.
 *
 * `environment.development.ts` replaces this file in development builds
 * (see `fileReplacements` in angular.json).
 */
export const environment: {
  readonly production: boolean;
  readonly api: YobApiConfig;
} = {
  production: true,
  api: {
    methodBasePath: '/api/method/',
    application: 'STOREFRONT',
  },
};
