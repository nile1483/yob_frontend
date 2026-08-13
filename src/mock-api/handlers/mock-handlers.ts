import type { MockHandlerRegistry } from '../core/mock-handler';
import { ADDRESS_HANDLERS } from './address.handlers';
import { AUTH_HANDLERS } from './auth.handlers';
import { CART_HANDLERS } from './cart.handlers';
import { CATALOG_HANDLERS } from './catalog.handlers';
import { CHECKOUT_HANDLERS } from './checkout.handlers';
import { PAYMENT_HANDLERS } from './payment.handlers';

/**
 * Every RPC method the mock API can answer, keyed by Frappe method name.
 *
 * New domain handlers are added here as their phases land - catalog, cart, orders and
 * so on - each in its own `*.handlers.ts` file beside this one. A method with no entry
 * is answered with an explicit "not implemented" reply rather than being passed to the
 * real backend, so a half-mocked session cannot silently mix mock and live data.
 */
export const MOCK_HANDLERS: MockHandlerRegistry = {
  ...ADDRESS_HANDLERS,
  ...AUTH_HANDLERS,
  ...CATALOG_HANDLERS,
  ...CART_HANDLERS,
  ...CHECKOUT_HANDLERS,
  ...PAYMENT_HANDLERS,
};
