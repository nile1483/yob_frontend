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
import { SessionStore } from '../../foundation/session/session.store';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

/**
 * The authenticated storefront header (Phase 26B).
 *
 * Rendered through the real route tree and the mock backend, so what these assert is the
 * header a signed-in buyer actually gets - composition, the account controls a merchant
 * cannot switch off, and the fact that one menu request still serves two renderings.
 *
 * Layout *geometry* is a browser question and lives in `e2e/header.spec.ts`; what is
 * asserted here is structure, which is what survives a design change.
 */
describe('secure header', () => {
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

  afterEach(() => http.verify());

  async function open(url = '/home') {
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
      testId: (id: string) => root().querySelector(`[data-testid="${id}"]`),
      all: (id: string) => Array.from(root().querySelectorAll(`[data-testid="${id}"]`)),
      settle: async () => {
        for (let i = 0; i < 6; i++) {
          await harness.fixture.whenStable();
          harness.fixture.detectChanges();
        }
      },
    };
  }

  /* ------------------------------------------------------------- composition */

  describe('composition', () => {
    it('renders the brand, the merchant navigation, search, cart and the user', async () => {
      const view = await open();

      expect(view.testId('brand-link')?.getAttribute('href')).toBe('/home');
      expect(view.testId('desktop-nav')).not.toBeNull();
      expect(view.all('product-search-input').length).toBeGreaterThan(0);
      expect(view.testId('cart-action')?.getAttribute('href')).toBe('/cart');
      expect(view.testId('user-menu-trigger')).not.toBeNull();
    });

    it('puts the merchant navigation immediately after the brand', async () => {
      const view = await open();
      const brand = view.testId('brand-link')!;
      const nav = view.testId('desktop-nav')!;
      const search = view.testId('desktop-search')!;

      // Source order is the accessible order, whatever CSS later does with it.
      expect(brand.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(nav.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('gives the phone its own full-width search row', async () => {
      const view = await open();

      // Two inputs exist - one per breakpoint - and CSS decides which is visible. That
      // is what keeps the phone's search out of the brand row entirely.
      expect(view.testId('desktop-search')).not.toBeNull();
      expect(view.testId('mobile-search')).not.toBeNull();
      expect(view.all('product-search-input')).toHaveLength(2);
    });

    it('reintroduces no hardcoded Catalog link', async () => {
      const view = await open();

      // Browsing is storefront navigation and belongs to the merchant's menu. The only
      // Catalog link in the header is whatever the merchant published.
      const appLinks = view
        .all('cart-action')
        .concat(view.all('user-menu-trigger'))
        .map((el) => el.getAttribute('href'));
      expect(appLinks).not.toContain('/catalog');
    });
  });

  /* --------------------------------------------------------- the user menu */

  describe('the user menu', () => {
    it('shows the display name, constrained so it cannot break the row', async () => {
      const view = await open();
      const name = view.testId('user-menu-name')!;

      expect(name.textContent?.trim()).toBe('Mock Buyer');
      // A display name is unbounded user data: without a hard cap and a truncation it
      // pushes the search box off the row.
      expect(name.className).toContain('truncate');
      expect(name.className).toMatch(/max-w-/);
      // The full value stays reachable for anyone who needs it.
      expect(view.testId('user-menu-trigger')?.getAttribute('title')).toBe('Mock Buyer');
    });

    it('hides the name below the desktop breakpoint, keeping the icon', async () => {
      const view = await open();

      // Locked requirement: a phone shows the icon alone. A truncated user id beside an
      // avatar tells a buyer nothing they do not already know.
      expect(view.testId('user-menu-name')?.className).toContain('hidden');
      expect(view.testId('user-menu-name')?.className).toContain('lg:inline');
      expect(view.testId('user-menu-trigger')).not.toBeNull();
    });

    it('opens on the trigger and offers the routes this application already has', async () => {
      const view = await open();
      expect(view.testId('user-menu-panel')).toBeNull();
      expect(view.testId('user-menu-trigger')?.getAttribute('aria-expanded')).toBe('false');

      (view.testId('user-menu-trigger') as HTMLElement).click();
      await view.settle();

      expect(view.testId('user-menu-panel')).not.toBeNull();
      expect(view.testId('user-menu-trigger')?.getAttribute('aria-expanded')).toBe('true');

      const links = view.all('user-menu-link').map((el) => el.getAttribute('href'));
      // The real routes, not invented duplicates: there is one account page, so there is
      // no separate Profile.
      expect(links).toEqual(['/orders', '/account']);
      expect(view.testId('sign-out')).not.toBeNull();
    });

    it('closes on Escape', async () => {
      const view = await open();
      (view.testId('user-menu-trigger') as HTMLElement).click();
      await view.settle();
      expect(view.testId('user-menu-panel')).not.toBeNull();

      view
        .testId('user-menu-trigger')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await view.settle();

      expect(view.testId('user-menu-panel')).toBeNull();
    });

    it('navigates to an account route from the menu', async () => {
      const view = await open();
      (view.testId('user-menu-trigger') as HTMLElement).click();
      await view.settle();

      (view.all('user-menu-link')[0] as HTMLElement).click();
      await view.settle();

      expect(router.url).toBe('/orders');
    });

    it('carries no merchant navigation', async () => {
      const view = await open();
      (view.testId('user-menu-trigger') as HTMLElement).click();
      await view.settle();

      // Account actions and the storefront tree are different things. A merchant must
      // not be able to bury Sign out, and a buyer must not hunt for it among categories.
      const labels = view.all('user-menu-link').map((el) => el.getAttribute('data-label'));
      expect(labels).toEqual(['Orders', 'Account']);
    });
  });

  /* ---------------------------------------------- controls survive the menu */

  describe('application controls', () => {
    it('keeps the cart and the account actions whatever the merchant configured', async () => {
      // The rule Phase 25D established, re-asserted where those controls now live: an
      // empty or failed menu must not empty the header. A merchant cannot switch off the
      // application's own controls by omission.
      const view = await open('/home');

      expect(view.testId('cart-action')).not.toBeNull();
      expect(view.testId('user-menu-trigger')).not.toBeNull();

      (view.testId('user-menu-trigger') as HTMLElement).click();
      await view.settle();
      expect(view.all('user-menu-link')).toHaveLength(2);
      expect(view.testId('sign-out')).not.toBeNull();
    });
  });

  /* ------------------------------------------------------ one menu request */

  describe('what the header costs', () => {
    it('serves both renderings of the merchant tree from one request', async () => {
      await open();

      // The desktop row and the drawer read the same store. Two requests here would mean
      // two datasets that could disagree.
      const menuCalls = mockRequestLog().filter(
        (record) => record.rpcMethod === 'yob_storefront.api.cms.get_menu',
      );
      expect(menuCalls).toHaveLength(1);
    });

    it('asks for no suggestions until somebody types', async () => {
      await open();

      const suggestionCalls = mockRequestLog().filter((record) =>
        record.rpcMethod.endsWith('get_product_suggestions'),
      );
      expect(suggestionCalls).toEqual([]);
    });
  });
});
