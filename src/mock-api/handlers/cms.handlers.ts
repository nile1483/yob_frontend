import { mockPermissionError, mockSuccess, mockYobError, type MockReply } from '../core/mock-reply';
import type { MockContext, MockHandler } from '../core/mock-handler';
import { MOCK_MENU, MOCK_MENU_KEY } from '../fixtures/cms.fixture';

/**
 * CMS handlers.
 *
 * Navigation only, matching what Phase 25D consumes. `cms.get_page` is on the wire and
 * is deliberately not mocked: a handler for an endpoint nothing calls would be a fixture
 * the next phase has to reconcile rather than build against.
 */

/**
 * `cms.get_menu` - one published navigation tree.
 *
 * The fixture is already published output: disabled items, unresolvable destinations and
 * emptied groups have been removed by the backend, and this returns it as-is. The mock
 * does not re-run publication rules, because neither does the frontend.
 *
 * `menu_not_found` (404) covers an unknown key **and** a disabled menu. The contract
 * makes them deliberately indistinguishable, so the mock answers identically for both
 * rather than inventing a distinction a client might start relying on.
 */
const getMenu: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  const menuKey = ctx.params.get('menu_key');
  if (menuKey === null || menuKey === '') {
    return mockYobError('validation_failed', 'Menu key is required.', {
      field: 'menu_key',
      status: 422,
    });
  }

  if (menuKey !== MOCK_MENU_KEY || ctx.scenario === 'menu-missing') {
    return mockYobError('menu_not_found', 'Menu not found.', {
      field: 'menu_key',
      status: 404,
    });
  }

  return mockSuccess(MOCK_MENU, { notice: 'Menu loaded' });
};

function requireSession(ctx: MockContext): MockReply | null {
  return ctx.session.isAuthenticated() ? null : mockPermissionError(ctx.rpcMethod);
}

export const CMS_HANDLERS: Readonly<Record<string, MockHandler>> = {
  'yob_storefront.api.cms.get_menu': getMenu,
};
