import type { Routes } from '@angular/router';

export const ACCOUNT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/account-page').then((m) => m.AccountPage),
    title: 'Your account',
  },
];
