import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable } from 'rxjs';

import { MockServerPayment } from '../../../mock-api/core/mock-server-payment';
import {
  MOCK_AMOUNT,
  MOCK_AMOUNT_PAISE,
  MOCK_CHECKOUT_TOKEN,
  MOCK_METHOD_PAY_LATER,
  MOCK_METHOD_RAZORPAY,
  MOCK_RAZORPAY_KEY,
  MOCK_RAZORPAY_ORDER_ID,
  MOCK_SALES_ORDER,
} from '../../../mock-api/fixtures/payment.fixture';
import { mockApiInterceptor } from '../../../mock-api/mock-api.interceptor';
import {
  FAKE_RAZORPAY_PAYMENT_ID,
  FakeRazorpayCheckout,
} from '../../../mock-api/razorpay/fake-razorpay-checkout';
import { MockApiScenario } from '../../../mock-api/scenarios/mock-scenario';
import { routes } from '../../app.routes';
import { yobCsrfInterceptor } from '../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../foundation/network/yob-api.config';
import {
  isCartBacked,
  type PaymentMethodDto,
  type RazorpayOrderDto,
} from './contracts/payment.types';
import { PaymentApi } from './data/payment.api';
import { PaymentPage } from './pages/payment-page';
import { RazorpayCheckout } from './razorpay/razorpay-checkout';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const GET_CHECKOUT_DATA = '/api/method/yob_storefront.api.payment.get_checkout_data';
const PROCESS_PAYMENT = '/api/method/yob_storefront.api.payment.process_payment';
const VERIFY_PAYMENT = '/api/method/yob_storefront.api.payment.verify_payment';

describe('Payment', () => {
  // ==================================================================== API

  describe('PaymentApi', () => {
    let api: PaymentApi;
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: YOB_API_CONFIG, useValue: CONFIG },
        ],
      });
      api = TestBed.inject(PaymentApi);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('reads checkout data with the token as a query parameter', () => {
      api.getCheckoutData('tok-123').subscribe();

      const req = http.expectOne((r) => r.url === GET_CHECKOUT_DATA);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('token')).toBe('tok-123');
      req.flush({ message: { data: { source_doctype: 'Cart' } } });
    });

    it('parses the Cart-backed shape', () => {
      let data: unknown;
      api.getCheckoutData('t').subscribe((v) => (data = v));

      http
        .expectOne((r) => r.url === GET_CHECKOUT_DATA)
        .flush({
          message: {
            data: {
              source_doctype: 'Cart',
              source_name: 'CART-1',
              payment_request: 'ACC-PRQ-1',
              amount: 135.0,
              currency: 'INR',
              payment_methods: [],
              cart: { name: 'CART-1', items: [] },
              contact: null,
              billing_address: { name: 'A', display: '<br>' },
              shipping_address: null,
              cart_updated: false,
              removed_items: [],
              price_updated_items: [],
            },
          },
        });

      expect(isCartBacked(data as never)).toBe(true);
    });

    it('parses the Sales-Order-backed shape, with addresses as name strings', () => {
      let data: { billing_address?: unknown; source_doctype?: string } | undefined;
      api.getCheckoutData('t').subscribe((v) => (data = v as never));

      http
        .expectOne((r) => r.url === GET_CHECKOUT_DATA)
        .flush({
          message: {
            data: {
              source_doctype: 'Sales Order',
              source_name: 'SAL-ORD-1',
              payment_request: 'ACC-PRQ-1',
              amount: 135.0,
              currency: 'INR',
              payment_methods: [],
              customer: 'C',
              company: 'Co',
              items: [
                {
                  item_code: 'X',
                  item_name: 'X name',
                  quantity: 1,
                  rate: 1,
                  amount: 1,
                  uom: 'Nos',
                },
              ],
              billing_address: 'ADDR-NAME-STRING',
              shipping_address: 'ADDR-NAME-STRING',
              contact_person: 'CONTACT-NAME',
              order_status: 'Draft',
              docstatus: 0,
            },
          },
        });

      expect(data?.source_doctype).toBe('Sales Order');
      // A string, not an object: the shapes genuinely differ.
      expect(typeof data?.billing_address).toBe('string');
      expect(isCartBacked(data as never)).toBe(false);
    });

    it('sends the method NAME, not its method_code', () => {
      api.processPayment('tok', MOCK_METHOD_RAZORPAY).subscribe();

      const req = http.expectOne(PROCESS_PAYMENT);
      // The regression this guards: sending `razorpay` answers payment_method_unsupported.
      expect(req.request.body).toEqual({ token: 'tok', payment_method: 'Razorpay' });
      expect((req.request.body as { payment_method: string }).payment_method).not.toBe(
        MOCK_METHOD_RAZORPAY.method_code,
      );
      req.flush({ message: { data: {} } });
    });

    it('sends only the token and the method', () => {
      api.processPayment('tok', MOCK_METHOD_PAY_LATER).subscribe();

      const req = http.expectOne(PROCESS_PAYMENT);
      const body = req.request.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['payment_method', 'token']);
      for (const forbidden of [
        'amount',
        'currency',
        'cart',
        'sales_order',
        'customer',
        'payment_request',
        'order_id',
        'razorpay_order_id',
      ]) {
        expect(body[forbidden]).toBeUndefined();
      }
      req.flush({ message: { data: {} } });
    });

    it('verifies with exactly the three provider fields and no token', () => {
      api
        .verifyPayment({
          razorpay_order_id: 'order_1',
          razorpay_payment_id: 'pay_1',
          razorpay_signature: 'sig',
        })
        .subscribe();

      const req = http.expectOne(VERIFY_PAYMENT);
      expect(Object.keys(req.request.body as object).sort()).toEqual([
        'razorpay_order_id',
        'razorpay_payment_id',
        'razorpay_signature',
      ]);
      // The endpoint resolves by provider order id and HMAC; a token would be a bearer
      // credential it never asked for.
      expect((req.request.body as Record<string, unknown>)['token']).toBeUndefined();
      req.flush({ message: { data: {} } });
    });
  });

  // =================================================================== page

  describe('PaymentPage', () => {
    let scenario: MockApiScenario;
    let payment: MockServerPayment;
    let fakeRazorpay: FakeRazorpayCheckout;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter(routes, withComponentInputBinding()),
          provideHttpClient(withInterceptors([yobCsrfInterceptor, mockApiInterceptor])),
          provideHttpClientTesting(),
          { provide: YOB_API_CONFIG, useValue: CONFIG },
          // The same substitution the mock build makes, so tests never touch the real
          // third-party widget.
          { provide: RazorpayCheckout, useClass: FakeRazorpayCheckout },
        ],
      });
      scenario = TestBed.inject(MockApiScenario);
      payment = TestBed.inject(MockServerPayment);
      fakeRazorpay = TestBed.inject(RazorpayCheckout) as FakeRazorpayCheckout;
    });

    afterEach(() => {
      scenario.reset();
      payment.reset();
    });

    async function open(token = MOCK_CHECKOUT_TOKEN) {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/payment/${token}`);
      await harness.fixture.whenStable();
      const root = harness.fixture.nativeElement as HTMLElement;

      // The Razorpay stand-in reports through a `setTimeout`, like the real widget's
      // asynchronous callbacks, so flushing microtasks alone would never see it.
      const settle = async () => {
        for (let i = 0; i < 4; i++) {
          await Promise.resolve();
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
        harness.fixture.detectChanges();
        await harness.fixture.whenStable();
        harness.fixture.detectChanges();
      };
      await settle();

      return {
        harness,
        root,
        settle,
        /**
         * Remount the page against the same mock server, as a browser reload does.
         *
         * Navigating away and back rather than creating a second harness - only one is
         * allowed per test - and it is the more faithful simulation anyway: the
         * component is destroyed and rebuilt, the resource re-requests, and the mock
         * server's committed state persists exactly as a real backend's would.
         */
        reload: async () => {
          await harness.navigateByUrl('/terms');
          await harness.navigateByUrl(`/payment/${token}`);
          await settle();
        },
        page: harness.fixture.debugElement.query(By.directive(PaymentPage))
          .componentInstance as PaymentPage,
        text: () => root.textContent ?? '',
        testId: (id: string) => root.querySelector(`[data-testid="${id}"]`),
        all: (id: string) => Array.from(root.querySelectorAll(`[data-testid="${id}"]`)),
        methodRadios: () =>
          Array.from(
            root.querySelectorAll('[data-testid="payment-method-option"]'),
          ) as HTMLInputElement[],
        pay: () => root.querySelector('[data-testid="payment-pay"]') as HTMLButtonElement,
      };
    }

    // ------------------------------------------------------------ rendering

    it('renders a Cart-backed summary', async () => {
      const view = await open();

      expect(view.testId('payment-summary')).not.toBeNull();
      expect(view.testId('payment-amount')?.textContent).toContain('135');
      // A cart has no order status.
      expect(view.testId('payment-order-status')).toBeNull();
      expect(view.all('payment-line').length).toBe(1);
    });

    it('renders a Sales-Order-backed summary with no cart assumption', async () => {
      scenario.scenario.set('payment-committed');
      const view = await open();

      expect(view.testId('payment-summary')).not.toBeNull();
      expect(view.testId('payment-order-status')?.textContent).toContain('Draft');
      expect(view.testId('payment-source-reference')?.textContent).toContain(MOCK_SALES_ORDER);
      // Addresses arrive as bare names in this shape and are shown as such.
      expect(view.testId('payment-billing')?.textContent).toContain('Mock Trading Co-Billing');
      expect(view.all('payment-line').length).toBe(1);
    });

    it('never prints the backend HTML address block', async () => {
      const view = await open();

      expect(view.root.innerHTML).not.toContain('<br>');
      expect(view.text()).not.toContain('<br>');
    });

    // -------------------------------------------------------------- methods

    it('renders only the methods the server returned', async () => {
      scenario.scenario.set('payment-razorpay-only');
      const view = await open();

      const codes = view.methodRadios().map((r) => r.dataset['methodCode']);
      expect(codes).toEqual(['razorpay']);
      // Nothing here invents Pay Later as a always-available fallback.
      expect(view.text()).not.toContain('Pay Later');
    });

    it('renders a Pay-Later-only configuration', async () => {
      scenario.scenario.set('payment-paylater-only');
      const view = await open();

      expect(view.methodRadios().map((r) => r.dataset['methodCode'])).toEqual(['paylater']);
    });

    it('respects the server display order', async () => {
      const reversed: PaymentMethodDto[] = [
        { ...MOCK_METHOD_RAZORPAY, display_order: 1 },
        { ...MOCK_METHOD_PAY_LATER, display_order: 2 },
      ];
      payment.setEligibleMethods(reversed);
      const view = await open();

      expect(view.methodRadios().map((r) => r.dataset['methodCode'])).toEqual([
        'razorpay',
        'paylater',
      ]);
    });

    // ------------------------------------------------------------ pay later

    it('completes Pay Later without ever verifying', async () => {
      const verify = vi.spyOn(TestBed.inject(PaymentApi), 'verifyPayment');
      const view = await open();

      selectMethod(view.methodRadios(), 'paylater');
      await view.settle();
      view.pay().click();
      await view.settle();

      expect(view.testId('payment-result')?.getAttribute('data-outcome')).toBe('pay-later');
      // Nothing was paid, so there is nothing to verify.
      expect(verify).not.toHaveBeenCalled();
    });

    it('reports Pay Later as unpaid, never as a successful payment', async () => {
      const view = await open();

      selectMethod(view.methodRadios(), 'paylater');
      await view.settle();
      view.pay().click();
      await view.settle();

      expect(view.testId('payment-result-status')?.textContent).toContain('Unpaid');
      expect(view.testId('payment-result-order')?.textContent).toContain(MOCK_SALES_ORDER);
      expect(view.text()).not.toContain('Payment received');
    });

    // ------------------------------------------------------------- razorpay

    it('opens Razorpay with the server order id, key and provider amount', async () => {
      fakeRazorpay.setOutcome('hang');
      const view = await open();

      selectMethod(view.methodRadios(), 'razorpay');
      await view.settle();
      view.pay().click();
      await view.settle();

      expect(fakeRazorpay.opens.length).toBe(1);
      const options = fakeRazorpay.opens[0];
      expect(options.order_id).toBe(MOCK_RAZORPAY_ORDER_ID);
      expect(options.key).toBe(MOCK_RAZORPAY_KEY);
      // Provider units, passed straight through - NOT the 135.00 business amount.
      expect(options.amount).toBe(MOCK_AMOUNT_PAISE);
      expect(options.amount).not.toBe(MOCK_AMOUNT);
    });

    it('never expects a Razorpay key secret', async () => {
      fakeRazorpay.setOutcome('hang');
      const view = await open();

      selectMethod(view.methodRadios(), 'razorpay');
      await view.settle();
      view.pay().click();
      await view.settle();

      const options = fakeRazorpay.opens[0] as unknown as Record<string, unknown>;
      for (const forbidden of ['key_secret', 'secret', 'razorpay_key_secret']) {
        expect(options[forbidden]).toBeUndefined();
      }
    });

    it('verifies with the provider fields, then reports success', async () => {
      const view = await open();

      selectMethod(view.methodRadios(), 'razorpay');
      await view.settle();
      view.pay().click();
      await view.settle();
      await view.settle();

      expect(view.testId('payment-result')?.getAttribute('data-outcome')).toBe('verified');
      expect(view.testId('payment-result-payment-id')?.textContent).toContain(
        FAKE_RAZORPAY_PAYMENT_ID,
      );
      expect(view.testId('payment-result-order')?.textContent).toContain(MOCK_SALES_ORDER);
    });

    it('shows nothing as paid until verification succeeds', async () => {
      const verifySpy = vi
        .spyOn(TestBed.inject(PaymentApi), 'verifyPayment')
        .mockReturnValue(new Observable<never>());
      const view = await open();

      selectMethod(view.methodRadios(), 'razorpay');
      await view.settle();
      view.pay().click();
      await view.settle();
      await view.settle();

      expect(verifySpy).toHaveBeenCalled();
      // The provider callback fired, but the server has not confirmed anything.
      expect(view.testId('payment-result')).toBeNull();
      expect(view.text()).not.toContain('Payment received');
    });

    it('does not display the signature anywhere', async () => {
      const view = await open();

      selectMethod(view.methodRadios(), 'razorpay');
      await view.settle();
      view.pay().click();
      await view.settle();
      await view.settle();

      expect(view.text()).not.toContain('fake-signature-not-a-secret');
      expect(view.root.innerHTML).not.toContain('fake-signature-not-a-secret');
    });

    it('keeps the order and offers a retry when the buyer dismisses the modal', async () => {
      fakeRazorpay.setOutcome('dismiss');
      const view = await open();

      selectMethod(view.methodRadios(), 'razorpay');
      await view.settle();
      view.pay().click();
      await view.settle();
      await view.settle();

      expect(view.testId('payment-dismissed')).not.toBeNull();
      // Still payable: no result, and the button is usable again.
      expect(view.testId('payment-result')).toBeNull();
      expect(view.pay().disabled).toBe(false);
    });

    it('the pay button cannot re-trigger a provider open', async () => {
      fakeRazorpay.setOutcome('hang');
      const view = await open();

      selectMethod(view.methodRadios(), 'razorpay');
      await view.settle();
      view.pay().click();
      await view.settle();
      view.pay().click();
      view.pay().click();
      await view.settle();

      expect(fakeRazorpay.opens.length).toBe(1);
    });

    it('refuses a duplicate provider open even when the button is not what blocked it', async () => {
      // The disabled button is an affordance; this drives the handoff directly, the way
      // a stray callback or a race would. Two open modals against one order is the
      // hazard - the buyer could pay twice.
      fakeRazorpay.setOutcome('hang');
      const view = await open();

      const page = view.page as unknown as {
        openProvider: (order: RazorpayOrderDto) => Promise<void>;
      };
      const order: RazorpayOrderDto = {
        payment_method: 'razorpay',
        razorpay_key: MOCK_RAZORPAY_KEY,
        order_id: MOCK_RAZORPAY_ORDER_ID,
        amount: MOCK_AMOUNT_PAISE,
        currency: 'INR',
        sales_order: MOCK_SALES_ORDER,
        payment_request: 'ACC-PRQ-2026-00002',
      };

      await page.openProvider(order);
      await page.openProvider(order);
      await page.openProvider(order);

      expect(fakeRazorpay.opens.length).toBe(1);
    });

    it('reports a Checkout.js load failure safely', async () => {
      fakeRazorpay.setOutcome('load-failure');
      const view = await open();

      selectMethod(view.methodRadios(), 'razorpay');
      await view.settle();
      view.pay().click();
      await view.settle();
      await view.settle();

      expect(view.testId('payment-action-error')).not.toBeNull();
      expect(view.text()).toContain('could not open the payment window');
      expect(view.testId('payment-result')).toBeNull();
    });

    // ------------------------------------------------------------- failures

    it('treats a retryable provider failure as an order that survived', async () => {
      scenario.scenario.set('payment-provider-error');
      const view = await open();

      selectMethod(view.methodRadios(), 'razorpay');
      await view.settle();
      view.pay().click();
      await view.settle();

      const error = view.testId('payment-action-error');
      expect(error).not.toBeNull();
      // The wording must not suggest the order failed, because it did not.
      expect(view.text()).toContain('order has been saved');
      expect(view.text()).not.toContain('Order creation failed');
      expect(view.testId('payment-preserved-order')?.textContent).toContain(MOCK_SALES_ORDER);
      // And a retry is available.
      expect(view.pay().disabled).toBe(false);
    });

    it('gives a stale payment request its own state and a way back to checkout', async () => {
      scenario.scenario.set('payment-stale');
      const view = await open();

      expect(view.testId('payment-load-error')).not.toBeNull();
      expect(view.text()).toContain('cart changed');
      // This page cannot mint a replacement obligation, so it points at the one that can.
      const link = view.testId('payment-return-to-checkout') as HTMLAnchorElement | null;
      expect(link).not.toBeNull();
      expect(link?.getAttribute('href')).toBe('/checkout');
      expect(view.testId('payment-methods')).toBeNull();
    });

    it('renders a public error state for an invalid token, without redirecting', async () => {
      const view = await open('not-a-real-token');

      expect(view.testId('payment-load-error')).not.toBeNull();
      expect(view.text()).toContain('not valid');
      // Public route: an unusable bearer token is not an authentication failure.
      expect(TestBed.inject(Router).url).toContain('/payment/');
      expect(TestBed.inject(Router).url).not.toContain('/login');
      // And the token itself is never echoed into the error.
      expect(view.testId('payment-load-error')?.textContent).not.toContain('not-a-real-token');
    });

    it('renders a public error state for an expired token', async () => {
      scenario.scenario.set('payment-token-expired');
      const view = await open();

      expect(view.testId('payment-load-error')).not.toBeNull();
      expect(view.text()).toContain('expired');
      expect(view.text()).not.toContain(MOCK_CHECKOUT_TOKEN);
    });

    it('re-reads the authoritative methods when one is refused', async () => {
      scenario.scenario.set('payment-method-ineligible');
      const view = await open();

      expect(view.methodRadios().length).toBe(2);

      selectMethod(view.methodRadios(), 'razorpay');
      await view.settle();
      view.pay().click();
      await view.settle();
      await view.settle();

      expect(view.testId('payment-action-error')).not.toBeNull();
      // The rejected method is gone, replaced by the server's current list.
      expect(view.methodRadios().map((r) => r.dataset['methodCode'])).toEqual(['paylater']);
      // And nothing is left selected, so the refused choice cannot be resubmitted.
      expect(view.pay().disabled).toBe(true);
    });

    // ---------------------------------------------------------- concurrency

    it('sends exactly one process_payment per click', async () => {
      fakeRazorpay.setOutcome('hang');
      const api = TestBed.inject(PaymentApi);
      const spy = vi.spyOn(api, 'processPayment');
      const view = await open();

      selectMethod(view.methodRadios(), 'razorpay');
      await view.settle();
      view.pay().click();
      view.pay().click();
      await view.settle();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('refuses re-entry even when the button is not what blocked it', async () => {
      const api = TestBed.inject(PaymentApi);
      const spy = vi.spyOn(api, 'processPayment').mockReturnValue(new Observable<never>());
      const view = await open();

      selectMethod(view.methodRadios(), 'paylater');
      await view.settle();

      const page = view.page as unknown as { onPay: () => void };
      page.onPay();
      page.onPay();
      page.onPay();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    // ------------------------------------------------------------ lifecycle

    it('survives the source changing from Cart to Sales Order across a reload', async () => {
      // Load one: nothing committed yet.
      fakeRazorpay.setOutcome('dismiss');
      const first = await open();
      expect(first.testId('payment-order-status')).toBeNull();

      selectMethod(first.methodRadios(), 'razorpay');
      await first.settle();
      first.pay().click();
      await first.settle();
      await first.settle();

      // The order is committed and the buyer walked away from the modal.
      expect(first.testId('payment-dismissed')).not.toBeNull();
      expect(payment.isCommitted()).toBe(true);

      // Load two, same token: the server now answers with the order-backed shape.
      await first.reload();

      expect(first.testId('payment-order-status')?.textContent).toContain('Draft');
      expect(first.testId('payment-source-reference')?.textContent).toContain(MOCK_SALES_ORDER);
      expect(first.testId('payment-load-error')).toBeNull();
      // Still payable, and no cart was needed to render any of it.
      expect(first.methodRadios().length).toBeGreaterThan(0);
    });

    // ---------------------------------------------------------- token safety

    it('never persists the token', async () => {
      const view = await open();

      selectMethod(view.methodRadios(), 'paylater');
      await view.settle();
      view.pay().click();
      await view.settle();

      const stored = [
        ...Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`),
        ...Object.keys(sessionStorage).map((k) => `${k}=${sessionStorage.getItem(k)}`),
      ].join('|');
      expect(stored).not.toContain(MOCK_CHECKOUT_TOKEN);
      expect(document.cookie).not.toContain(MOCK_CHECKOUT_TOKEN);
      // The URL is the designed home for it.
      expect(TestBed.inject(Router).url).toContain(MOCK_CHECKOUT_TOKEN);
    });
  });
});

/** Click the radio for a method code, as a buyer would. */
function selectMethod(radios: HTMLInputElement[], methodCode: string): void {
  const radio = radios.find((r) => r.dataset['methodCode'] === methodCode);
  if (radio === undefined) {
    throw new Error(`no method radio for ${methodCode}`);
  }
  radio.click();
}
