import type { Routes } from '@angular/router';

/**
 * Public sign-in routes.
 *
 * Lazy-loaded from `app.routes.ts`. Each domain owns a routes file like this one, so a
 * copied client project adds or removes a whole business area by editing one import.
 */
export const ACCESS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/login-page').then((m) => m.LoginPage),
    title: 'Sign in',
  },
];
