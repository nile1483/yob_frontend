import { mockPermissionError, mockSuccess, mockYobError, type MockReply } from '../core/mock-reply';
import type { MockContext, MockHandler } from '../core/mock-handler';
import {
  MOCK_MENU,
  MOCK_MENU_KEY,
  MOCK_PAGES_BY_SLUG,
  MOCK_ROUTE_CONTENT,
} from '../fixtures/cms.fixture';

/**
 * CMS handlers.
 *
 * Navigation (Phase 25D), merchant pages (Phase 25E) and system route content
 * (Phase 25H).
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

/**
 * `cms.get_route_content` - every content slot of ONE application route.
 *
 * Answers with **all** of a route's slots, empty ones included, exactly as the backend
 * does. That shape is the point: a client that asked per slot, or that only rendered
 * keys it happened to find, would pass against a thinner fixture and fail against the
 * real API. It is also what makes "one request per route" observable - a second call
 * for the same route shows up in the request log.
 *
 * `content_route_unknown` (422) covers both an unrecognised key and a deliberately
 * excluded flow - login, checkout, payment - which have no slots by decision.
 */
const getRouteContent: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  if (ctx.scenario === 'route-content-unavailable') {
    return mockYobError('internal_server_error', 'Something went wrong.', { status: 500 });
  }

  const routeKey = ctx.params.get('route_key');
  if (routeKey === null || routeKey === '') {
    return mockYobError('validation_failed', 'Route key is required.', {
      field: 'route_key',
      status: 422,
    });
  }

  const content = MOCK_ROUTE_CONTENT[routeKey];
  if (content === undefined) {
    return mockYobError('content_route_unknown', 'Route cannot hold content.', {
      field: 'route_key',
      status: 422,
    });
  }

  return mockSuccess(content, { notice: 'Route content loaded' });
};

function requireSession(ctx: MockContext): MockReply | null {
  return ctx.session.isAuthenticated() ? null : mockPermissionError(ctx.rpcMethod);
}

export const CMS_HANDLERS: Readonly<Record<string, MockHandler>> = {
  'yob_storefront.api.cms.get_menu': getMenu,
  'yob_storefront.api.cms.get_page': getPage,
  'yob_storefront.api.cms.get_route_content': getRouteContent,
};
