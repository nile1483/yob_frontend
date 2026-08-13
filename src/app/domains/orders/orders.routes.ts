import type { Routes } from '@angular/router';

/**
 * Buyer order history and detail.
 *
 * `:orderId` is the Sales Order `name` (`SAL-ORD-2026-00001`) - the identifier
 * `get_order_details` takes and the number the buyer quotes. There is no separate
 * display number, so nothing is translated between the two.
 *
 * Both routes are authenticated: they sit under the secure branch in `app.routes.ts`,
 * behind `secureRouteGuard`, because the endpoints require a session and the customer
 * is derived from it.
 */
export const ORDERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/orders-page').then((m) => m.OrdersPage),
    title: 'Your orders',
  },
  {
    path: ':orderId',
    loadComponent: () => import('./pages/order-page').then((m) => m.OrderPage),
    title: 'Order',
  },
];
