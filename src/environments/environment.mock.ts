import { RazorpayCheckout } from '../app/domains/payment/razorpay/razorpay-checkout';
import { mockApiInterceptor } from '../mock-api/mock-api.interceptor';
import { FakeRazorpayCheckout } from '../mock-api/razorpay/fake-razorpay-checkout';
import type { AppEnvironment } from './environment.types';

/**
 * Development against the in-browser mock API, with no backend at all.
 *
 * Selected by `ng serve --configuration mock` (see `npm run start:mock`), which is
 * what Playwright starts. E2E needs the session to resolve the same way every run:
 * against the real edge that depends on a Frappe bench being up, and when it is not,
 * restore fails and the app correctly lands on `/session-unavailable` instead of the
 * sign-in page - a true result, but not the one the test is asking about.
 *
 * This is a build target, not a feature flag. `environment.development.ts` still
 * defaults to the real edge, so ordinary `ng serve` and `scripts/live-smoke.mjs` are
 * unaffected, and production still cannot reach the mock layer at all.
 */
export const environment: AppEnvironment = {
  production: false,
  mockApi: true,
  api: {
    methodBasePath: '/api/method/',
    application: 'STOREFRONT',
  },
  locale: {
    defaultCurrency: 'INR',
  },
  httpInterceptors: [mockApiInterceptor],
  providers: [{ provide: RazorpayCheckout, useClass: FakeRazorpayCheckout }],
  devRoutes: [
    {
      path: '__design',
      loadComponent: () => import('../dev/design-gallery').then((m) => m.DesignGallery),
      title: 'Design gallery',
    },
  ],
};
