import type { Routes } from '@angular/router';

import { environment } from '../environments/environment';
import { DEFAULT_AUTHENTICATED_PATH } from './foundation/session/return-url';
import { secureRouteGuard } from './foundation/session/session.guard';
import { PublicShell } from './shells/public/public-shell';
import { SecureShell } from './shells/secure/secure-shell';

/**
 * Two route branches, each with its own shell.
 *
 * ```text
 * /                        -> redirects to /catalog
 *
 * PUBLIC   (PublicShell, no guard)
 *   /login                 access domain
 *   /terms                 content domain
 *   /session-unavailable   content domain
 *
 * SECURE   (SecureShell, secureRouteGuard)
 *   /catalog               catalog domain
 *   /account               account domain
 *
 * anything else            not-found, inside PublicShell
 * ```
 *
 * Both branches sit at `path: ''`, which is what lets each have its own shell without
 * prefixing URLs. The router tries them in order and backtracks when no child matches,
 * so ordering carries meaning:
 *
 * 1. the root redirect is `pathMatch: 'full'`, so it claims only the empty URL
 * 2. public comes before secure, so `/login` can never be swallowed by the guard
 * 3. not-found is last, because a `**` child inside an earlier shell would match every
 *    URL and the secure branch would never be reached
 *
 * Domain areas are lazy-loaded and own their own routes file. Adding a business area
 * means adding one entry here; removing one in a copied client means deleting it.
 * Access control belongs to the branch, never to individual pages.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    // Shared with the return-URL fallback so the two cannot drift apart.
    redirectTo: DEFAULT_AUTHENTICATED_PATH,
  },

  // ---------------------------------------------------------------- public
  {
    path: '',
    component: PublicShell,
    children: [
      {
        path: 'login',
        loadChildren: () => import('./domains/access/access.routes').then((m) => m.ACCESS_ROUTES),
      },
      {
        path: '',
        loadChildren: () => import('./domains/content/content.routes').then((m) => m.CONTENT_ROUTES),
      },
    ],
  },

  // ---------------------------------------------------------------- secure
  {
    path: '',
    component: SecureShell,
    canActivate: [secureRouteGuard],
    children: [
      {
        path: 'catalog',
        loadChildren: () => import('./domains/catalog/catalog.routes').then((m) => m.CATALOG_ROUTES),
      },
      {
        path: 'account',
        loadChildren: () => import('./domains/account/account.routes').then((m) => m.ACCOUNT_ROUTES),
      },
    ],
  },

  // Empty in production. See AppEnvironment.devRoutes.
  ...environment.devRoutes,

  // ------------------------------------------------------------- not found
  {
    path: '',
    component: PublicShell,
    children: [
      {
        path: '**',
        loadComponent: () =>
          import('./domains/content/pages/not-found-page').then((m) => m.NotFoundPage),
        title: 'Page not found',
      },
    ],
  },
];
