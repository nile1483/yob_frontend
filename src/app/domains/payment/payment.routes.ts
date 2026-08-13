import type { Routes } from '@angular/router';

/**
 * The public token-based payment flow.
 *
 * `:token` is a bearer credential carried in the URL. That is the contract - the
 * server hands back `/payment/<token>` and the buyer may arrive with no session at
 * all, from a different device or a link - so this branch must stay **public**. It
 * sits under the public shell in `app.routes.ts`, outside `secureRouteGuard`; a guard
 * here would bounce paying customers to a sign-in page they have no account for.
 */
export const PAYMENT_ROUTES: Routes = [
  {
    path: ':token',
    loadComponent: () => import('./pages/payment-page').then((m) => m.PaymentPage),
    title: 'Payment',
  },
];
