import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { MockServerSession } from '../../../mock-api/core/mock-server-session';
import { mockApiInterceptor } from '../../../mock-api/mock-api.interceptor';
import { routes } from '../../app.routes';
import { yobCsrfInterceptor } from '../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../foundation/network/yob-api.config';
import { SessionStore } from '../../foundation/session/session.store';
import { answerRouteContent } from './route-content.testing';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

/**
 * Merchant pages, through the real route tree and the mock backend (Phase 25E).
 *
 * The page is one request: `cms.get_page(slug)`. Everything on screen - including the
 * Product Grid's prices - arrives with it, so these tests assert both what is rendered
 * and, just as importantly, what is **not** requested.
 */
describe('storefront page', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(withInterceptors([yobCsrfInterceptor, mockApiInterceptor])),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    http = TestBed.inject(HttpTestingController);

    TestBed.inject(MockServerSession).signIn('TEST_APP', 'password');
    TestBed.inject(SessionStore).restore().subscribe();
  });

  afterEach(() => {
    // Every content-bearing route asks for its merchant content on render.
    // Answering it keeps `verify()` meaningful for the requests these tests
    // are about - an unmatched one still fails.
    answerRouteContent(http);
    http.verify();
  });

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await settle(harness);

    const root = () => harness.fixture.nativeElement as HTMLElement;
    return {
      harness,
      root,
      settle: () => settle(harness),
      goTo: async (next: string) => {
        await harness.navigateByUrl(next);
        await settle(harness);
      },
      text: () => (root().textContent ?? '').replace(/\s+/g, ' ').trim(),
      testId: (id: string) => root().querySelector(`[data-testid="${id}"]`),
      all: (id: string) => Array.from(root().querySelectorAll(`[data-testid="${id}"]`)),
    };
  }

  async function settle(harness: RouterTestingHarness): Promise<void> {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }

  describe('the route', () => {
    it('exists at /pages/:slug and asks for that slug', async () => {
      const view = await open('/pages/about-us');

      expect(view.testId('storefront-page')?.getAttribute('data-slug')).toBe('about-us');
      expect(view.testId('page-title')?.textContent).toContain('About Us');
    });

    it('is the route navigation builds for a storefront_page destination', async () => {
      // Phase 25D generates `/pages/<target>` because the backend stores no route. This
      // is the other half of that agreement: the route it generates resolves here.
      const view = await open('/catalog');
      const link = view
        .all('nav-link')
        .find((node) => node.getAttribute('data-label') === 'About Us');

      expect(link?.getAttribute('href')).toBe('/pages/about-us');

      await view.goTo(link?.getAttribute('href') ?? '');
      expect(view.testId('page-title')?.textContent).toContain('About Us');
    });

    it('replaces the page when the slug changes', async () => {
      const view = await open('/pages/about-us');
      expect(view.text()).toContain('Who we are');

      await view.goTo('/pages/support');

      // Not merged into: the previous page's blocks are gone, not appended to.
      expect(view.testId('storefront-page')?.getAttribute('data-slug')).toBe('support');
      expect(view.text()).toContain('Contact us');
      expect(view.text()).not.toContain('Who we are');
      expect(view.all('page-block')).toHaveLength(1);
    });

    it('shows a safe not-found state for an unpublished or unknown page', async () => {
      const view = await open('/pages/no-such-page');

      expect(view.testId('page-not-found')).not.toBeNull();
      expect(view.testId('page-error')).toBeNull();
      // Nothing raw from the server reaches the buyer.
      expect(view.text()).not.toContain('page_not_found');
    });
  });

  describe('blocks', () => {
    it('renders every block type, in the backend order', async () => {
      const view = await open('/pages/about-us');

      expect(view.all('page-block').map((node) => node.getAttribute('data-block-type'))).toEqual([
        'image_banner',
        'rich_text',
        'banner_carousel',
        'product_grid',
        'promo_grid',
      ]);
    });

    it('skips a block type it does not know, and renders the rest', async () => {
      const view = await open('/pages/future');

      // Forward compatibility: a newer backend must not take an older client's page down.
      expect(view.testId('storefront-page')).not.toBeNull();
      expect(view.all('page-block')).toHaveLength(1);
      expect(view.testId('block-rich-text')).not.toBeNull();
      expect(view.text()).toContain('Still here');
    });
  });

  describe('what a page costs', () => {
    it('is one request, whatever the blocks contain', async () => {
      const view = await open('/pages/about-us');

      // The Product Grid's rows arrived with the page, already priced. A client that
      // interpreted blocks by fetching would show up here as pending requests.
      http.expectNone((r) => r.url.includes('get_item'));
      http.expectNone((r) => r.url.includes('get_items'));
      http.expectNone((r) => r.url.includes('resolve_variant'));
      http.expectNone((r) => r.url.includes('get_category'));
      expect(view.testId('block-product-grid')).not.toBeNull();
    });
  });

  describe('page metadata', () => {
    it('uses the page SEO fields for the document title and description', async () => {
      await open('/pages/about-us');

      expect(TestBed.inject(Title).getTitle()).toBe('About Your Order Book');
      expect(TestBed.inject(Meta).getTag("name='description'")?.content).toBe(
        'Who we are and what we stock.',
      );
    });

    it('does not leave the previous page metadata behind', async () => {
      const view = await open('/pages/about-us');
      expect(TestBed.inject(Meta).getTag("name='description'")).not.toBeNull();

      await view.goTo('/pages/support');

      // `support` has no description of its own; the stale one must go rather than
      // describe a page the buyer has left.
      expect(TestBed.inject(Title).getTitle()).toBe('Support');
      expect(TestBed.inject(Meta).getTag("name='description'")).toBeNull();
    });

    it('falls back to the page title when there is no meta title', async () => {
      await open('/pages/support');

      expect(TestBed.inject(Title).getTitle()).toBe('Support');
    });
  });
});
