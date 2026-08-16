import { type MockReply, mockPermissionError, mockSuccess, mockYobError } from '../core/mock-reply';
import type { MockContext, MockHandler } from '../core/mock-handler';
import type { CatalogItemDto } from '../../app/domains/catalog/contracts/catalog.types';
import {
  MOCK_CATEGORIES_BY_SLUG,
  MOCK_ITEM_DETAILS_BY_SLUG,
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

/**
 * `get_item` - one item by slug.
 *
 * Both failure paths here are wire-verified against the real bench: a blank slug is
 * 422 `validation_failed` with field=slug, an unknown slug is 404 `item_not_found`
 * with field=slug. The success payload is source-verified only - see `ItemDetailDto`.
 */
const getItem: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  const slug = ctx.params.get('slug');
  if (slug === null || slug === '') {
    return mockYobError('validation_failed', 'Item slug is required.', {
      field: 'slug',
      status: 422,
    });
  }

  const detail = MOCK_ITEM_DETAILS_BY_SLUG[slug];
  if (detail === undefined) {
    return mockYobError('item_not_found', 'Item not found.', { field: 'slug', status: 404 });
  }

  // No meta on this endpoint, matching the source.
  return mockSuccess(detail, { notice: 'Item loaded' });
};

/** All endpoints are login-protected; without a session Frappe refuses before YOB runs. */
function requireSession(ctx: MockContext): MockReply | null {
  return ctx.session.isAuthenticated() ? null : mockPermissionError(ctx.rpcMethod);
}

/**
 * `get_items` - one bounded page of a leaf category's items.
 *
 * Models the real endpoint closely enough that the frontend cannot pass here and fail
 * there: the same validation order, the same stable error codes, an opaque cursor, and
 * the same rule that `has_more` - not the row count - decides exhaustion.
 *
 * ## The cursor
 *
 * A base64 of `{slug, sort, offset}`. Opaque to the caller by construction, and bound to
 * the query that produced it: presenting one from a different slug or sort answers
 * `cursor_invalid`, exactly as the backend's binding does. That is what stops a stale
 * cursor being reused across a sort change.
 *
 * ## The empty-continuation scenario
 *
 * `catalog-empty-page` makes the first page return **no items with `has_more: true`**,
 * which is what the real scanner does when it exhausts its per-request scan budget
 * before filling a page. It is a mock scenario because it is otherwise unreproducible,
 * and it is the single case a frontend most easily gets wrong - treating it as the end
 * of the catalogue.
 */
const SORTS = new Set(['name_asc', 'name_desc', 'newest']);

interface MockCursor {
  readonly slug: string;
  readonly sort: string;
  readonly offset: number;
}

function encodeCursor(cursor: MockCursor): string {
  return btoa(JSON.stringify(cursor));
}

function decodeCursor(raw: string): MockCursor | null {
  try {
    const parsed: unknown = JSON.parse(atob(raw));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as MockCursor).slug === 'string' &&
      typeof (parsed as MockCursor).sort === 'string' &&
      typeof (parsed as MockCursor).offset === 'number'
    ) {
      return parsed as MockCursor;
    }
    return null;
  } catch {
    return null;
  }
}

/** Deterministic ordering, so a page boundary falls in the same place every run. */
function sortItems(items: readonly CatalogItemDto[], sort: string): readonly CatalogItemDto[] {
  const rows = [...items];
  switch (sort) {
    case 'name_desc':
      return rows.sort((a, b) => b.item_name.localeCompare(a.item_name));
    case 'newest':
      // No creation timestamp in the fixture, so "newest" is the reverse of insertion
      // order - stable and distinguishable from both name sorts, which is what a test
      // needs to tell them apart.
      return rows.reverse();
    default:
      return rows.sort((a, b) => a.item_name.localeCompare(b.item_name));
  }
}

const getItems: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  const scopeType = ctx.params.get('scope_type') ?? 'category';
  if (scopeType !== 'category') {
    return mockYobError('unsupported_scope', 'That scope is not supported yet.', {
      field: 'scope_type',
      status: 422,
    });
  }

  const filters = ctx.params.get('filters');
  if (filters !== null && filters !== '' && filters !== '[]') {
    return mockYobError('unsupported_filters', 'Filters are not supported yet.', {
      field: 'filters',
      status: 422,
    });
  }

  const sort = ctx.params.get('sort') ?? 'name_asc';
  if (!SORTS.has(sort)) {
    return mockYobError('unsupported_sort', 'That sort is not supported.', {
      field: 'sort',
      status: 422,
    });
  }

  const pageSize = Number(ctx.params.get('page_size') ?? '24');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 48) {
    return mockYobError('page_size_invalid', 'Page size is out of range.', {
      field: 'page_size',
      status: 422,
    });
  }

  const slug = ctx.params.get('scope_value');
  if (slug === null || slug === '') {
    return mockYobError('validation_failed', 'Category slug is required.', {
      field: 'scope_value',
      status: 422,
    });
  }

  const payload = MOCK_CATEGORIES_BY_SLUG[slug];
  if (payload === undefined) {
    return mockYobError('category_not_found', 'Category not found.', {
      field: 'scope_value',
      status: 404,
    });
  }
  if (payload.category.is_group === 1) {
    return mockYobError('category_not_listable', 'That category does not list items.', {
      field: 'scope_value',
      status: 422,
    });
  }

  let offset = 0;
  const rawCursor = ctx.params.get('cursor');
  if (rawCursor !== null && rawCursor !== '') {
    const cursor = decodeCursor(rawCursor);
    // Bound to the query that issued it, so a cursor cannot survive a sort or category
    // change - the same protection the real backend's cursor binding provides.
    if (cursor === null || cursor.slug !== slug || cursor.sort !== sort) {
      return mockYobError('cursor_invalid', 'That cursor is no longer valid.', {
        field: 'cursor',
        status: 422,
      });
    }
    offset = cursor.offset;
  }

  const all = sortItems(payload.items, sort);

  // A page that returns nothing while more remains: the scan-budget continuation.
  if (ctx.scenario === 'catalog-empty-page' && offset === 0 && all.length > 0) {
    return mockSuccess(
      {
        items: [],
        pagination: {
          returned_count: 0,
          page_size: pageSize,
          has_more: true,
          next_cursor: encodeCursor({ slug, sort, offset: 0 }),
        },
        query: { scope_type: 'category', scope_value: slug, search: '', sort },
      },
      { notice: 'Items loaded' },
    );
  }

  const rows = all.slice(offset, offset + pageSize);
  const nextOffset = offset + rows.length;
  const hasMore = nextOffset < all.length;

  return mockSuccess(
    {
      items: rows,
      pagination: {
        returned_count: rows.length,
        page_size: pageSize,
        has_more: hasMore,
        next_cursor: hasMore ? encodeCursor({ slug, sort, offset: nextOffset }) : null,
      },
      query: { scope_type: 'category', scope_value: slug, search: '', sort },
    },
    { notice: 'Items loaded' },
  );
};

export const CATALOG_HANDLERS: Readonly<Record<string, MockHandler>> = {
  'yob_storefront.api.catalog.get_categories': getCategories,
  'yob_storefront.api.catalog.get_category': getCategory,
  'yob_storefront.api.catalog.get_items': getItems,
  'yob_storefront.api.catalog.get_item': getItem,
};
