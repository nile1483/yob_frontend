import type { Routes } from '@angular/router';

export const CHECKOUT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/checkout-page').then((m) => m.CheckoutPage),
    title: 'Checkout',
  },
];
