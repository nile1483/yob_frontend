import { mockPermissionError, mockSuccess, mockYobError, type MockReply } from '../core/mock-reply';
import type { MockContext, MockHandler } from '../core/mock-handler';
import { MOCK_MENU, MOCK_MENU_KEY, MOCK_PAGES_BY_SLUG } from '../fixtures/cms.fixture';

/**
 * CMS handlers.
 *
 * Navigation (Phase 25D) and merchant pages (Phase 25E).
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

/**
 * `cms.get_page` - one published page with its ordered blocks.
 *
 * The Product Grid's rows are embedded in the page, exactly as the backend embeds them:
 * a client that needed a second request per card would be visible here as a request this
 * handler never receives.
 *
 * `page_not_found` (404) covers unknown **and** unpublished, deliberately
 * indistinguishably - the same treatment `menu_not_found` gets.
 */
const getPage: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  const slug = ctx.params.get('slug');
  if (slug === null || slug === '') {
    return mockYobError('validation_failed', 'Page slug is required.', {
      field: 'slug',
      status: 422,
    });
  }

  const page = MOCK_PAGES_BY_SLUG[slug];
  if (page === undefined) {
    return mockYobError('page_not_found', 'Page not found.', { field: 'slug', status: 404 });
  }

  return mockSuccess(page, { notice: 'Page loaded' });
};

function requireSession(ctx: MockContext): MockReply | null {
  return ctx.session.isAuthenticated() ? null : mockPermissionError(ctx.rpcMethod);
}

export const CMS_HANDLERS: Readonly<Record<string, MockHandler>> = {
  'yob_storefront.api.cms.get_menu': getMenu,
  'yob_storefront.api.cms.get_page': getPage,
};
