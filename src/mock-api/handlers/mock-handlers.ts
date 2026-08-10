import type { MockHandlerRegistry } from '../core/mock-handler';
import { AUTH_HANDLERS } from './auth.handlers';
import { CATALOG_HANDLERS } from './catalog.handlers';

/**
 * Every RPC method the mock API can answer, keyed by Frappe method name.
 *
 * New domain handlers are added here as their phases land - catalog, cart, orders and
 * so on - each in its own `*.handlers.ts` file beside this one. A method with no entry
 * is answered with an explicit "not implemented" reply rather than being passed to the
 * real backend, so a half-mocked session cannot silently mix mock and live data.
 */
export const MOCK_HANDLERS: MockHandlerRegistry = {
  ...AUTH_HANDLERS,
  ...CATALOG_HANDLERS,
};
