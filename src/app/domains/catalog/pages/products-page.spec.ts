import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  type TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { YOB_API_CONFIG, type YobApiConfig } from '../../../foundation/network/yob-api.config';
import { ProductsPage } from './products-page';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

/**
 * `/products` quick browse (Phase 28B).
 *
 * Driven directly against the testing backend, so every request - and every request that
 * should **not** exist - is observable. The rules under test are all about what reaches
 * the wire: which scope, which search, which cursor, and when nothing is sent at all.
 */
describe('ProductsPage', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ProductsPage>;

  const CATEGORIES = {
    message: {
      data: {
        categories: [
          // Deliberately at three different depths, and `parent_category` on the last one
          // names a group that is NOT in this list - the shape the contract warns about.
          { name: 'CAT-FLOOR', category_name: 'Floor Tiles', slug: 'floor-tiles', parent_category: null, display_order: 1, level: 0 },
          { name: 'CAT-WALL', category_name: 'Wall Tiles', slug: 'wall-tiles', parent_category: null, display_order: 2, level: 0 },
          { name: 'CAT-600', category_name: '600x600', slug: '600x600', parent_category: 'CAT-GROUP-ABSENT', display_order: 3, level: 2 },
        ],
      },
    },
  };

  function page(items: { name: string }[] = [{ name: 'A' }], over: Record<string, unknown> = {}) {
    return {
      message: {
        data: {
          items,
          pagination: { returned_count: items.length, page_size: 24, has_more: false, next_cursor: null, ...over },
          query: {},
        },
      },
    };
  }

  const FILTERS = {
    message: {
      data: {
        filters: [
          { key: 'finish', label: 'Finish', values: [{ key: 'matt', label: 'Matt' }, { key: 'gloss', label: 'Gloss' }] },
        ],
      },
    },
  };

  async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  }

  function el(testId: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
  }

  function all(testId: string): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testId}"]`),
    );
  }

  /** Every `get_items` call so far, as its query parameters. */
  function listingCalls(): TestRequest[] {
    return http.match((r) => r.url.includes('get_items'));
  }

  function paramsOf(request: TestRequest): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const key of request.request.params.keys()) {
      out[key] = request.request.params.get(key);
    }
    return out;
  }

  /** Flush the outstanding listing request and answer it. */
  function flushListing(body: object = page()): Record<string, string | null> {
    const calls = listingCalls();
    expect(calls).toHaveLength(1);
    const params = paramsOf(calls[0]!);
    calls[0]!.flush(body);
    return params;
  }

  function chipFor(slug: string): HTMLButtonElement {
    const found = all('browse-chip').find((node) => node.getAttribute('data-slug') === slug);
    expect(found, `no chip for ${slug}`).toBeDefined();
    return found as HTMLButtonElement;
  }

  async function click(node: HTMLElement): Promise<void> {
    node.click();
    await settle();
  }

  /** Open the page with categories answered and the first listing flushed. */
  async function open(): Promise<Record<string, string | null>> {
    fixture = TestBed.createComponent(ProductsPage);
    fixture.detectChanges();
    http.expectOne((r) => r.url.includes('get_browse_categories')).flush(CATEGORIES);
    await settle();
    const params = flushListing();
    await settle();
    return params;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('initial state', () => {
    it('browses the whole catalogue with no scope and a page size of 24', async () => {
      const params = await open();

      // Absent from the query string entirely - `undefined` here means the key was never
      // sent. Not an empty string, which would be a second spelling of "no category"
      // that the cursor fingerprint treats as a different query.
      expect(params['scope_value']).toBeUndefined();
      expect(params['page_size']).toBe('24');
      expect(params['sort']).toBe('name_asc');
      expect(params['search']).toBe('');
      expect(params['storefront_filters']).toBeUndefined();
      expect(params['cursor']).toBeUndefined();
    });

    it('starts with All active', async () => {
      await open();

      expect(chipFor('__all__').getAttribute('aria-pressed')).toBe('true');
      expect(all('browse-chip').filter((n) => n.getAttribute('data-active') === 'true')).toHaveLength(1);
    });

    it('shows no category filters, and asks for none', async () => {
      await open();

      expect(el('products-filters')).toBeNull();
      // The absence of the request is the assertion: `afterEach` verifies nothing else
      // is outstanding, and a facet call catalogue-wide would answer
      // `storefront_filter_context_required`.
      http.expectNone((r) => r.url.includes('get_category_filters'));
    });

    it('renders the existing item card rather than a browse-specific one', async () => {
      await open();

      expect(el('item-grid')).not.toBeNull();
      expect(el('item-card')).not.toBeNull();
    });
  });

  describe('category chips', () => {
    it('synthesises All client-side and renders the backend rows after it', async () => {
      await open();

      const slugs = all('browse-chip').map((n) => n.getAttribute('data-slug'));
      expect(slugs).toEqual(['__all__', 'floor-tiles', 'wall-tiles', '600x600']);
    });

    it('renders categories at any depth without reordering or nesting them', async () => {
      await open();

      const levels = all('browse-chip')
        .filter((n) => n.getAttribute('data-slug') !== '__all__')
        .map((n) => n.getAttribute('data-level'));

      // Order is the backend's, and a level-2 row whose parent is absent renders exactly
      // like a root one.
      expect(levels).toEqual(['0', '0', '2']);
    });

    it('scopes the listing to the chosen category', async () => {
      await open();

      await click(chipFor('600x600'));
      http.expectOne((r) => r.url.includes('get_category_filters')).flush(FILTERS);
      await settle();

      const params = flushListing();
      expect(params['scope_value']).toBe('600x600');
      expect(params['page_size']).toBe('24');
    });

    it('keeps exactly one chip active', async () => {
      await open();

      await click(chipFor('floor-tiles'));
      http.expectOne((r) => r.url.includes('get_category_filters')).flush(FILTERS);
      await settle();
      flushListing();
      await settle();

      expect(chipFor('floor-tiles').getAttribute('aria-pressed')).toBe('true');
      expect(chipFor('__all__').getAttribute('aria-pressed')).toBe('false');
      expect(all('browse-chip').filter((n) => n.getAttribute('data-active') === 'true')).toHaveLength(1);
    });

    it('returning to All drops the scope and hides the filters', async () => {
      await open();

      await click(chipFor('floor-tiles'));
      http.expectOne((r) => r.url.includes('get_category_filters')).flush(FILTERS);
      await settle();
      flushListing();
      await settle();
      expect(el('products-filters')).not.toBeNull();

      await click(chipFor('__all__'));
      const params = flushListing();
      await settle();

      expect(params['scope_value']).toBeUndefined();
      expect(params['storefront_filters']).toBeUndefined();
      expect(el('products-filters')).toBeNull();
      // No facet request is made for the catalogue-wide scope.
      http.expectNone((r) => r.url.includes('get_category_filters'));
    });

    it('keeps the submitted search and the sort when the category changes', async () => {
      await open();

      // Submit a search and choose a sort first.
      (el('browse-search-input') as HTMLInputElement).value = 'bolt';
      (el('browse-search-input') as HTMLInputElement).dispatchEvent(new Event('input'));
      (el('browse-search') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();
      flushListing();
      await settle();

      const select = el('products-sort') as HTMLSelectElement;
      select.value = 'newest';
      select.dispatchEvent(new Event('change'));
      await settle();
      flushListing();
      await settle();

      await click(chipFor('wall-tiles'));
      http.expectOne((r) => r.url.includes('get_category_filters')).flush(FILTERS);
      await settle();

      const params = flushListing();
      expect(params['scope_value']).toBe('wall-tiles');
      expect(params['search']).toBe('bolt');
      expect(params['sort']).toBe('newest');
    });
  });

  describe('search', () => {
    async function type(value: string): Promise<void> {
      const input = el('browse-search-input') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    }

    async function submit(): Promise<void> {
      (el('browse-search') as HTMLFormElement).dispatchEvent(
        new Event('submit', { cancelable: true }),
      );
      await settle();
    }

    it('issues no request at all while typing', async () => {
      await open();

      await type('b');
      await type('bo');
      await type('bol');
      await type('bolt');

      // Not a listing call, and - unlike the header - not a suggestion call either.
      expect(listingCalls()).toHaveLength(0);
      http.expectNone((r) => r.url.includes('get_product_suggestions'));
    });

    it('submitting sends the search to get_items', async () => {
      await open();

      await type('bolt');
      await submit();

      expect(flushListing()['search']).toBe('bolt');
    });

    it('Enter submits, because the control is a real form', async () => {
      await open();
      await type('washer');

      // `requestSubmit` is what Enter in a text input triggers.
      (el('browse-search') as HTMLFormElement).requestSubmit();
      await settle();

      expect(flushListing()['search']).toBe('washer');
    });

    it('trims the submitted text', async () => {
      await open();

      await type('  bolt  ');
      await submit();

      expect(flushListing()['search']).toBe('bolt');
    });

    it('submitting an empty box clears the active search', async () => {
      await open();

      await type('bolt');
      await submit();
      flushListing();
      await settle();

      await type('   ');
      await submit();

      expect(flushListing()['search']).toBe('');
    });

    it('composes with a category', async () => {
      await open();

      await click(chipFor('floor-tiles'));
      http.expectOne((r) => r.url.includes('get_category_filters')).flush(FILTERS);
      await settle();
      flushListing();
      await settle();

      await type('bolt');
      await submit();

      const params = flushListing();
      expect(params['scope_value']).toBe('floor-tiles');
      expect(params['search']).toBe('bolt');
    });

    it('composes with a category and its filters', async () => {
      await open();

      await click(chipFor('floor-tiles'));
      http.expectOne((r) => r.url.includes('get_category_filters')).flush(FILTERS);
      await settle();
      flushListing();
      await settle();

      (all('filter-value')[0] as HTMLElement).click();
      await settle();
      flushListing();
      await settle();

      await type('bolt');
      await submit();

      const params = flushListing();
      expect(params['scope_value']).toBe('floor-tiles');
      expect(params['search']).toBe('bolt');
      expect(params['storefront_filters']).toContain('finish');
    });
  });

  describe('filters', () => {
    async function selectFloorTiles(): Promise<void> {
      await click(chipFor('floor-tiles'));
      http.expectOne((r) => r.url.includes('get_category_filters')).flush(FILTERS);
      await settle();
      flushListing();
      await settle();
    }

    it('loads the chosen category projection and shows the existing filter UI', async () => {
      await open();
      await selectFloorTiles();

      expect(el('products-filters')).not.toBeNull();
      expect(el('category-filters')).not.toBeNull();
    });

    it('sends a selection in the existing storefront_filters shape', async () => {
      await open();
      await selectFloorTiles();

      (all('filter-value')[0] as HTMLElement).click();
      await settle();

      expect(flushListing()['storefront_filters']).toBe('{"finish":["matt"]}');
    });

    it('clears the previous category selection when the category changes', async () => {
      await open();
      await selectFloorTiles();

      (all('filter-value')[0] as HTMLElement).click();
      await settle();
      flushListing();
      await settle();

      await click(chipFor('wall-tiles'));
      http.expectOne((r) => r.url.includes('get_category_filters')).flush(FILTERS);
      await settle();

      // No stale key survives into the new category's request.
      expect(flushListing()['storefront_filters']).toBeUndefined();
    });

    it('a rapid second switch cancels the first projection outright', async () => {
      await open();

      await click(chipFor('floor-tiles'));
      const firstFacets = http.expectOne((r) => r.url.includes('get_category_filters'));

      // Switch again before the first projection answers.
      await click(chipFor('wall-tiles'));

      // Stronger than "a late response is discarded": the superseded request is
      // CANCELLED, so Floor Tiles' facets can never arrive to be rendered under Wall
      // Tiles at all. `rxResource` unsubscribes when its key changes.
      expect(firstFacets.cancelled).toBe(true);

      const secondFacets = http.match((r) => r.url.includes('get_category_filters'));
      expect(secondFacets).toHaveLength(1);
      secondFacets[0]!.flush(FILTERS);
      await settle();

      const labels = all('filter-group').map((n) => n.getAttribute('data-filter'));
      expect(labels).not.toContain('stale');
      expect(labels).toContain('finish');

      const params = flushListing();
      await settle();

      // And the listing that ran is the second category's, with no stale selection.
      expect(params['scope_value']).toBe('wall-tiles');
      expect(params['storefront_filters']).toBeUndefined();
      expect(chipFor('wall-tiles').getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('pagination', () => {
    it('reuses the cursor for an unchanged query', async () => {
      fixture = TestBed.createComponent(ProductsPage);
      fixture.detectChanges();
      http.expectOne((r) => r.url.includes('get_browse_categories')).flush(CATEGORIES);
      await settle();
      flushListing(page([{ name: 'A' }], { has_more: true, next_cursor: 'CUR-1' }));
      await settle();

      (el('load-more') as HTMLButtonElement).click();
      await settle();

      const params = flushListing(page([{ name: 'B' }]));
      expect(params['cursor']).toBe('CUR-1');
      expect(params['page_size']).toBe('24');
      await settle();

      expect(all('item-card')).toHaveLength(2);
    });

    it('discards the cursor when the category changes', async () => {
      fixture = TestBed.createComponent(ProductsPage);
      fixture.detectChanges();
      http.expectOne((r) => r.url.includes('get_browse_categories')).flush(CATEGORIES);
      await settle();
      flushListing(page([{ name: 'A' }], { has_more: true, next_cursor: 'CUR-1' }));
      await settle();

      await click(chipFor('floor-tiles'));
      http.expectOne((r) => r.url.includes('get_category_filters')).flush(FILTERS);
      await settle();

      expect(flushListing()['cursor']).toBeUndefined();
    });

    it('discards the cursor when the search changes', async () => {
      fixture = TestBed.createComponent(ProductsPage);
      fixture.detectChanges();
      http.expectOne((r) => r.url.includes('get_browse_categories')).flush(CATEGORIES);
      await settle();
      flushListing(page([{ name: 'A' }], { has_more: true, next_cursor: 'CUR-1' }));
      await settle();

      const input = el('browse-search-input') as HTMLInputElement;
      input.value = 'bolt';
      input.dispatchEvent(new Event('input'));
      await settle();
      (el('browse-search') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();

      expect(flushListing()['cursor']).toBeUndefined();
    });

    it('discards the cursor when the sort changes', async () => {
      fixture = TestBed.createComponent(ProductsPage);
      fixture.detectChanges();
      http.expectOne((r) => r.url.includes('get_browse_categories')).flush(CATEGORIES);
      await settle();
      flushListing(page([{ name: 'A' }], { has_more: true, next_cursor: 'CUR-1' }));
      await settle();

      const select = el('products-sort') as HTMLSelectElement;
      select.value = 'newest';
      select.dispatchEvent(new Event('change'));
      await settle();

      const params = flushListing();
      expect(params['cursor']).toBeUndefined();
      expect(params['sort']).toBe('newest');
    });

    it('discards the cursor when a filter changes', async () => {
      await open();
      await click(chipFor('floor-tiles'));
      http.expectOne((r) => r.url.includes('get_category_filters')).flush(FILTERS);
      await settle();
      flushListing(page([{ name: 'A' }], { has_more: true, next_cursor: 'CUR-1' }));
      await settle();

      (all('filter-value')[0] as HTMLElement).click();
      await settle();

      expect(flushListing()['cursor']).toBeUndefined();
    });
  });

  describe('failures', () => {
    it('still browses the catalogue when the chip request fails', async () => {
      fixture = TestBed.createComponent(ProductsPage);
      fixture.detectChanges();
      http.expectOne((r) => r.url.includes('get_browse_categories')).flush(
        { message: { errors: [{ code: 'boom' }] } },
        { status: 500, statusText: 'Server Error' },
      );
      await settle();

      expect(el('browse-categories-error')).not.toBeNull();
      // All is still there, and the listing still ran.
      expect(chipFor('__all__')).toBeDefined();
      expect(flushListing()['scope_value']).toBeUndefined();
    });

    it('treats zero results as empty rather than as an error', async () => {
      fixture = TestBed.createComponent(ProductsPage);
      fixture.detectChanges();
      http.expectOne((r) => r.url.includes('get_browse_categories')).flush(CATEGORIES);
      await settle();
      flushListing(page([]));
      await settle();

      expect(el('products-empty')).not.toBeNull();
      expect(el('products-error')).toBeNull();
    });

    it('lists the products even when the facet projection fails', async () => {
      await open();

      await click(chipFor('floor-tiles'));
      http.expectOne((r) => r.url.includes('get_category_filters')).flush(
        { message: { errors: [{ code: 'boom' }] } },
        { status: 500, statusText: 'Server Error' },
      );
      await settle();

      const params = flushListing();
      expect(params['scope_value']).toBe('floor-tiles');
      expect(params['storefront_filters']).toBeUndefined();
      await settle();
      expect(el('products-filters')).toBeNull();
    });
  });
});
