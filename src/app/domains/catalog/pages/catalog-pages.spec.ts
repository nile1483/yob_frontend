import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { MockServerSession } from '../../../../mock-api/core/mock-server-session';
import { mockApiInterceptor } from '../../../../mock-api/mock-api.interceptor';
import { MockApiScenario } from '../../../../mock-api/scenarios/mock-scenario';
import { routes } from '../../../app.routes';
import { yobCsrfInterceptor } from '../../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../../foundation/network/yob-api.config';
import { SessionStore } from '../../../foundation/session/session.store';
import { YOB_CLIENT_ERROR_CODES, YobApiError } from '../../../foundation/network/yob-api-error';
import { CatalogApi } from '../data/catalog.api';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

/**
 * Both catalog pages, driven through the real route tree against the mock API.
 *
 * Exercises the production chain end to end: route -> page -> rxResource ->
 * CatalogApi -> YobApiClient -> mock handler. `http.verify()` proves nothing reached
 * the network, and no test touches a mock-specific code path inside the pages -
 * there isn't one.
 */
describe('catalog pages', () => {
  let router: Router;
  let session: SessionStore;
  let http: HttpTestingController;
  let mockServer: MockServerSession;
  let scenario: MockApiScenario;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(withInterceptors([yobCsrfInterceptor, mockApiInterceptor])),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    router = TestBed.inject(Router);
    session = TestBed.inject(SessionStore);
    http = TestBed.inject(HttpTestingController);
    mockServer = TestBed.inject(MockServerSession);
    scenario = TestBed.inject(MockApiScenario);

    // Signed in, since the whole catalog branch is behind the session guard.
    mockServer.signIn('TEST_APP', 'password');
    session.restore().subscribe();
  });

  afterEach(() => {
    scenario.reset();
    http.verify();
  });

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
    const root = harness.fixture.nativeElement as HTMLElement;
    return {
      harness,
      root,
      text: () => root.textContent ?? '',
      testId: (id: string) => root.querySelector(`[data-testid="${id}"]`),
      all: (id: string) => root.querySelectorAll(`[data-testid="${id}"]`),
    };
  }

  describe('/catalog', () => {
    it('lists the top-level categories', async () => {
      const view = await open('/catalog');

      expect(router.url).toBe('/catalog');
      expect(view.testId('category-grid')).not.toBeNull();
      expect(view.all('category-card')).toHaveLength(3);
      expect(view.text()).toContain('Industrial Supplies');
    });

    it('renders each category as a link, not a clickable div', async () => {
      const view = await open('/catalog');
      const first = view.testId('category-card') as HTMLAnchorElement;

      expect(first.tagName).toBe('A');
      expect(first.getAttribute('href')).toBe('/catalog/industrial-supplies');
    });

    it('shows an empty state when the account has no categories', async () => {
      // Exactly what the real bench returns today.
      scenario.scenario.set('empty');
      const view = await open('/catalog');

      expect(view.testId('catalog-empty')).not.toBeNull();
      expect(view.testId('category-grid')).toBeNull();
      expect(view.text()).toContain('No categories yet');
    });

    it('shows a safe error message when the request fails', async () => {
      scenario.scenario.set('server-error');
      const view = await open('/catalog');

      expect(view.testId('catalog-error')).not.toBeNull();
      expect(view.text()).toContain('could not load the catalog');
      // No backend wording leaks through.
      expect(view.text()).not.toContain('internal_server_error');
      expect(view.text()).not.toContain('correlation_id');
    });

    it('announces a load failure assertively', async () => {
      scenario.scenario.set('server-error');
      const view = await open('/catalog');

      expect(view.root.querySelector('[role="alert"]')).not.toBeNull();
    });
  });

  describe('/catalog/:categorySlug', () => {
    it('shows the category title and description', async () => {
      const view = await open('/catalog/fasteners');

      expect(view.testId('category-title')?.textContent).toContain('Industrial Fasteners');
      expect(view.testId('category-description')?.textContent).toContain(
        'available to approved B2B buyers',
      );
    });

    it('lists the items with backend pricing', async () => {
      const view = await open('/catalog/fasteners');

      expect(view.testId('item-grid')).not.toBeNull();
      expect(view.all('item-card')).toHaveLength(4);
      expect(view.text()).toContain('Hex Bolt M10 x 50mm');
      expect(view.text()).toContain('11.25');
    });

    it('shows subcategories for a group category', async () => {
      const view = await open('/catalog/industrial-supplies');

      expect(view.testId('subcategory-grid')).not.toBeNull();
      expect(view.all('category-card')).toHaveLength(2);
      // A group category has no items of its own, and that is not an empty state.
      expect(view.testId('item-grid')).toBeNull();
      expect(view.testId('category-no-items')).toBeNull();
    });

    it('shows an empty state for a leaf category with nothing in it', async () => {
      const view = await open('/catalog/abrasives');

      expect(view.testId('category-no-items')).not.toBeNull();
      expect(view.text()).toContain('No items in this category');
    });

    it('shows a not-found state for an unknown slug', async () => {
      const view = await open('/catalog/does-not-exist');

      expect(view.testId('category-not-found')).not.toBeNull();
      expect(view.text()).toContain('Category not found');
      // Distinct from a generic failure.
      expect(view.testId('category-error')).toBeNull();
    });

    it('distinguishes a server failure from a missing category', async () => {
      scenario.scenario.set('server-error');
      const view = await open('/catalog/fasteners');

      expect(view.testId('category-error')).not.toBeNull();
      expect(view.testId('category-not-found')).toBeNull();
      expect(view.text()).not.toContain('internal_server_error');
    });

    it('offers a way back to the catalog', async () => {
      const view = await open('/catalog/fasteners');
      // Scoped to the breadcrumb: the secure shell's brand link also points at
      // /catalog, so an unscoped selector would match that instead.
      const back = view.root.querySelector('nav[aria-label="Breadcrumb"] a[href="/catalog"]');

      expect(back).not.toBeNull();
      expect(back?.textContent).toContain('Back to catalog');
    });

    it('replaces the previous category when the route changes', async () => {
      const view = await open('/catalog/fasteners');
      expect(view.text()).toContain('Hex Bolt M10 x 50mm');

      await view.harness.navigateByUrl('/catalog/abrasives');
      await view.harness.fixture.whenStable();

      const text = (view.harness.fixture.nativeElement as HTMLElement).textContent ?? '';
      // No stale items from the category we just left.
      expect(text).not.toContain('Hex Bolt M10 x 50mm');
      expect(text).toContain('Abrasives');
      expect(text).toContain('No items in this category');
    });

    it('does not show stale content when moving to an unknown category', async () => {
      const view = await open('/catalog/fasteners');
      expect(view.text()).toContain('Hex Bolt M10 x 50mm');

      await view.harness.navigateByUrl('/catalog/nope');
      await view.harness.fixture.whenStable();

      const root = view.harness.fixture.nativeElement as HTMLElement;
      expect(root.querySelector('[data-testid="category-not-found"]')).not.toBeNull();
      expect(root.textContent).not.toContain('Hex Bolt M10 x 50mm');
    });
  });

  describe('guarding', () => {
    it('sends a guest to sign in rather than to the catalog', async () => {
      mockServer.signOut();
      session.restore().subscribe();

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/catalog/fasteners');

      expect(router.url).toBe('/login?returnUrl=%2Fcatalog%2Ffasteners');
    });
  });

  describe('/catalog/item/:itemSlug', () => {
    it('shows the item name, code and unit', async () => {
      const view = await open('/catalog/item/hex-bolt-m10-50');

      expect(view.testId('item-title')?.textContent).toContain('Hex Bolt M10 x 50mm');
      expect(view.text()).toContain('YOB-BOLT-M10');
      expect(view.testId('item-uom')?.textContent).toContain('Nos');
    });

    it('shows the backend pricing, not a recalculation', async () => {
      const view = await open('/catalog/item/hex-bolt-m10-50');

      expect(view.testId('item-rate')?.textContent).toContain('11.25');
      expect(view.testId('item-base-price')?.textContent).toContain('12.50');
      // The backend's discount_percentage, not one derived from 12.50 vs 11.25.
      expect(view.testId('item-discount')?.textContent).toContain('10');
    });

    it('shows no discount decoration for an undiscounted item', async () => {
      const view = await open('/catalog/item/flat-washer-m10');

      expect(view.testId('item-rate')?.textContent).toContain('1.20');
      expect(view.testId('item-base-price')).toBeNull();
      expect(view.testId('item-discount')).toBeNull();
    });

    it('shows the backend tax breakdown when tax applies', async () => {
      const view = await open('/catalog/item/through-bolt-anchor-m12-120');

      expect(view.testId('item-tax-breakdown')).not.toBeNull();
      expect(view.testId('item-tax-label')?.textContent).toContain('GST 18%');
      // All three are the backend's own figures, not net + a computed tax.
      expect(view.testId('item-tax-amount')?.textContent).toContain('77.76');
      expect(view.testId('item-total-amount')?.textContent).toContain('509.76');
    });

    it('omits the tax breakdown when no tax applies', async () => {
      const view = await open('/catalog/item/hex-bolt-m10-50');

      // With no tax it would just repeat the price on three lines.
      expect(view.testId('item-tax-breakdown')).toBeNull();
    });

    it('lists backend-supplied offers when there are any', async () => {
      const view = await open('/catalog/item/hex-bolt-m10-50');

      expect(view.testId('item-offers')).not.toBeNull();
      expect(view.text()).toContain('10% off on 50 or more');
    });

    it('omits the offers section when the backend supplies none', async () => {
      const view = await open('/catalog/item/flat-washer-m10');
      expect(view.testId('item-offers')).toBeNull();
    });

    it('shows a placeholder when the item has no image', async () => {
      const view = await open('/catalog/item/hex-bolt-m10-50');

      expect(view.testId('item-image')).toBeNull();
      expect(view.testId('item-image-placeholder')).not.toBeNull();
    });

    it('shows a not-found state for an unknown slug', async () => {
      const view = await open('/catalog/item/no-such-item');

      expect(view.testId('item-not-found')).not.toBeNull();
      expect(view.text()).toContain('Item not found');
      expect(view.testId('item-error')).toBeNull();
    });

    it('distinguishes a server failure from a missing item', async () => {
      scenario.scenario.set('server-error');
      const view = await open('/catalog/item/hex-bolt-m10-50');

      expect(view.testId('item-error')).not.toBeNull();
      expect(view.testId('item-not-found')).toBeNull();
      expect(view.text()).not.toContain('internal_server_error');
    });

    it('replaces the previous item when the slug changes', async () => {
      const view = await open('/catalog/item/hex-bolt-m10-50');
      expect(view.text()).toContain('Hex Bolt M10 x 50mm');

      await view.harness.navigateByUrl('/catalog/item/flat-washer-m10');
      await view.harness.fixture.whenStable();

      const text = (view.harness.fixture.nativeElement as HTMLElement).textContent ?? '';
      // No stale item from the page we just left.
      expect(text).not.toContain('Hex Bolt M10 x 50mm');
      expect(text).toContain('Flat Washer M10');
    });

    it('does not show a stale item when moving to an unknown slug', async () => {
      const view = await open('/catalog/item/hex-bolt-m10-50');

      await view.harness.navigateByUrl('/catalog/item/nope');
      await view.harness.fixture.whenStable();

      const root = view.harness.fixture.nativeElement as HTMLElement;
      expect(root.querySelector('[data-testid="item-not-found"]')).not.toBeNull();
      expect(root.textContent).not.toContain('Hex Bolt M10 x 50mm');
    });

    it('offers a way back to the catalog', async () => {
      const view = await open('/catalog/item/hex-bolt-m10-50');
      const back = view.root.querySelector('nav[aria-label="Breadcrumb"] a[href="/catalog"]');

      expect(back?.textContent).toContain('Back to catalog');
    });

    it('renders inside the secure shell', async () => {
      const view = await open('/catalog/item/hex-bolt-m10-50');
      expect(view.root.querySelector('[data-testid="secure-shell"]')).not.toBeNull();
    });
  });

  describe('route ordering', () => {
    it('routes /catalog/item/:slug to item detail, not to a category', async () => {
      const view = await open('/catalog/item/hex-bolt-m10-50');

      // If ':categorySlug' were matched first, 'item' would be read as a category.
      expect(view.testId('item-title')).not.toBeNull();
      expect(view.testId('category-title')).toBeNull();
    });

    it('still routes a plain slug to the category page', async () => {
      const view = await open('/catalog/fasteners');

      expect(view.testId('category-title')).not.toBeNull();
      expect(view.testId('item-title')).toBeNull();
    });

    it('sends a guest asking for an item to sign in', async () => {
      mockServer.signOut();
      session.restore().subscribe();

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/catalog/item/hex-bolt-m10-50');

      expect(router.url).toBe('/login?returnUrl=%2Fcatalog%2Fitem%2Fhex-bolt-m10-50');
    });
  });

  /**
   * Phase 9.5 regression.
   *
   * The network layer used to map every raw Frappe 403 `PermissionError` to
   * `client_session_required`. Real backend behaviour disproved that: the bench
   * returns exactly this response to a fully authenticated user who lacks Frappe role
   * permission on the `Item` doctype. Treating it as a session verdict would sign a
   * signed-in user out of a working session because one catalog page was refused.
   *
   * These run without the mock interceptor, so the exact raw Frappe body can be put
   * on the wire - the mock only produces fixture-shaped replies.
   */
  describe('business permission denial does not touch the session', () => {
    /** Exactly what the real bench returns for a category containing items. */
    const RAW_FRAPPE_403 = {
      exception:
        'frappe.exceptions.PermissionError: User storefront@yob.test does not have doctype access via role permission for document Item',
      exc_type: 'PermissionError',
      exc: '["Traceback (most recent call last): ... No permission for Item"]',
      _server_messages: '[{"message":"No permission for Item"}]',
    };

    const AUTHENTICATED_PAYLOAD = {
      authenticated: true,
      authentication_method: 'session',
      user: { name: 'buyer@example.invalid', full_name: 'Buyer', user_image: null, email: 'buyer@example.invalid', mobile_no: null },
      context: { application: 'TEST_APP', profile_doctype: 'Customer', profile_name: 'Mock Trading Co' },
      csrf_token: 'csrf-token',
    };

    let ctx: {
      router: Router;
      session: SessionStore;
      http: HttpTestingController;
    };

    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideRouter(routes, withComponentInputBinding()),
          // No mock interceptor: these tests need to control the raw wire body.
          provideHttpClient(withInterceptors([yobCsrfInterceptor])),
          provideHttpClientTesting(),
          { provide: YOB_API_CONFIG, useValue: CONFIG },
        ],
      });
      ctx = {
        router: TestBed.inject(Router),
        session: TestBed.inject(SessionStore),
        http: TestBed.inject(HttpTestingController),
      };

      // Establish a genuine authenticated session.
      ctx.session.restore().subscribe();
      ctx.http
        .expectOne((r) => r.url.includes('get_session_context'))
        .flush({ message: { data: AUTHENTICATED_PAYLOAD } });
      expect(ctx.session.isAuthenticated()).toBe(true);
    });

    afterEach(() => ctx.http.verify());

    function refuseItem(slug = 'some-real-item'): YobApiError | undefined {
      const api = TestBed.inject(CatalogApi);
      let error: YobApiError | undefined;
      api.getItem(slug).subscribe({ error: (e: YobApiError) => (error = e) });

      ctx.http
        .expectOne((r) => r.url.includes('get_item'))
        .flush(RAW_FRAPPE_403, { status: 403, statusText: 'Forbidden' });

      return error;
    }

    it('normalizes it to permission-denied, never to a session verdict', () => {
      const error = refuseItem();

      expect(error?.code).toBe(YOB_CLIENT_ERROR_CODES.permissionDenied);
      expect(error?.kind).toBe('frappe');
      expect(error?.httpStatus).toBe(403);
      expect(error?.frappeExcType).toBe('PermissionError');
      // The code the network layer must no longer invent from status + exc_type.
      expect(error?.code).not.toBe('client_session_required');
    });

    it('leaves the authenticated session completely untouched', () => {
      refuseItem();

      expect(ctx.session.isAuthenticated()).toBe(true);
      expect(ctx.session.isGuest()).toBe(false);
      expect(ctx.session.status()).toBe('authenticated');
      expect(ctx.session.user()).not.toBeNull();
      expect(ctx.session.restoreError()).toBeNull();
    });

    it('does not redirect the user to sign in', () => {
      refuseItem();
      expect(ctx.router.url).not.toContain('/login');
    });

    it('never lets the backend wording or traceback out of the error', () => {
      const error = refuseItem();

      const serialised = JSON.stringify({
        ...error,
        message: error?.message,
        detail: error?.detail,
      });
      expect(serialised).not.toContain('No permission for Item');
      expect(serialised).not.toContain('Traceback');
      expect(serialised).not.toContain('doctype');
      expect(serialised).not.toContain('_server_messages');
      expect(serialised).not.toContain('storefront@yob.test');

      // And it must not tell a signed-in user to sign in again.
      expect(error?.detail).not.toMatch(/sign in/i);
      expect(error?.detail).not.toMatch(/session/i);
    });

    it('renders the safe business error UI, still signed in and still on the page', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/catalog/item/some-real-item');

      // The resource issues its request as the route activates. Flush before waiting
      // for stability - an open request keeps the app unstable.
      ctx.http
        .expectOne((r) => r.url.includes('get_item'))
        .flush(RAW_FRAPPE_403, { status: 403, statusText: 'Forbidden' });
      await harness.fixture.whenStable();

      const root = harness.fixture.nativeElement as HTMLElement;
      const text = root.textContent ?? '';

      expect(root.querySelector('[data-testid="item-error"]')).not.toBeNull();
      expect(text).toContain('could not load this item');
      expect(root.querySelector('[data-testid="secure-shell"]')).not.toBeNull();

      // Nothing internal on screen.
      expect(text).not.toContain('PermissionError');
      expect(text).not.toContain('No permission for Item');
      expect(text).not.toContain('Traceback');

      // Still signed in, still on the item route.
      expect(ctx.session.isAuthenticated()).toBe(true);
      expect(ctx.router.url).toBe('/catalog/item/some-real-item');
    });
  });
});
