import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { clearMockRequestLog, mockRequestLog } from '../../../../mock-api/core/mock-request-log';
import { MockServerSession } from '../../../../mock-api/core/mock-server-session';
import { mockApiInterceptor } from '../../../../mock-api/mock-api.interceptor';
import { routes } from '../../../app.routes';
import { yobCsrfInterceptor } from '../../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../../foundation/network/yob-api.config';
import { SessionStore } from '../../../foundation/session/session.store';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const GET_MENU = 'yob_storefront.api.cms.get_menu';

/**
 * The phone's merchant navigation drawer (Phase 26B).
 *
 * The thing most worth protecting here is that it is the **same tree**: one request, one
 * dataset, two renderings. A second menu fetch would be two sources of truth that could
 * disagree, and nobody would notice until a customer did.
 */
describe('mobile navigation drawer', () => {
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

    const settle = async () => {
      for (let i = 0; i < 8; i++) {
        await harness.fixture.whenStable();
        harness.fixture.detectChanges();
      }
    };
    await settle();

    const root = () => harness.fixture.nativeElement as HTMLElement;
    return {
      settle,
      root,
      testId: (id: string) => root().querySelector(`[data-testid="${id}"]`),
      all: (id: string) => Array.from(root().querySelectorAll(`[data-testid="${id}"]`)),
      byLabel: (id: string, label: string) =>
        Array.from(root().querySelectorAll(`[data-testid="${id}"]`)).find(
          (el) => el.getAttribute('data-label') === label,
        ),
      hamburger: () => root().querySelector('[data-testid="nav-hamburger"]') as HTMLElement,
    };
  }

  it('offers a hamburger, closed, when the merchant published a menu', async () => {
    const view = await open();

    expect(view.hamburger()).not.toBeNull();
    expect(view.hamburger().getAttribute('aria-expanded')).toBe('false');
    expect(view.testId('nav-drawer')).toBeNull();
  });

  it('opens the drawer on the hamburger', async () => {
    const view = await open();
    view.hamburger().click();
    await view.settle();

    expect(view.testId('nav-drawer')).not.toBeNull();
    expect(view.hamburger().getAttribute('aria-expanded')).toBe('true');
    // A dialog, labelled, so a screen reader announces what opened.
    expect(view.testId('nav-drawer')?.getAttribute('role')).toBe('dialog');
    expect(view.testId('nav-drawer')?.getAttribute('aria-label')).toBe('Menu');
  });

  it('draws the same merchant tree the desktop row uses, from one request', async () => {
    const view = await open();
    view.hamburger().click();
    await view.settle();

    // The mock menu's own roots. Not a static Home/Catalog fallback, and not a second
    // menu key: the drawer and the header read one store.
    expect(view.byLabel('drawer-link', 'Catalog')?.getAttribute('href')).toBe('/catalog');
    expect(view.byLabel('drawer-group', 'Tools')).toBeDefined();

    const menuCalls = mockRequestLog().filter((record) => record.rpcMethod === GET_MENU);
    expect(menuCalls).toHaveLength(1);
  });

  it('expands a group rather than navigating from it', async () => {
    const view = await open();
    view.hamburger().click();
    await view.settle();

    const group = view.byLabel('drawer-group', 'Tools') as HTMLElement;
    // A group is organisational: a button that discloses, never a link that goes nowhere.
    expect(group.tagName).toBe('BUTTON');
    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(view.byLabel('drawer-link', 'Fasteners')).toBeUndefined();

    group.click();
    await view.settle();

    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(view.byLabel('drawer-link', 'Fasteners')?.getAttribute('href')).toBe(
      '/catalog/fasteners',
    );
  });

  it('navigates from a child destination and closes behind itself', async () => {
    const view = await open();
    view.hamburger().click();
    await view.settle();
    (view.byLabel('drawer-group', 'Tools') as HTMLElement).click();
    await view.settle();

    (view.byLabel('drawer-link', 'Fasteners') as HTMLElement).click();
    await view.settle();

    expect(router.url).toBe('/catalog/fasteners');
    // A drawer left open over the page a buyer just chose is a bug, not a feature.
    expect(view.testId('nav-drawer')).toBeNull();
  });

  it('closes on the explicit control, the backdrop and Escape', async () => {
    const view = await open();

    view.hamburger().click();
    await view.settle();
    (view.testId('nav-drawer-close') as HTMLElement).click();
    await view.settle();
    expect(view.testId('nav-drawer')).toBeNull();

    view.hamburger().click();
    await view.settle();
    (view.testId('nav-drawer-backdrop') as HTMLElement).click();
    await view.settle();
    expect(view.testId('nav-drawer')).toBeNull();

    view.hamburger().click();
    await view.settle();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await view.settle();
    expect(view.testId('nav-drawer')).toBeNull();
  });

  it('carries no account action', async () => {
    const view = await open();
    view.hamburger().click();
    await view.settle();

    // Clean separation: the hamburger is storefront navigation, the user menu is account
    // actions. A buyer should not hunt for Sign out among category links.
    const text = view.testId('nav-drawer')?.textContent ?? '';
    expect(text).not.toContain('Sign out');
    expect(text).not.toContain('Account');
  });
});

/**
 * The same drawer, in a store whose menu could not be loaded.
 *
 * Its own suite because the scenario has to be set before the application boots.
 */
describe('when no menu is available', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(withInterceptors([yobCsrfInterceptor])),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionStore).restore().subscribe();
    http
      .expectOne((request) => request.url.includes('get_session_context'))
      .flush({ message: { data: AUTHENTICATED } });
  });

  it('offers no hamburger rather than an empty panel', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/home');
    for (let i = 0; i < 4; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }

    for (const request of http.match((r) => r.url.includes('get_menu'))) {
      request.flush(
        { message: { errors: [{ code: 'menu_not_found', detail: 'never rendered' }] } },
        { status: 404, statusText: 'Not Found' },
      );
    }
    for (const request of http.match((r) => r.url.includes('get_route_content'))) {
      request.flush({ message: { data: { route_key: 'home', slots: [] } } });
    }
    for (let i = 0; i < 6; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }

    const root = harness.fixture.nativeElement as HTMLElement;
    // A hamburger that opens nothing tells a buyer the store is broken. A header without
    // one simply looks like a store with no published navigation, which is what it is.
    expect(root.querySelector('[data-testid="nav-hamburger"]')).toBeNull();
    expect(root.textContent).not.toContain('never rendered');

    // ...and everything the application owns still works.
    expect(root.querySelector('[data-testid="brand-link"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="cart-action"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="user-menu-trigger"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="product-search-input"]')).not.toBeNull();

    http.verify();
  });
});

const AUTHENTICATED = {
  authenticated: true,
  authentication_method: 'password',
  user: { name: 'buyer@example.invalid', full_name: 'Test Buyer' },
  csrf_token: 'test-csrf',
  context: { profile_name: 'Test Co' },
};
