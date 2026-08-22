import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { clearMockRequestLog, mockRequestLog } from '../../../mock-api/core/mock-request-log';
import { MockServerSession } from '../../../mock-api/core/mock-server-session';
import { mockApiInterceptor } from '../../../mock-api/mock-api.interceptor';
import { routes } from '../../app.routes';
import { yobCsrfInterceptor } from '../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../foundation/network/yob-api.config';
import { SessionStore } from '../../foundation/session/session.store';
import { MOCK_FAMILY_SLUG } from '../../../mock-api/fixtures/catalog.fixture';
import { ROUTE_SLOTS } from './contracts/route-content.types';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const ROUTE_CONTENT = 'yob_storefront.api.cms.get_route_content';

/**
 * Which application routes carry content slots, and which deliberately do not.
 *
 * ## Why the *request* is the proof
 *
 * A slot with nothing in it renders nothing at all - that is the contract - so an empty
 * DOM cannot distinguish "the slot is mounted and empty" from "somebody deleted the
 * slot". The `get_route_content` call can: only a mounted slot causes one, and its
 * `route_key` says which position it belongs to. So each route below is asserted by the
 * request it makes, and by the content it draws where the fixture has any.
 *
 * The exact **pairs** are asserted separately, against the published `x-route-slots`, in
 * `e2e/route-content-contract.spec.ts`.
 */
describe('content slots on application routes', () => {
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
    const root = harness.fixture.nativeElement as HTMLElement;
    return {
      slots: Array.from(root.querySelectorAll('[data-testid="content-slot"]')),
      text: (root.textContent ?? '').replace(/\s+/g, ' ').trim(),
    };
  }

  function routeContentCalls(): readonly string[] {
    return mockRequestLog()
      .filter((record) => record.rpcMethod === ROUTE_CONTENT)
      .map((record) => record.params['route_key'] ?? '');
  }

  /* ------------------------------------------------------------ approved routes */

  const APPROVED: readonly (readonly [string, keyof typeof ROUTE_SLOTS])[] = [
    ['/home', 'home'],
    ['/catalog', 'catalog'],
    ['/catalog/fasteners', 'category'],
    ['/catalog/item/hex-bolt-m10-50', 'product'],
    ['/cart', 'cart'],
    ['/account', 'account'],
    ['/orders', 'orders'],
  ];

  for (const [url, routeKey] of APPROVED) {
    it(`asks for ${routeKey} content once on ${url}`, async () => {
      await open(url);

      expect(routeContentCalls()).toEqual([routeKey]);
    });
  }

  it('asks for order_detail content on an order page', async () => {
    const order = mockOrderId();
    await open(`/orders/${order}`);

    expect(routeContentCalls()).toEqual(['order_detail']);
  });

  it('asks for product content on a variant family page too', async () => {
    // A family resolves a SKU on the same route. Content placement is route-level and
    // must not become per-product, or a grid would reprice on every attribute click.
    await open(`/catalog/item/${MOCK_FAMILY_SLUG}`);

    expect(routeContentCalls()).toEqual(['product']);
  });

  /* -------------------------------------------------- where the fixtures fill one */

  it('draws the cart placements around a working cart', async () => {
    const view = await open('/cart');

    expect(view.slots.map((slot) => slot.getAttribute('data-slot'))).toEqual([
      'above_cart',
      'below_cart',
    ]);
    expect(view.text).toContain('Free delivery on orders over 5000');
    // The cart is still the page.
    expect(view.text).toContain('Your cart');
  });

  it('draws the category placement alongside the merchandising filters', async () => {
    const view = await open('/catalog/fasteners');

    expect(view.slots.map((slot) => slot.getAttribute('data-slot'))).toEqual(['above_listing']);
    expect(view.text).toContain('Bulk pricing applies');
    // Phase 25D is untouched: the category's own Filter Set still projects its facets.
    expect(view.text).toContain('Material');
  });

  it('renders no placement where the merchant configured none', async () => {
    const view = await open('/catalog');

    // Both catalog slots are declared and both are empty. The request proves they are
    // mounted; the DOM proves an empty one costs the page nothing.
    expect(routeContentCalls()).toEqual(['catalog']);
    expect(view.slots).toHaveLength(0);
  });

  /* ------------------------------------------------------------ excluded routes */

  describe('deliberately excluded flows', () => {
    // `/login` is absent here on purpose: an authenticated buyer is redirected off it
    // to `/home`, so this suite's signed-in session cannot observe the login page at
    // all. It is asserted as a guest in the suite below.
    const EXCLUDED = ['/checkout', '/payment/tok_live_abc123', '/terms'];

    for (const url of EXCLUDED) {
      it(`places no content on ${url}`, async () => {
        const view = await open(url);

        // The backend refuses these route keys with `content_route_unknown`, and the
        // frontend never asks: no merchant content around a credential form, and nothing
        // between a cart and a payment.
        expect(routeContentCalls()).toEqual([]);
        expect(view.slots).toHaveLength(0);
      });
    }

    it('spells no excluded route in the registry at all', () => {
      const keys = Object.keys(ROUTE_SLOTS);

      for (const excluded of ['login', 'access', 'checkout', 'payment', 'payment_callback']) {
        expect(keys).not.toContain(excluded);
      }
    });
  });

  afterEach(() => {
    http.verify();
  });
});

/** The first order the mock lists, so the detail route has something real to open. */
function mockOrderId(): string {
  return 'SAL-ORD-2026-00001';
}

/**
 * The sign-in page, seen by the only person who ever sees it.
 *
 * Its own suite because it needs a **guest**: an authenticated buyer is redirected away
 * from `/login`, so a signed-in session can never observe the page this is about.
 */
describe('the sign-in page carries no content', () => {
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
    clearMockRequestLog();

    // Deliberately not signed in.
    TestBed.inject(SessionStore).restore().subscribe();
  });

  it('places nothing around the credential form', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/login');
    for (let i = 0; i < 8; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
    const root = harness.fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[data-testid="login-submit"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-testid="content-slot"]')).toHaveLength(0);
    expect(
      mockRequestLog().filter((record) => record.rpcMethod === ROUTE_CONTENT),
    ).toHaveLength(0);

    http.verify();
  });
});
