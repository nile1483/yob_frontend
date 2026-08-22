import type { Routes } from '@angular/router';

/**
 * The dynamic merchant page route.
 *
 * `/pages/:slug` is the route Phase 25D's navigation already builds for a
 * `storefront_page` destination - the backend stores no route by design, so this is where
 * that agreement is kept.
 *
 * Its own file rather than an entry in `content.routes.ts`: those are static public pages
 * with no data layer, and this is a lazily loaded, authenticated, data-driven route.
 */
export const STOREFRONT_PAGE_ROUTES: Routes = [
  {
    path: ':slug',
    loadComponent: () => import('./pages/storefront-page').then((m) => m.StorefrontPage),
  },
];
