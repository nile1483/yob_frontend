import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { YobApiError } from '../../../foundation/network/yob-api-error';
import { isItemFamily, type ItemPayloadDto } from '../contracts/catalog.types';
import { YOB_API_CONFIG, type YobApiConfig } from '../../../foundation/network/yob-api.config';
import { CatalogApi } from './catalog.api';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const CATEGORIES_URL = '/api/method/yob_storefront.api.catalog.get_categories';
const CATEGORY_URL = '/api/method/yob_storefront.api.catalog.get_category';
const ITEM_URL = '/api/method/yob_storefront.api.catalog.get_item';

describe('CatalogApi', () => {
  let api: CatalogApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    api = TestBed.inject(CatalogApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('getCategories', () => {
    it('calls the documented RPC method', () => {
      api.getCategories().subscribe();

      const req = http.expectOne((r) => r.url === CATEGORIES_URL);
      expect(req.request.method).toBe('GET');
      req.flush({ message: { data: [] } });
    });

    it('omits parent_slug for the top level', () => {
      api.getCategories().subscribe();

      const req = http.expectOne((r) => r.url === CATEGORIES_URL);
      // The client drops null params, so no empty parent_slug reaches the backend.
      expect(req.request.params.has('parent_slug')).toBe(false);
      req.flush({ message: { data: [] } });
    });

    it('sends parent_slug when asking for children', () => {
      api.getCategories('industrial-supplies').subscribe();

      const req = http.expectOne((r) => r.url === CATEGORIES_URL);
      expect(req.request.params.get('parent_slug')).toBe('industrial-supplies');
      req.flush({ message: { data: [] } });
    });

    it('returns the unwrapped list, without the Frappe envelope', () => {
      let result: readonly unknown[] | undefined;
      api.getCategories().subscribe((categories) => (result = categories));

      http
        .expectOne((r) => r.url === CATEGORIES_URL)
        .flush({
          message: {
            data: [
              {
                name: 'Fasteners',
                category_name: 'Fasteners',
                slug: 'fasteners',
                thumbnail: null,
                banner: null,
                display_order: 1,
                meta_title: null,
                meta_description: null,
                parent_category: null,
              },
            ],
            notice: 'Categories loaded',
            meta: { count: 1 },
          },
        });

      expect(result).toHaveLength(1);
      expect(result?.[0]).toMatchObject({ slug: 'fasteners', category_name: 'Fasteners' });
      // Nothing transport-shaped survives into the domain.
      expect(JSON.stringify(result)).not.toContain('message');
    });

    it('treats an empty list as an ordinary result, not an error', () => {
      // This is what the real bench returns today.
      let result: readonly unknown[] | undefined;
      let errored = false;
      api.getCategories().subscribe({
        next: (categories) => (result = categories),
        error: () => (errored = true),
      });

      http
        .expectOne((r) => r.url === CATEGORIES_URL)
        .flush({ message: { data: [], notice: 'Categories loaded', meta: { count: 0 } } });

      expect(result).toEqual([]);
      expect(errored).toBe(false);
    });

    it('surfaces a failure as a normalized YobApiError', () => {
      let error: YobApiError | undefined;
      api.getCategories().subscribe({ error: (e: YobApiError) => (error = e) });

      http
        .expectOne((r) => r.url === CATEGORIES_URL)
        .flush(
          { message: { errors: [{ code: 'internal_server_error', detail: 'boom' }] } },
          { status: 500, statusText: 'Internal Server Error' },
        );

      expect(error).toBeInstanceOf(YobApiError);
      expect(error?.code).toBe('internal_server_error');
    });
  });

  describe('getCategory', () => {
    it('sends the slug and calls the documented method', () => {
      api.getCategory('fasteners').subscribe();

      const req = http.expectOne((r) => r.url === CATEGORY_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('slug')).toBe('fasteners');
      req.flush({ message: { data: { category: {}, subcategories: [], items: [] } } });
    });

    it('does not send a quantity, leaving the backend default', () => {
      api.getCategory('fasteners').subscribe();

      const req = http.expectOne((r) => r.url === CATEGORY_URL);
      // Item prices are quantity-sensitive; a listing must show unit pricing.
      expect(req.request.params.has('qty')).toBe(false);
      req.flush({ message: { data: { category: {}, subcategories: [], items: [] } } });
    });

    it('returns the payload alongside the meta counts', () => {
      let result: { payload: unknown; meta: unknown } | undefined;
      api.getCategory('fasteners').subscribe((value) => (result = value));

      http
        .expectOne((r) => r.url === CATEGORY_URL)
        .flush({
          message: {
            data: {
              category: { slug: 'fasteners', category_name: 'Fasteners', is_group: 0 },
              subcategories: [],
              items: [{ name: 'YOB-BOLT-M10', rate: 11.25 }],
            },
            notice: 'Category loaded',
            meta: { subcategory_count: 0, item_count: 1 },
          },
        });

      expect(result?.payload).toMatchObject({ category: { slug: 'fasteners' } });
      expect(result?.meta).toEqual({ subcategory_count: 0, item_count: 1 });
    });

    it('passes category_not_found through with its stable code', () => {
      let error: YobApiError | undefined;
      api.getCategory('nope').subscribe({ error: (e: YobApiError) => (error = e) });

      http
        .expectOne((r) => r.url === CATEGORY_URL)
        .flush(
          {
            message: {
              errors: [
                { code: 'category_not_found', detail: 'Category not found.', field: 'slug' },
              ],
            },
          },
          { status: 404, statusText: 'Not Found' },
        );

      expect(error?.code).toBe('category_not_found');
      expect(error?.httpStatus).toBe(404);
    });
  });

  describe('getItem', () => {
    it('sends the slug and calls the documented method', () => {
      api.getItem('hex-bolt-m10-50').subscribe();

      const req = http.expectOne((r) => r.url === ITEM_URL);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('slug')).toBe('hex-bolt-m10-50');
      req.flush({ message: { data: {} } });
    });

    it('does not send a quantity, leaving the backend default of 1', () => {
      api.getItem('hex-bolt-m10-50').subscribe();

      const req = http.expectOne((r) => r.url === ITEM_URL);
      // No quantity control exists yet, so sending one would be inventing intent.
      expect(req.request.params.has('qty')).toBe(false);
      req.flush({ message: { data: {} } });
    });

    it('returns the unwrapped item payload', () => {
      // Typed loosely on purpose: this test is about the envelope being unwrapped, not
      // about the payload's shape - which is a union since API 3.3.0.
      let result: ItemPayloadDto | undefined;
      api.getItem('hex-bolt-m10-50').subscribe((item) => (result = item));

      http
        .expectOne((r) => r.url === ITEM_URL)
        .flush({
          message: {
            data: {
              name: 'YOB-BOLT-M10',
              item_name: 'Hex Bolt M10 x 50mm',
              custom_slug: 'hex-bolt-m10-50',
              uom: 'Nos',
              rate: 11.25,
            },
            notice: 'Item loaded',
          },
        });

      // Note the detail-only field names: custom_slug, not slug; uom, not stock_uom.
      expect(result?.custom_slug).toBe('hex-bolt-m10-50');
      expect(result === undefined || isItemFamily(result) ? null : result.uom).toBe('Nos');
      expect(JSON.stringify(result)).not.toContain('message');
    });

    it('passes item_not_found through with its stable code', () => {
      let error: YobApiError | undefined;
      api.getItem('nope').subscribe({ error: (e: YobApiError) => (error = e) });

      http
        .expectOne((r) => r.url === ITEM_URL)
        .flush(
          {
            message: {
              errors: [{ code: 'item_not_found', detail: 'Item not found.', field: 'slug' }],
            },
          },
          { status: 404, statusText: 'Not Found' },
        );

      expect(error?.code).toBe('item_not_found');
      expect(error?.httpStatus).toBe(404);
    });

    it('normalizes the raw Frappe 403 the real bench currently returns for items', () => {
      // The storefront user lacks Item doctype permission, and get_item has no
      // try/except, so the failure escapes as a raw Frappe body rather than a YOB one.
      let error: YobApiError | undefined;
      api.getItem('hex-bolt-m10-50').subscribe({ error: (e: YobApiError) => (error = e) });

      http
        .expectOne((r) => r.url === ITEM_URL)
        .flush(
          {
            exception: 'frappe.exceptions.PermissionError: No permission for Item',
            exc_type: 'PermissionError',
            exc: '["Traceback ..."]',
          },
          { status: 403, statusText: 'Forbidden' },
        );

      expect(error?.kind).toBe('frappe');
      expect(error?.code).not.toBe('item_not_found');
      // Whatever it is, it must not carry the traceback onward.
      expect(JSON.stringify(error)).not.toContain('Traceback');
    });
  });
});
