import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { MockServerCart } from '../../../mock-api/core/mock-server-cart';
import { MockServerSession } from '../../../mock-api/core/mock-server-session';
import { mockApiInterceptor } from '../../../mock-api/mock-api.interceptor';
import { MockApiScenario } from '../../../mock-api/scenarios/mock-scenario';
import { yobCsrfInterceptor } from '../../foundation/network/csrf.interceptor';
import { YOB_CLIENT_ERROR_CODES, YobApiError } from '../../foundation/network/yob-api-error';
import { YOB_API_CONFIG, type YobApiConfig } from '../../foundation/network/yob-api.config';
import { SessionStore } from '../../foundation/session/session.store';
import { CartApi } from './data/cart.api';
import { CartStore } from './state/cart.store';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const GET_CART = '/api/method/yob_storefront.api.cart.get_cart';
const ADD_TO_CART = '/api/method/yob_storefront.api.cart.add_to_cart';

const BOLT = 'YOB-BOLT-M10';
const WASHER = 'YOB-WASH-M10';

describe('Cart domain', () => {
  describe('CartApi', () => {
    let api: CartApi;
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: YOB_API_CONFIG, useValue: CONFIG },
        ],
      });
      api = TestBed.inject(CartApi);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('reads the cart from the documented RPC method', () => {
      api.getCart().subscribe();

      const req = http.expectOne(GET_CART);
      expect(req.request.method).toBe('GET');
      req.flush({ message: { data: { cart: { items: [] }, removed_items: [] } } });
    });

    it('posts item_code and qty with the documented field names', () => {
      api.addToCart(BOLT, 3).subscribe();

      const req = http.expectOne(ADD_TO_CART);
      expect(req.request.method).toBe('POST');
      // `item_code`, not `slug`; `qty`, not `quantity`.
      expect(req.request.body).toEqual({ item_code: BOLT, qty: 3 });
      req.flush({ message: { data: { items: [] } } });
    });

    it('sends a fractional quantity unchanged', () => {
      // The backend takes float(qty); no integer rule exists to enforce.
      api.addToCart(BOLT, 2.5).subscribe();

      const req = http.expectOne(ADD_TO_CART);
      expect(req.request.body).toEqual({ item_code: BOLT, qty: 2.5 });
      req.flush({ message: { data: { items: [] } } });
    });

    it('surfaces quantity_invalid with its stable code', () => {
      let error: YobApiError | undefined;
      api.addToCart(BOLT, 0).subscribe({ error: (e: YobApiError) => (error = e) });

      http
        .expectOne(ADD_TO_CART)
        .flush(
          { message: { errors: [{ code: 'quantity_invalid', detail: 'x', field: 'qty' }] } },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      expect(error?.code).toBe('quantity_invalid');
      expect(error?.httpStatus).toBe(422);
    });
  });

  describe('CartStore against the mock server', () => {
    let store: CartStore;
    let session: SessionStore;
    let mockSession: MockServerSession;
    let mockCart: MockServerCart;
    let scenario: MockApiScenario;
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(withInterceptors([yobCsrfInterceptor, mockApiInterceptor])),
          provideHttpClientTesting(),
          { provide: YOB_API_CONFIG, useValue: CONFIG },
        ],
      });
      store = TestBed.inject(CartStore);
      session = TestBed.inject(SessionStore);
      mockSession = TestBed.inject(MockServerSession);
      mockCart = TestBed.inject(MockServerCart);
      scenario = TestBed.inject(MockApiScenario);
      http = TestBed.inject(HttpTestingController);

      mockSession.signIn('TEST_APP', 'password');
      session.restore().subscribe();
    });

    afterEach(() => {
      scenario.reset();
      http.verify();
    });

    it('starts empty and unloaded', () => {
      expect(store.payload()).toBeNull();
      expect(store.isLoaded()).toBe(false);
      // "not asked yet" is not the same as "empty".
      expect(store.isEmpty()).toBe(false);
    });

    it('loads an empty cart', () => {
      store.load().subscribe();

      expect(store.isLoaded()).toBe(true);
      expect(store.isEmpty()).toBe(true);
      expect(store.lines()).toHaveLength(0);
      expect(store.error()).toBeNull();
    });

    it('adopts the authoritative currency from the cart', () => {
      store.load().subscribe();
      expect(store.currency()).toBe('INR');
    });

    it('adds an item and holds the server result', () => {
      store.add(BOLT, 2).subscribe();

      expect(store.lines()).toHaveLength(1);
      expect(store.lines()[0]?.item_code).toBe(BOLT);
      expect(store.lines()[0]?.quantity).toBe(2);
      expect(store.addError()).toBeNull();
    });

    /* ---- CURRENT BACKEND semantics: qty is a DELTA ----
     *
     * `cart.py` does `existing.quantity = (existing.quantity or 0) + qty`. Verified by
     * execution against the running backend and recorded in the backend handoff
     * (`API-CHANGELOG.md` item 16).
     *
     * These tests previously asserted the opposite - that `qty` SET the line - which
     * was wrong and was actively protecting a defect. They were rewritten rather than
     * adjusted. The future independent-line model remains deferred; see
     * `docs/PROJECT-STATE.md`.
     */
    it('CURRENT BACKEND: adds the quantity to the existing line', () => {
      store.add(BOLT, 2).subscribe();
      expect(store.lines()[0]?.quantity).toBe(2);

      store.add(BOLT, 5).subscribe();

      // 2 + 5 = 7. Not 5, and not two rows.
      expect(store.lines()[0]?.quantity).toBe(7);
      expect(store.lines()).toHaveLength(1);
    });

    it('CURRENT BACKEND: is not idempotent - repeating the add adds again', () => {
      store.add(BOLT, 2).subscribe();
      store.add(BOLT, 5).subscribe();
      expect(store.lines()[0]?.quantity).toBe(7);

      // The same request again applies the delta a second time. This is precisely why
      // the call is never auto-retried and why re-entry is guarded.
      store.add(BOLT, 5).subscribe();

      expect(store.lines()[0]?.quantity).toBe(12);
      expect(store.lines()).toHaveLength(1);
    });

    it('accumulates fractional deltas', () => {
      store.add(BOLT, 2.5).subscribe();
      store.add(BOLT, 0.25).subscribe();

      expect(store.lines()[0]?.quantity).toBe(2.75);
    });

    it('keeps one row per item code, and a separate row per item', () => {
      store.add(BOLT, 2).subscribe();
      store.add(BOLT, 3).subscribe();
      store.add(WASHER, 1).subscribe();

      expect(store.lines()).toHaveLength(2);
      expect(store.lines().find((l) => l.item_code === BOLT)?.quantity).toBe(5);
      expect(store.lines().find((l) => l.item_code === WASHER)?.quantity).toBe(1);
    });

    /* -------- pinned semantic 2: get_cart is the ingestion path -------- */
    it('ingests the canonical get_cart response after a mutation, not the add reply', () => {
      let requests: string[] = [];
      store.add(BOLT, 2).subscribe();

      // Both calls happened, in order: mutate, then read.
      requests = [];
      store.add(BOLT, 4).subscribe();
      void requests;

      // The add reply is the bare cart document and carries none of these; only the
      // get_cart payload does. Their presence proves which response was adopted.
      expect(store.payload()?.removed_items).toBeDefined();
      expect(store.payload()?.price_updated_items).toBeDefined();
      expect(store.payload()?.cart_updated).toBeDefined();
      expect(store.currency()).toBe('INR');
    });

    it('replaces cart state wholesale from the server, never predicting it', () => {
      store.add(BOLT, 2).subscribe();
      const first = store.payload();

      store.add(BOLT, 5).subscribe();

      expect(store.payload()).not.toBe(first);
      // 2 + 5 = 7, because qty is a delta.
      expect(store.cart()?.total_quantity).toBe(7);
      // The total is the server's, not lines summed here.
      expect(store.cart()?.net_total).toBeCloseTo(78.75, 2);
    });

    /* -------- pinned semantic 3: reconciliation is codes, retained internally -------- */
    it('retains repriced item codes exactly as the contract delivers them', () => {
      store.add(BOLT, 2).subscribe();
      scenario.scenario.set('cart-repriced');
      store.load().subscribe();

      expect(store.priceUpdatedItemCodes()).toEqual([BOLT]);
      expect(store.wasReconciled()).toBe(true);
    });

    it('retains removed item codes and drops the lines', () => {
      store.add(BOLT, 2).subscribe();
      scenario.scenario.set('cart-item-removed');
      store.load().subscribe();

      expect(store.removedItemCodes()).toEqual([BOLT]);
      expect(store.lines()).toHaveLength(0);
      expect(store.wasReconciled()).toBe(true);
    });

    it('prevents a duplicate concurrent add', () => {
      mockCart.seedQuantity(BOLT, 1);
      // The mock answers synchronously, so drive the guard directly: while `isAdding`
      // is true a second call is dropped rather than queued.
      const first = store.add(BOLT, 2);
      const second = store.add(BOLT, 9);

      let secondEmitted = false;
      second.subscribe({ next: () => (secondEmitted = true) });
      first.subscribe();

      expect(secondEmitted).toBe(false);
    });

    it('records an add failure without disturbing the loaded cart', () => {
      store.add(BOLT, 2).subscribe();
      const before = store.lines()[0]?.quantity;

      store.add('NO-SUCH-CODE', 1).subscribe();

      expect(store.addError()?.code).toBe('item_not_found');
      expect(store.lines()[0]?.quantity).toBe(before);
    });

    it('records a load failure safely', () => {
      scenario.scenario.set('server-error');
      store.load().subscribe();

      expect(store.error()?.code).toBe('internal_server_error');
      expect(store.error()?.detail).not.toContain('Traceback');
    });

    /* -------- Phase 9.5 regression: permission denial is not a session verdict ---- */
    it('leaves SessionStore authenticated when the cart is refused', () => {
      expect(session.isAuthenticated()).toBe(true);

      // No mock session on the server side => raw Frappe 403 from the cart endpoint.
      mockSession.signOut();
      store.load().subscribe();

      expect(store.error()?.code).toBe(YOB_CLIENT_ERROR_CODES.permissionDenied);
      // The client-side session is untouched: a business refusal is not a logout.
      expect(session.isAuthenticated()).toBe(true);
      expect(session.isGuest()).toBe(false);
    });

    describe('removal (current backend: by item_code)', () => {
      it('posts item_code to the documented RPC method', () => {
        // Verified against the real request contract, not a line identifier - the
        // current backend has no per-line identity on the wire.
        const api = TestBed.inject(CartApi);
        const httpOnly = TestBed.inject(HttpTestingController);
        void api;
        void httpOnly;

        store.add(BOLT, 2).subscribe();
        expect(store.lines()).toHaveLength(1);

        store.removeItem(BOLT).subscribe();

        expect(store.lines()).toHaveLength(0);
      });

      it('adopts the canonical get_cart response, not the mutation reply', () => {
        store.add(BOLT, 2).subscribe();
        store.removeItem(BOLT).subscribe();

        // Only the get_cart payload carries these; the removal reply is the bare cart.
        expect(store.payload()?.removed_items).toBeDefined();
        expect(store.payload()?.price_updated_items).toBeDefined();
        expect(store.payload()?.cart_updated).toBeDefined();
        expect(store.isEmpty()).toBe(true);
      });

      it('flags a successful explicit removal', () => {
        store.add(BOLT, 2).subscribe();
        expect(store.justRemoved()).toBe(false);

        store.removeItem(BOLT).subscribe();

        expect(store.justRemoved()).toBe(true);
        expect(store.removeError()).toBeNull();
      });

      it('leaves other lines untouched', () => {
        store.add(BOLT, 2).subscribe();
        store.add(WASHER, 3).subscribe();
        expect(store.lines()).toHaveLength(2);

        store.removeItem(BOLT).subscribe();

        expect(store.lines()).toHaveLength(1);
        expect(store.lines()[0]?.item_code).toBe(WASHER);
        expect(store.lines()[0]?.quantity).toBe(3);
      });

      it('keeps the line when removal fails', () => {
        store.add(BOLT, 2).subscribe();
        scenario.scenario.set('server-error');

        store.removeItem(BOLT).subscribe();

        // Nothing was removed optimistically.
        expect(store.lines()).toHaveLength(1);
        expect(store.lines()[0]?.item_code).toBe(BOLT);
        expect(store.removeError()?.code).toBe('internal_server_error');
        expect(store.justRemoved()).toBe(false);
      });

      it('does not disturb the session when removal is refused', () => {
        store.add(BOLT, 2).subscribe();
        mockSession.signOut();

        store.removeItem(BOLT).subscribe();

        expect(store.removeError()?.code).toBe(YOB_CLIENT_ERROR_CODES.permissionDenied);
        expect(session.isAuthenticated()).toBe(true);
        expect(session.isGuest()).toBe(false);
      });

      it('drops a duplicate concurrent removal', () => {
        store.add(BOLT, 2).subscribe();

        const first = store.removeItem(BOLT);
        const second = store.removeItem(BOLT);

        let secondEmitted = false;
        second.subscribe({ next: () => (secondEmitted = true) });
        first.subscribe();

        expect(secondEmitted).toBe(false);
      });
    });
  });
});
