import type { Routes } from '@angular/router';

/**
 * Public static pages.
 *
 * `not-found` and `session-unavailable` are structural rather than editorial, but they
 * are static public pages with no data layer, so they live here instead of earning a
 * folder of their own.
 */
export const CONTENT_ROUTES: Routes = [
  {
    path: 'terms',
    loadComponent: () => import('./pages/terms-page').then((m) => m.TermsPage),
    title: 'Terms',
  },
  {
    path: 'session-unavailable',
    loadComponent: () =>
      import('./pages/session-unavailable-page').then((m) => m.SessionUnavailablePage),
    title: 'Service unavailable',
  },
];
