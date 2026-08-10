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
});
