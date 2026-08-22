import type { Routes } from '@angular/router';

/**
 * The storefront landing route.
 *
 * Its own routes file for the same reason every other domain has one: adding or
 * removing Home in a copied client project is then one entry in `app.routes.ts`.
 */
export const HOME_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home-page').then((m) => m.HomePage),
    title: 'Home',
  },
];
