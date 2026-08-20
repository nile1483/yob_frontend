import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  type TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { YOB_API_CONFIG, type YobApiConfig } from '../../../foundation/network/yob-api.config';
import type { CatalogItemDto, ItemListingDto } from '../contracts/catalog.types';
import { CatalogApi } from '../data/catalog.api';
import { ItemListing } from './item-listing';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const GET_ITEMS = '/api/method/yob_storefront.api.catalog.get_items';

function item(name: string): CatalogItemDto {
  return {
    name,
    item_name: name,
    slug: name.toLowerCase(),
    uom: 'Nos',
    conversion_factor: 1,
    stock_uom: 'Nos',
    has_variants: 0,
    price_state: 'priced',
    image: null,
    base_price: 10,
    rate: 10,
    discount_percentage: 0,
    discount_amount: 0,
    net_amount: 10,
    tax_amount: 0,
    total_amount: 10,
    pricing_rule_label: null,
  };
}

function page(
  items: readonly CatalogItemDto[],
  hasMore: boolean,
  nextCursor: string | null,
): ItemListingDto {
  return {
    items,
    pagination: {
      returned_count: items.length,
      page_size: 24,
      has_more: hasMore,
      next_cursor: nextCursor,
    },
    query: { scope_type: 'category', scope_value: 'shirts', search: '', sort: 'name_asc' },
  };
}

describe('ItemListing', () => {
  let http: HttpTestingController;
  let listing: ItemListing;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    listing = new ItemListing(TestBed.inject(CatalogApi));
  });

  /**
   * The one request still awaiting an answer.
   *
   * Cancelled requests stay in the testing backend's queue, and `load()` cancels the one
   * it supersedes - so a plain `expectOne` would find two and fail. Only live requests
   * can be answered.
   */
  function open(): TestRequest {
    const live = http.match((r) => r.url === GET_ITEMS).filter((r) => !r.cancelled);
    expect(live).toHaveLength(1);
    return live[0];
  }

  /** Answer the single outstanding request. */
  function respond(body: ItemListingDto): void {
    open().flush({ message: { data: body } });
  }

  function fail(status = 500): void {
    open().flush({ message: { errors: [{ code: 'internal_server_error', detail: 'x' }] } }, {
      status,
      statusText: 'Error',
    });
  }

  /**
   * Parameters of the outstanding request.
   *
   * Consumes it, like every query on the testing backend does - a test that also needs
   * to answer that request should hold the `TestRequest` from {@link open} instead.
   */
  function lastParams(): URLSearchParams {
    return new URLSearchParams(open().request.params.toString());
  }

  describe('the request it builds', () => {
    it('asks the listing endpoint with the category scope and controlled defaults', () => {
      listing.load('shirts', 'name_asc');
      const params = lastParams();

      expect(params.get('scope_type')).toBe('category');
      expect(params.get('scope_value')).toBe('shirts');
      expect(params.get('search')).toBe('');
      expect(params.get('filters')).toBe('[]');
      expect(params.get('sort')).toBe('name_asc');
      expect(params.get('page_size')).toBe('24');
      expect(params.get('qty')).toBe('1');
    });

    it('sends no cursor for a first page', () => {
      listing.load('shirts', 'name_asc');
      // `null` params are dropped, so a first page carries no cursor at all rather than
      // the string "null", which the backend would reject as cursor_invalid.
      expect(lastParams().has('cursor')).toBe(false);
    });

    it('sends the stored cursor for a continuation', () => {
      listing.load('shirts', 'name_asc');
      respond(page([item('A')], true, 'CUR-1'));

      listing.loadMore();
      expect(lastParams().get('cursor')).toBe('CUR-1');
    });

    it('sends the chosen sort', () => {
      listing.load('shirts', 'name_desc');
      const descending = open();
      expect(descending.request.params.get('sort')).toBe('name_desc');
      descending.flush({ message: { data: page([], false, null) } });

      listing.load('shirts', 'newest');
      expect(lastParams().get('sort')).toBe('newest');
    });
  });

  describe('the first page', () => {
    it('replaces whatever was there and stores the backend pagination', () => {
      listing.load('shirts', 'name_asc');
      respond(page([item('A'), item('B')], true, 'CUR-1'));

      expect(listing.items().map((i) => i.name)).toEqual(['A', 'B']);
      expect(listing.cursor()).toBe('CUR-1');
      expect(listing.hasMore()).toBe(true);
      expect(listing.initialLoading()).toBe(false);
      expect(listing.isEmpty()).toBe(false);
    });

    it('reports true exhaustion as empty', () => {
      listing.load('shirts', 'name_asc');
      respond(page([], false, null));

      expect(listing.isEmpty()).toBe(true);
      expect(listing.hasMore()).toBe(false);
    });

    it('is not empty merely because nothing has loaded yet', () => {
      listing.load('shirts', 'name_asc');
      expect(listing.isEmpty()).toBe(false);
      expect(listing.initialLoading()).toBe(true);
    });

    it('surfaces a first-page failure as a page-level error', () => {
      listing.load('shirts', 'name_asc');
      fail();

      expect(listing.initialError()).toBe(true);
      expect(listing.loadMoreError()).toBe(false);
      expect(listing.items()).toEqual([]);
    });
  });

  describe('load more', () => {
    beforeEach(() => {
      listing.load('shirts', 'name_asc');
      respond(page([item('A'), item('B')], true, 'CUR-1'));
    });

    it('appends without disturbing what is already shown', () => {
      listing.loadMore();
      respond(page([item('C')], true, 'CUR-2'));

      expect(listing.items().map((i) => i.name)).toEqual(['A', 'B', 'C']);
      expect(listing.cursor()).toBe('CUR-2');
    });

    it('ignores an item it already has, without reordering', () => {
      listing.loadMore();
      // The cursor contract forbids overlap; this is belt and braces.
      respond(page([item('B'), item('C')], false, null));

      expect(listing.items().map((i) => i.name)).toEqual(['A', 'B', 'C']);
    });

    it('refuses a second request while one is in flight', () => {
      listing.loadMore();
      listing.loadMore();
      listing.loadMore();

      // One outstanding request, so a double click cannot append a page twice.
      expect(http.match((r) => r.url === GET_ITEMS).filter((r) => !r.cancelled)).toHaveLength(1);
      expect(listing.loadingMore()).toBe(true);
    });

    it('does nothing when there is nothing more to load', () => {
      listing.loadMore();
      respond(page([item('C')], false, null));

      expect(listing.hasMore()).toBe(false);
      listing.loadMore();
      expect(http.match((r) => r.url === GET_ITEMS).filter((r) => !r.cancelled)).toHaveLength(0);
    });

    it('keeps every loaded product when it fails, and does not advance the cursor', () => {
      listing.loadMore();
      fail();

      // Replacing a screen of products with an error because page two failed would be
      // worse than the failure.
      expect(listing.items().map((i) => i.name)).toEqual(['A', 'B']);
      expect(listing.loadMoreError()).toBe(true);
      expect(listing.initialError()).toBe(false);
      expect(listing.cursor()).toBe('CUR-1');
      expect(listing.hasMore()).toBe(true);
    });

    it('retries the same cursor and clears the error on success', () => {
      listing.loadMore();
      fail();

      listing.loadMore();
      const retry = open();
      // The failure never advanced the cursor, so the retry is the identical request.
      expect(retry.request.params.get('cursor')).toBe('CUR-1');
      retry.flush({ message: { data: page([item('C')], false, null) } });

      expect(listing.loadMoreError()).toBe(false);
      expect(listing.items().map((i) => i.name)).toEqual(['A', 'B', 'C']);
    });
  });

  /**
   * The release-critical case.
   *
   * The backend scanner has a per-request scan budget, so an empty page with
   * `has_more: true` means *this request ran out of budget*, not *the catalogue is
   * exhausted*.
   */
  describe('an empty continuation page', () => {
    it('is not treated as the end of the catalogue', () => {
      listing.load('shirts', 'name_asc');
      respond(page([item('A')], true, 'CUR-1'));

      listing.loadMore();
      respond(page([], true, 'XYZ'));

      expect(listing.items().map((i) => i.name)).toEqual(['A']);
      expect(listing.hasMore()).toBe(true);
      expect(listing.cursor()).toBe('XYZ');
      expect(listing.isEmpty()).toBe(false);
      expect(listing.loadMoreError()).toBe(false);
    });

    it('leaves Load More usable, and does not chase continuations by itself', () => {
      listing.load('shirts', 'name_asc');
      respond(page([], true, 'XYZ'));

      // An empty *first* page with more to come is still not an empty catalogue.
      expect(listing.isEmpty()).toBe(false);
      expect(listing.hasMore()).toBe(true);
      expect(listing.cursor()).toBe('XYZ');

      // Nothing was fired automatically: one click, one request.
      expect(http.match((r) => r.url === GET_ITEMS).filter((r) => !r.cancelled)).toHaveLength(0);

      listing.loadMore();
      expect(lastParams().get('cursor')).toBe('XYZ');
    });
  });

  describe('starting over', () => {
    it('drops everything and never reuses the old cursor', () => {
      listing.load('shirts', 'name_asc');
      respond(page([item('A')], true, 'CUR-1'));

      listing.load('shirts', 'name_desc');

      expect(listing.items()).toEqual([]);
      expect(listing.cursor()).toBeNull();
      expect(listing.hasMore()).toBe(false);
      // A cursor is bound to the query that produced it; the backend would reject it.
      expect(lastParams().has('cursor')).toBe(false);
    });

    it('clears a previous load-more error', () => {
      listing.load('shirts', 'name_asc');
      respond(page([item('A')], true, 'CUR-1'));
      listing.loadMore();
      fail();
      expect(listing.loadMoreError()).toBe(true);

      listing.load('shirts', 'newest');
      expect(listing.loadMoreError()).toBe(false);
    });

    it('cancels the request it replaced, so it cannot arrive at all', () => {
      listing.load('shirts', 'name_asc');
      const stale = http.match((r) => r.url === GET_ITEMS)[0];

      listing.load('shoes', 'name_asc');

      // Cancelled at the transport, which is stronger than ignoring a late response:
      // the previous category's request is aborted rather than raced.
      expect(stale.cancelled).toBe(true);

      const current = http.match((r) => r.url === GET_ITEMS).filter((r) => !r.cancelled);
      expect(current).toHaveLength(1);
      current[0].flush({ message: { data: page([item('SHOE')], false, null) } });

      expect(listing.items().map((i) => i.name)).toEqual(['SHOE']);
      expect(listing.hasMore()).toBe(false);
      expect(listing.cursor()).toBeNull();
    });

    it('cancels every superseded request through a burst of sort changes', () => {
      listing.load('shirts', 'name_asc');
      listing.load('shirts', 'name_desc');
      listing.load('shirts', 'newest');

      const all = http.match((r) => r.url === GET_ITEMS);
      expect(all.filter((r) => r.cancelled)).toHaveLength(2);

      const live = all.filter((r) => !r.cancelled);
      expect(live).toHaveLength(1);
      expect(live[0].request.params.get('sort')).toBe('newest');

      live[0].flush({ message: { data: page([item('NEWEST')], false, null) } });
      expect(listing.items().map((i) => i.name)).toEqual(['NEWEST']);
    });
  });

  it('cancels an in-flight request when the page goes away', () => {
    listing.load('shirts', 'name_asc');
    const request = http.match((r) => r.url === GET_ITEMS)[0];

    listing.destroy();

    expect(request.cancelled).toBe(true);
    expect(listing.items()).toEqual([]);
  });
});
