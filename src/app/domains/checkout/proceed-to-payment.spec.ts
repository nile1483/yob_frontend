import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { By } from '@angular/platform-browser';
import { Observable, of } from 'rxjs';

import { MockServerAddressBook } from '../../../mock-api/core/mock-server-address-book';
import { MockServerCart } from '../../../mock-api/core/mock-server-cart';
import { MockServerSession } from '../../../mock-api/core/mock-server-session';
import { MOCK_CHECKOUT_TOKEN } from '../../../mock-api/fixtures/payment.fixture';
import { mockApiInterceptor } from '../../../mock-api/mock-api.interceptor';
import { MockApiScenario } from '../../../mock-api/scenarios/mock-scenario';
import { routes } from '../../app.routes';
import { yobCsrfInterceptor } from '../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../foundation/network/yob-api.config';
import { SessionStore } from '../../foundation/session/session.store';
import { CartStore } from '../cart/state/cart.store';
import { CheckoutApi } from './data/checkout.api';
import { CheckoutPage } from './pages/checkout-page';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const PROCEED = '/api/method/yob_storefront.api.checkout.proceed_to_payment';
const BOLT = 'YOB-BOLT-M10';

describe('Proceed to payment', () => {
  describe('CheckoutApi', () => {
    let api: CheckoutApi;
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: YOB_API_CONFIG, useValue: CONFIG },
        ],
      });
      api = TestBed.inject(CheckoutApi);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('posts to the documented RPC method with an empty body', () => {
      api.proceedToPayment().subscribe();

      const req = http.expectOne(PROCEED);
      expect(req.request.method).toBe('POST');
      // `post()` defaults to `{}` - the endpoint takes no arguments at all.
      expect(req.request.body).toEqual({});
      req.flush({
        message: { data: { payment_request: 'X', payment_url: '/payment/t', token: 't' } },
      });
    });

    it('sends nothing the browser could get wrong', () => {
      api.proceedToPayment().subscribe();

      const req = http.expectOne(PROCEED);
      const body = (req.request.body ?? {}) as Record<string, unknown>;
      // A Payment Request is an immutable financial obligation. The server derives
      // every one of these from the session; a browser that could name an amount
      // could name the wrong one.
      for (const forbidden of [
        'amount',
        'currency',
        'cart',
        'cart_id',
        'customer',
        'fingerprint',
        'payment_request',
        'payment_method',
      ]) {
        expect(body[forbidden]).toBeUndefined();
      }
      expect(Object.keys(body)).toEqual([]);
      // Nor smuggled into the query string.
      expect(req.request.params.keys()).toEqual([]);

      req.flush({
        message: { data: { payment_request: 'X', payment_url: '/payment/t', token: 't' } },
      });
    });

    it('resolves identically for 201 created and 200 reused', () => {
      const body = {
        message: {
          data: {
            payment_request: 'ACC-PRQ-2026-00002',
            payment_url: '/payment/tok',
            token: 'tok',
          },
          notice: 'Proceed to payment',
        },
      };

      let created: unknown;
      api.proceedToPayment().subscribe((v) => (created = v));
      http.expectOne(PROCEED).flush(body, { status: 201, statusText: 'Created' });

      let reused: unknown;
      api.proceedToPayment().subscribe((v) => (reused = v));
      http.expectOne(PROCEED).flush(body, { status: 200, statusText: 'OK' });

      // No created/reused flag reaches the caller: there is nothing to branch on.
      expect(created).toEqual(reused);
    });
  });

  describe('CheckoutPage', () => {
    let http: HttpTestingController;
    let mockCart: MockServerCart;
    let mockBook: MockServerAddressBook;
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
      http = TestBed.inject(HttpTestingController);
      mockCart = TestBed.inject(MockServerCart);
      mockBook = TestBed.inject(MockServerAddressBook);
      scenario = TestBed.inject(MockApiScenario);

      TestBed.inject(MockServerSession).signIn('TEST_APP', 'password');
      TestBed.inject(SessionStore).restore().subscribe();
    });

    afterEach(() => {
      scenario.reset();
      mockCart.reset();
      mockBook.reset();
      http.verify();
    });

    async function open() {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/checkout');
      await harness.fixture.whenStable();
      const root = harness.fixture.nativeElement as HTMLElement;

      return {
        harness,
        root,
        text: () => root.textContent ?? '',
        testId: (id: string) => root.querySelector(`[data-testid="${id}"]`),
        proceed: () => root.querySelector('[data-testid="checkout-proceed"]') as HTMLButtonElement,
        settle: async () => {
          await Promise.resolve();
          await Promise.resolve();
          harness.fixture.detectChanges();
          await harness.fixture.whenStable();
        },
      };
    }

    // ------------------------------------------------------------ readiness

    it('disables the CTA until the cart is ready', async () => {
      mockCart.seedQuantity(BOLT, 1);
      mockCart.clearShippingAddress();
      const view = await open();

      expect(view.proceed()).not.toBeNull();
      expect(view.proceed().disabled).toBe(true);
    });

    it('enables the CTA when contact, billing and shipping are all selected', async () => {
      mockCart.seedQuantity(BOLT, 1);
      const view = await open();

      expect(view.proceed().disabled).toBe(false);
    });

    it('does not require shipping when the cart is not shippable', async () => {
      mockCart.seedQuantity(BOLT, 1);
      mockCart.clearShippingAddress();
      scenario.scenario.set('cart-not-shippable');
      const view = await open();

      // Readiness must not demand what the cart does not need.
      expect(view.proceed().disabled).toBe(false);
    });

    it('offers no CTA at all for an empty cart', async () => {
      const view = await open();

      expect(view.testId('checkout-empty')).not.toBeNull();
      expect(view.testId('checkout-proceed')).toBeNull();
    });

    // ---------------------------------------------------------- the request

    it('sends exactly one request per click', async () => {
      mockCart.seedQuantity(BOLT, 1);
      const view = await open();

      let calls = 0;
      const api = TestBed.inject(CheckoutApi);
      const real = api.proceedToPayment.bind(api);
      vi.spyOn(api, 'proceedToPayment').mockImplementation(() => {
        calls += 1;
        return real();
      });

      view.proceed().click();
      await view.settle();

      expect(calls).toBe(1);
    });

    it('disables the CTA while a request is in flight', async () => {
      mockCart.seedQuantity(BOLT, 1);
      const view = await open();

      const api = TestBed.inject(CheckoutApi);
      // Never completes, so the first request stays in flight.
      vi.spyOn(api, 'proceedToPayment').mockImplementation(() => new Observable<never>());

      expect(view.proceed().disabled).toBe(false);
      view.proceed().click();
      await view.settle();

      expect(view.proceed().disabled).toBe(true);
    });

    it('refuses a second request even when the click is not blocked', async () => {
      // The disabled attribute is a UI affordance, not the guarantee. This drives the
      // handler directly, the way a stray programmatic call or a race would, so the
      // guard inside it is what is under test rather than the button's state.
      mockCart.seedQuantity(BOLT, 1);

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/checkout');
      await harness.fixture.whenStable();

      // `/checkout` routes the secure shell; the page is nested inside it.
      const page = harness.fixture.debugElement.query(By.directive(CheckoutPage))
        .componentInstance as CheckoutPage;

      let calls = 0;
      const api = TestBed.inject(CheckoutApi);
      vi.spyOn(api, 'proceedToPayment').mockImplementation(() => {
        calls += 1;
        return new Observable<never>();
      });

      const proceed = page as unknown as { onProceedToPayment: () => void };
      proceed.onProceedToPayment();
      proceed.onProceedToPayment();
      proceed.onProceedToPayment();

      // One obligation request, not three. Issuing duplicates is not free: each is a
      // financial obligation on the server.
      expect(calls).toBe(1);
    });

    // ------------------------------------------------------------ navigation

    it('navigates to the payment_url the server returned (201 created)', async () => {
      mockCart.seedQuantity(BOLT, 1);
      const view = await open();

      view.proceed().click();
      await view.settle();

      expect(TestBed.inject(Router).url).toBe(`/payment/${MOCK_CHECKOUT_TOKEN}`);
    });

    it('navigates identically when the obligation was reused (200)', async () => {
      mockCart.seedQuantity(BOLT, 1);
      scenario.scenario.set('payment-reused');
      const view = await open();

      view.proceed().click();
      await view.settle();

      // Same destination, no different message, nothing about reuse on screen.
      expect(TestBed.inject(Router).url).toBe(`/payment/${MOCK_CHECKOUT_TOKEN}`);
    });

    it('refuses a payment_url that points outside the application', async () => {
      mockCart.seedQuantity(BOLT, 1);
      const view = await open();

      const api = TestBed.inject(CheckoutApi);
      vi.spyOn(api, 'proceedToPayment').mockReturnValue(
        of({
          payment_request: 'ACC-PRQ-2026-00002',
          payment_url: 'https://phish.example/payment/tok',
          token: 'tok',
        }),
      );

      view.proceed().click();
      await view.settle();

      // Still on checkout, with a safe message - not redirected off-site.
      expect(TestBed.inject(Router).url).toBe('/checkout');
      expect(view.testId('checkout-proceed-error')).not.toBeNull();
    });

    // --------------------------------------------------------------- failure

    it('stays on checkout and shows safe wording when the server refuses', async () => {
      mockCart.seedQuantity(BOLT, 1);
      const view = await open();

      // The cart is emptied elsewhere between render and submit.
      mockCart.reset();
      view.proceed().click();
      await view.settle();

      expect(TestBed.inject(Router).url).toBe('/checkout');
      expect(view.testId('checkout-proceed-error')).not.toBeNull();
      expect(view.text()).toContain('Your cart is empty');
      // Nothing from the backend, and no internal identifiers.
      expect(view.text()).not.toContain('cart_empty');
      expect(view.text()).not.toContain('Traceback');
      expect(view.text()).not.toContain('ACC-PRQ');
    });

    it('re-reads the cart after a checkout-state failure rather than guessing', async () => {
      mockCart.seedQuantity(BOLT, 1);
      const view = await open();

      mockCart.reset();
      view.proceed().click();
      await view.settle();

      // The page now reflects what the server actually holds.
      expect(TestBed.inject(CartStore).isEmpty()).toBe(true);
    });

    it('never marks the cart ordered locally', async () => {
      mockCart.seedQuantity(BOLT, 1);
      const view = await open();
      const store = TestBed.inject(CartStore);
      const before = store.cart()?.status;

      view.proceed().click();
      await view.settle();

      // proceed_to_payment issues an obligation; it does not commit the cart. That
      // happens later, in process_payment, after a method is chosen.
      expect(before).toBe('Draft');
      expect(store.cart()?.status).toBe('Draft');
      expect(store.lines().length).toBe(1);
    });

    // ----------------------------------------------------------- token safety

    it('does not persist the checkout token anywhere', async () => {
      mockCart.seedQuantity(BOLT, 1);
      const view = await open();

      view.proceed().click();
      await view.settle();

      // It lives in the URL, which is the contract, and nowhere else.
      expect(TestBed.inject(Router).url).toContain(MOCK_CHECKOUT_TOKEN);

      const stored = [
        ...Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`),
        ...Object.keys(sessionStorage).map((k) => `${k}=${sessionStorage.getItem(k)}`),
      ].join('|');
      expect(stored).not.toContain(MOCK_CHECKOUT_TOKEN);
      expect(document.cookie).not.toContain(MOCK_CHECKOUT_TOKEN);
    });
  });

  describe('the public payment route', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter(routes, withComponentInputBinding()),
          provideHttpClient(withInterceptors([yobCsrfInterceptor, mockApiInterceptor])),
          provideHttpClientTesting(),
          { provide: YOB_API_CONFIG, useValue: CONFIG },
        ],
      });
    });

    it('resolves for a visitor with no session', async () => {
      // Deliberately no sign-in: this is the whole point of the route being public.
      const session = TestBed.inject(SessionStore);
      session.restore().subscribe();
      expect(session.isAuthenticated()).toBe(false);

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/payment/${MOCK_CHECKOUT_TOKEN}`);
      await harness.fixture.whenStable();

      const root = harness.fixture.nativeElement as HTMLElement;
      expect(TestBed.inject(Router).url).toBe(`/payment/${MOCK_CHECKOUT_TOKEN}`);
      expect(root.querySelector('[data-testid="payment-page"]')).not.toBeNull();
    });

    it('is not intercepted by the authenticated guard', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/payment/${MOCK_CHECKOUT_TOKEN}`);
      await harness.fixture.whenStable();

      const url = TestBed.inject(Router).url;
      // Not bounced to sign-in, and no returnUrl round trip.
      expect(url).not.toContain('/login');
      expect(url).not.toContain('returnUrl');
      expect(url).toBe(`/payment/${MOCK_CHECKOUT_TOKEN}`);
    });

    it('renders inside the public shell, not the secure one', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/payment/${MOCK_CHECKOUT_TOKEN}`);
      await harness.fixture.whenStable();

      const root = harness.fixture.nativeElement as HTMLElement;
      expect(root.querySelector('[data-testid="public-shell"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="secure-shell"]')).toBeNull();
    });

    it('does not request payment data yet', async () => {
      const http = TestBed.inject(HttpTestingController);
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/payment/${MOCK_CHECKOUT_TOKEN}`);
      await harness.fixture.whenStable();

      // Phase 13 owns get_checkout_data. Phase 12's page proves routing only.
      http.expectNone((r) => r.url.includes('get_checkout_data'));
    });
  });
});
