import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { clearMockRequestLog, mockRequestLog } from '../../../mock-api/core/mock-request-log';
import { MockServerSession } from '../../../mock-api/core/mock-server-session';
import { mockApiInterceptor } from '../../../mock-api/mock-api.interceptor';
import { routes } from '../../app.routes';
import { yobCsrfInterceptor } from '../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../foundation/network/yob-api.config';
import { DEFAULT_AUTHENTICATED_PATH } from '../../foundation/session/return-url';
import { SessionStore } from '../../foundation/session/session.store';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const ROUTE_CONTENT = 'yob_storefront.api.cms.get_route_content';

/**
 * The storefront landing page (Phase 25H).
 *
 * Home is an application route with three fixed regions, not a merchant document. These
 * assert both halves of that: the route and its structure belong to this repository, and
 * everything visible inside it came from the merchant through one request.
 */
describe('home', () => {
  let http: HttpTestingController;
  let router: Router;

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
    router = TestBed.inject(Router);
    clearMockRequestLog();

    TestBed.inject(MockServerSession).signIn('TEST_APP', 'password');
    TestBed.inject(SessionStore).restore().subscribe();
  });

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    for (let i = 0; i < 8; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }

    const root = () => harness.fixture.nativeElement as HTMLElement;
    return {
      harness,
      root,
      text: () => (root().textContent ?? '').replace(/\s+/g, ' ').trim(),
      all: (id: string) => Array.from(root().querySelectorAll(`[data-testid="${id}"]`)),
      testId: (id: string) => root().querySelector(`[data-testid="${id}"]`),
    };
  }

  function routeContentCalls(): readonly string[] {
    return mockRequestLog()
      .filter((record) => record.rpcMethod === ROUTE_CONTENT)
      .map((record) => record.params['route_key'] ?? '');
  }

  describe('the route', () => {
    it('exists at /home', async () => {
      await open('/home');

      expect(router.url).toBe('/home');
    });

    it('is where the root URL sends an authenticated buyer', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/');

      expect(router.url).toBe('/home');
    });

    it('is the one default landing path, so nothing can drift from it', () => {
      // The root redirect, the sign-in redirect and the session-unavailable retry all
      // read this constant rather than spelling a path of their own.
      expect(DEFAULT_AUTHENTICATED_PATH).toBe('/home');
    });

    it('leaves /catalog reachable directly', async () => {
      await open('/catalog');

      // Home replaced the *landing*, not the catalog. Browsing is still a route, and
      // still what the merchant's own menu links to.
      expect(router.url).toBe('/catalog');
      expect(TestBed.inject(Router).parseUrl('/catalog').toString()).toBe('/catalog');
    });

    it('is where the brand link goes', async () => {
      const view = await open('/catalog');

      // The one navigation control the application owns unconditionally: it must work in
      // a store with no menu and no content configured at all.
      const brand = view.root().querySelector('header a[href]');
      expect(brand?.getAttribute('href')).toBe('/home');
    });
  });

  describe('its three regions', () => {
    it('declares hero, main and bottom, in that order', async () => {
      const view = await open('/home');

      expect(view.all('content-slot').map((slot) => slot.getAttribute('data-slot'))).toEqual([
        'hero',
        'main',
        'bottom',
      ]);
    });

    it('renders the merchant blocks of each region, in the merchant order', async () => {
      const view = await open('/home');

      const byType = view.all('page-block').map((block) => block.getAttribute('data-block-type'));
      // The second rich text is the Block `support` also places - same Block, different
      // band. See the section-style suite.
      expect(byType).toEqual([
        'image_banner',
        'rich_text',
        // The buyer's own targets (3.13.0), in the slot position the merchant chose.
        'target_progress',
        'product_grid',
        'rich_text',
        'promo_grid',
      ]);
    });

    it('costs one request for all three', async () => {
      await open('/home');

      // Three regions, one answer. A page that asked per region would appear here as
      // three identical calls.
      expect(routeContentCalls()).toEqual(['home']);
    });

    it('adds no catalogue or pricing request for the products it shows', async () => {
      const view = await open('/home');

      expect(view.all('item-card').length).toBeGreaterThan(0);

      const rpcs = mockRequestLog().map((record) => record.rpcMethod);
      expect(rpcs.filter((rpc) => rpc.startsWith('yob_storefront.api.catalog.'))).toEqual([]);
      http.expectNone((request) => request.url.includes('catalog.'));
    });
  });

  describe('what it is not', () => {
    it('is not routed through a Storefront Page', async () => {
      await open('/home');

      // No `cms.get_page` anywhere: Home is application-owned, and a merchant cannot
      // rename it, unpublish it or reorder its regions.
      const rpcs = mockRequestLog().map((record) => record.rpcMethod);
      expect(rpcs.filter((rpc) => rpc.endsWith('cms.get_page'))).toEqual([]);
    });
  });
});
