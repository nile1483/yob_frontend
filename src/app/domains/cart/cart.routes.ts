import type { Routes } from '@angular/router';

export const CART_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/cart-page').then((m) => m.CartPage),
    title: 'Your cart',
  },
];
