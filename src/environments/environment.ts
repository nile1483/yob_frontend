import type { AppEnvironment } from './environment.types';

/**
 * Production environment values.
 *
 * This file deliberately imports nothing from `src/mock-api`. `fileReplacements`
 * swaps the whole file for `environment.development.ts` in development builds, so the
 * mock layer is simply not part of a production bundle - it cannot be enabled by a
 * misread flag, only by editing this file.
 */
export const environment: AppEnvironment = {
  production: true,
  mockApi: false,
  api: {
    methodBasePath: '/api/method/',
    application: 'STOREFRONT',
  },
  locale: {
    defaultCurrency: 'INR',
  },
  httpInterceptors: [],
  devRoutes: [],
};
