import { type MockReply, mockPermissionError, mockSuccess, mockYobError } from '../core/mock-reply';
import type { MockContext, MockHandler } from '../core/mock-handler';
import {
  MOCK_CATEGORIES_BY_SLUG,
  MOCK_TOP_LEVEL_CATEGORIES,
  mockChildCategories,
} from '../fixtures/catalog.fixture';

/**
 * Catalog handlers.
 *
 * Both endpoints are secure, so a request without a mock session gets the same raw
 * Frappe 403 the real backend sends - which is what makes the route guard and session
 * restore behave identically here and against Frappe.
 */

/**
 * `get_categories` - top level, or the children of `parent_slug`.
 *
 * An unknown `parent_slug` answers 200 with an empty list and the backend's own
 * "No categories found" notice, not a 404. Reproducing that matters: a UI that treated
 * it as an error would be wrong against the real API.
 */
const getCategories: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  if (ctx.scenario === 'empty') {
    return mockSuccess([], { notice: 'Categories loaded', meta: { count: 0 } });
  }

  const parentSlug = ctx.params.get('parent_slug');
  if (parentSlug !== null && parentSlug !== '') {
    const children = mockChildCategories(parentSlug);
    return children.length === 0
      ? mockSuccess([], { notice: 'No categories found', meta: { count: 0 } })
      : mockSuccess(children, { notice: 'Categories loaded', meta: { count: children.length } });
  }

  return mockSuccess(MOCK_TOP_LEVEL_CATEGORIES, {
    notice: 'Categories loaded',
    meta: { count: MOCK_TOP_LEVEL_CATEGORIES.length },
  });
};

/**
 * `get_category` - one category with its subcategories and items.
 *
 * Mirrors the backend's own ordering of checks: a missing slug is a 422 naming the
 * field, an unknown slug is a 404 with the stable `category_not_found` code.
 */
const getCategory: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  const slug = ctx.params.get('slug');
  if (slug === null || slug === '') {
    return mockYobError('validation_failed', 'Category slug is required.', {
      field: 'slug',
      status: 422,
    });
  }

  const payload = MOCK_CATEGORIES_BY_SLUG[slug];
  if (payload === undefined) {
    return mockYobError('category_not_found', 'Category not found.', {
      field: 'slug',
      status: 404,
    });
  }

  return mockSuccess(payload, {
    notice: 'Category loaded',
    meta: {
      subcategory_count: payload.subcategories.length,
      item_count: payload.items.length,
    },
  });
};

/** Both endpoints are login-protected; without a session Frappe refuses before YOB runs. */
function requireSession(ctx: MockContext): MockReply | null {
  return ctx.session.isAuthenticated() ? null : mockPermissionError(ctx.rpcMethod);
}

export const CATALOG_HANDLERS: Readonly<Record<string, MockHandler>> = {
  'yob_storefront.api.catalog.get_categories': getCategories,
  'yob_storefront.api.catalog.get_category': getCategory,
};
