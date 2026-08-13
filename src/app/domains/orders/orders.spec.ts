import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { MockServerSession } from '../../../mock-api/core/mock-server-session';
import {
  MOCK_ORDER_CANCELLED,
  MOCK_ORDER_PAID,
  MOCK_ORDER_UNPAID,
} from '../../../mock-api/fixtures/orders.fixture';
import { mockApiInterceptor } from '../../../mock-api/mock-api.interceptor';
import { MockApiScenario } from '../../../mock-api/scenarios/mock-scenario';
import { routes } from '../../app.routes';
import { yobCsrfInterceptor } from '../../foundation/network/csrf.interceptor';
import { YobApiError } from '../../foundation/network/yob-api-error';
import { YOB_API_CONFIG, type YobApiConfig } from '../../foundation/network/yob-api.config';
import { SessionStore } from '../../foundation/session/session.store';
import { OrdersApi } from './data/orders.api';
import { orderStatusLabel } from './orders.status';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const GET_ORDERS = '/api/method/yob_storefront.api.order.get_orders';
const GET_ORDER_DETAILS = '/api/method/yob_storefront.api.order.get_order_details';

describe('Orders', () => {
  // ==================================================================== API

  describe('OrdersApi', () => {
    let api: OrdersApi;
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: YOB_API_CONFIG, useValue: CONFIG },
        ],
      });
      api = TestBed.inject(OrdersApi);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('reads the list from the documented RPC method, with no parameters', () => {
      api.getOrders().subscribe();

      const req = http.expectOne((r) => r.url === GET_ORDERS);
      expect(req.request.method).toBe('GET');
      // The endpoint accepts nothing: no page, no limit, no filter, no sort. Sending
      // one would be inventing a capability.
      expect(req.request.params.keys()).toEqual([]);
      req.flush({ message: { data: [], meta: { count: 0 } } });
    });

    it('looks a detail up by order_id, using the Sales Order name', () => {
      api.getOrderDetails('SAL-ORD-2026-00001').subscribe();

      const req = http.expectOne((r) => r.url === GET_ORDER_DETAILS);
      expect(req.request.method).toBe('GET');
      // `order_id` is the record name - there is no separate display number.
      expect(req.request.params.get('order_id')).toBe('SAL-ORD-2026-00001');
      req.flush({ message: { data: { name: 'SAL-ORD-2026-00001' } } });
    });

    it('never reaches for a generic Frappe resource endpoint', () => {
      api.getOrders().subscribe();
      api.getOrderDetails('X').subscribe();

      // Ownership is enforced by the storefront API. `/api/resource/Sales Order` would
      // bypass that and is not something a storefront customer may read anyway.
      http.expectNone((r) => r.url.includes('/api/resource/'));
      http.expectOne((r) => r.url === GET_ORDERS).flush({ message: { data: [] } });
      http.expectOne((r) => r.url === GET_ORDER_DETAILS).flush({ message: { data: {} } });
    });

    it('surfaces order_not_found with its stable code', () => {
      let error: YobApiError | undefined;
      api.getOrderDetails('nope').subscribe({ error: (e: YobApiError) => (error = e) });

      http
        .expectOne((r) => r.url === GET_ORDER_DETAILS)
        .flush(
          { message: { errors: [{ code: 'order_not_found', detail: 'x', field: 'order_id' }] } },
          { status: 404, statusText: 'Not Found' },
        );

      expect(error?.code).toBe('order_not_found');
    });
  });

  // ============================================================ status mapping

  describe('buyer-facing status', () => {
    it('never shows a paid order as "Draft"', () => {
      // Every real order on the bench is Draft, two of them paid by real Razorpay
      // transactions. "Draft" is an ERPNext submit state, not a buyer-meaningful one.
      const label = orderStatusLabel('Draft');

      expect(label).not.toContain('Draft');
      expect(label).toBe('Order received');
    });

    it('maps the whole ERPNext vocabulary without echoing it', () => {
      const vocabulary = [
        'Draft',
        'On Hold',
        'To Pay',
        'To Deliver and Bill',
        'To Bill',
        'To Deliver',
        'Completed',
        'Cancelled',
        'Closed',
      ];

      for (const status of vocabulary) {
        const label = orderStatusLabel(status);
        expect(label.length).toBeGreaterThan(0);
        // Only the words that are genuinely buyer-facing survive unchanged.
        if (!['Completed', 'Cancelled', 'Closed'].includes(status)) {
          expect(label).not.toBe(status);
        }
      }
    });
  });

  // =================================================================== pages

  describe('pages', () => {
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
      scenario = TestBed.inject(MockApiScenario);
      TestBed.inject(MockServerSession).signIn('TEST_APP', 'password');
      TestBed.inject(SessionStore).restore().subscribe();
    });

    afterEach(() => scenario.reset());

    async function open(url: string) {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(url);
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
      const root = harness.fixture.nativeElement as HTMLElement;

      return {
        root,
        text: () => root.textContent ?? '',
        testId: (id: string) => root.querySelector(`[data-testid="${id}"]`),
        all: (id: string) => Array.from(root.querySelectorAll(`[data-testid="${id}"]`)),
      };
    }

    // ------------------------------------------------------------------ list

    it('lists the buyer orders', async () => {
      const view = await open('/orders');

      expect(view.testId('orders-list')).not.toBeNull();
      expect(view.all('order-row')).toHaveLength(3);
      expect(view.testId('order-row-name')?.textContent).toContain(MOCK_ORDER_PAID);
    });

    it('links each row by the order name', async () => {
      const view = await open('/orders');

      const first = view.testId('order-row') as HTMLAnchorElement;
      // A real anchor, so it is keyboard reachable and openable in a new tab.
      expect(first.tagName).toBe('A');
      expect(first.getAttribute('href')).toBe(`/orders/${MOCK_ORDER_PAID}`);
    });

    it('shows mapped status wording, never the raw backend value', async () => {
      const view = await open('/orders');

      expect(view.testId('order-row-status')?.textContent).toContain('Order received');
      expect(view.text()).not.toContain('Draft');
      // And nothing internal leaks.
      expect(view.text()).not.toContain('docstatus');
      expect(view.text()).not.toContain('modified_by');
    });

    it('shows the empty state rather than an error when there are no orders', async () => {
      scenario.scenario.set('empty');
      const view = await open('/orders');

      expect(view.testId('orders-empty')).not.toBeNull();
      expect(view.testId('orders-error')).toBeNull();
      expect(view.text()).toContain('no orders yet');
    });

    it('reports a list failure safely', async () => {
      scenario.scenario.set('server-error');
      const view = await open('/orders');

      expect(view.testId('orders-error')).not.toBeNull();
      expect(view.text()).not.toContain('internal_server_error');
      expect(view.text()).not.toContain('Traceback');
    });

    // ---------------------------------------------------------------- detail

    it('renders a paid order in full', async () => {
      const view = await open(`/orders/${MOCK_ORDER_PAID}`);

      expect(view.testId('order-name')?.textContent).toContain(MOCK_ORDER_PAID);
      expect(view.testId('order-status')?.textContent).toContain('Order received');
      expect(view.testId('order-payment-status')?.textContent).toContain('Paid');
      expect(view.all('order-line')).toHaveLength(1);
      expect(view.testId('order-grand-total')?.textContent).toContain('1,350');
      expect(view.testId('order-billing')).not.toBeNull();
    });

    it('shows the server totals, not sums of the lines', async () => {
      const view = await open(`/orders/${MOCK_ORDER_PAID}`);

      // subtotal 1350 and discount 150 are both the backend's; a page that summed the
      // single 1350 line would have no discount to show.
      expect(view.testId('order-subtotal')?.textContent).toContain('1,350');
      expect(view.testId('order-discount')?.textContent).toContain('150');
    });

    it('shows shipping when the order carries one', async () => {
      const view = await open(`/orders/${MOCK_ORDER_PAID}`);
      expect(view.testId('order-shipping')).not.toBeNull();
    });

    it('omits shipping entirely when the order has none', async () => {
      // Split from the test above: only one router harness may exist per test.
      const view = await open(`/orders/${MOCK_ORDER_UNPAID}`);

      expect(view.testId('order-billing')).not.toBeNull();
      // Absent, not an empty block.
      expect(view.testId('order-shipping')).toBeNull();
    });

    it('treats an order with no payment logs as awaiting payment', async () => {
      const view = await open(`/orders/${MOCK_ORDER_UNPAID}`);

      expect(view.testId('order-payment-status')?.textContent).toContain('Awaiting payment');
      // No captured payment, so no payment section at all.
      expect(view.testId('order-payment')).toBeNull();
    });

    it('does not call a failed payment attempt "paid"', async () => {
      // The cancelled order carries a payment id whose provider status is `failed`.
      const view = await open(`/orders/${MOCK_ORDER_CANCELLED}`);

      expect(view.testId('order-payment-status')?.textContent).toContain('Awaiting payment');
      expect(view.testId('order-payment-status')?.textContent).not.toContain('Paid');
      expect(view.testId('order-status')?.textContent).toContain('Cancelled');
      // The failed attempt's reference is not surfaced as if it were a receipt.
      expect(view.text()).not.toContain('pay_EXAMPLE0002');
    });

    it('shows the captured payment reference on a paid order', async () => {
      const view = await open(`/orders/${MOCK_ORDER_PAID}`);

      expect(view.testId('order-payment-reference')?.textContent).toContain('pay_EXAMPLE0001');
      expect(view.testId('order-payment-method')?.textContent).toContain('netbanking');
    });

    it('renders item names as text, since no slug exists to link with', async () => {
      const view = await open(`/orders/${MOCK_ORDER_PAID}`);

      const name = view.testId('order-line-name');
      expect(name?.textContent).toContain('Hex Bolt');
      // Constructing a catalog route from a display name would be a guess.
      expect(name?.querySelector('a')).toBeNull();
    });

    // -------------------------------------------------------------- security

    it('treats an unknown order and another customer order identically', async () => {
      const view = await open('/orders/SAL-ORD-SOMEONE-ELSE');

      expect(view.testId('order-not-found')).not.toBeNull();
      // Wording that distinguished the two would hand back what the backend withheld.
      expect(view.text()).toContain('could not find this order on your account');
      expect(view.text()).not.toContain('belongs to');
      expect(view.text()).not.toContain('another customer');
    });

    it('keeps the session when an order is refused', async () => {
      const session = TestBed.inject(SessionStore);
      await open('/orders/SAL-ORD-SOMEONE-ELSE');

      // Business refusal, not a session failure - Phase 9.5 semantics.
      expect(session.isAuthenticated()).toBe(true);
      expect(session.status()).toBe('authenticated');
    });

    it('renders no backend detail on a detail failure', async () => {
      scenario.scenario.set('server-error');
      const view = await open(`/orders/${MOCK_ORDER_PAID}`);

      expect(view.testId('order-error')).not.toBeNull();
      expect(view.text()).not.toContain('correlation_id');
      expect(view.text()).not.toContain('Traceback');
    });

    // ---------------------------------------------------------------- guards

    it('is reachable only with a session', async () => {
      // The orders route lives in the secure branch; a guest is sent to sign in.
      TestBed.inject(MockServerSession).signOut();
      TestBed.inject(SessionStore).restore().subscribe();

      await open('/orders');

      expect(TestBed.inject(Router).url).toContain('/login');
    });
  });
});
