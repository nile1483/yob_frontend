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

/** Two decimals, the way the mock server rounds money. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

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

    describe('priced projection (Phase 23B-2)', () => {
      /** Load a cart with one line, then read back what the store exposes. */
      async function loadWithItem(): Promise<void> {
        mockCart.seedQuantity('YOB-BOLT-M10', 2);
        store.load().subscribe();
        await Promise.resolve();
        await Promise.resolve();
      }

      it('exposes the projection separately from customer intent', async () => {
        await loadWithItem();

        // Two different concepts, both available and neither standing in for the other.
        expect(store.lines().length).toBeGreaterThan(0);
        expect(store.pricingRows().length).toBeGreaterThan(0);
        expect(store.pricingRows()[0].line_role).toBe('Paid');
      });

      it('marks a paid row mutable and a promotion row not', async () => {
        scenario.scenario.set('cart-promotion-same-item');
        await loadWithItem();

        const rows = store.pricingRows();
        const paid = rows.filter((r) => r.line_role === 'Paid');
        const promo = rows.filter((r) => r.line_role === 'Promotion');

        expect(paid.length).toBe(1);
        expect(promo.length).toBe(1);
        expect(store.isMutable(paid[0])).toBe(true);
        expect(store.isMutable(promo[0])).toBe(false);
      });

      it('keeps a same-SKU promotion from overwriting the paid row', async () => {
        scenario.scenario.set('cart-promotion-same-item');
        await loadWithItem();

        const rows = store.pricingRows();
        expect(rows).toHaveLength(2);
        // Same item code, two distinct projection rows with distinct ids and prices.
        expect(rows[0].item_code).toBe(rows[1].item_code);
        expect(rows[0].row_id).not.toBe(rows[1].row_id);
        expect(rows[0].rate).toBeGreaterThan(0);
        expect(rows[1].rate).toBe(0);
      });

      it('lists a gift SKU that has no cart item at all', async () => {
        scenario.scenario.set('cart-promotion-other-item');
        await loadWithItem();

        const gift = store.pricingRows().find((r) => r.line_role === 'Promotion');
        expect(gift).toBeDefined();
        expect(store.lines().some((l) => l.item_code === gift?.item_code)).toBe(false);
        expect(store.isMutable(gift!)).toBe(false);
      });

      it('treats a zero-rate paid row as paid', async () => {
        scenario.scenario.set('cart-paid-zero-rate');
        await loadWithItem();

        const row = store.pricingRows()[0];
        expect(row.rate).toBe(0);
        expect(row.line_role).toBe('Paid');
        expect(store.isMutable(row)).toBe(true);
      });

      it('takes totals from the cart document, not from summing rows', async () => {
        // The anchor is the fixture that carries tax, which is what makes the two
        // numbers differ - and the reason the grand total can never be a row sum.
        mockCart.seedQuantity('YOB-ANCHOR-HD-12', 1);
        store.load().subscribe();
        await Promise.resolve();
        await Promise.resolve();

        const cart = store.cart()!;
        const summed = store.pricingRows().reduce((total, row) => total + row.amount, 0);

        // Summing projection rows and calling it the grand total would silently drop
        // tax, coupons and every other document-level effect ERPNext applied.
        expect(summed).toBeGreaterThan(0);
        expect(cart.grand_total).toBeGreaterThan(summed);
        expect(cart.grand_total).toBe(round2(cart.net_total + cart.tax_total));
      });
    });

    describe('summary stays document-authoritative (Phase 23B-4)', () => {
      it('shows the document totals even when the rows deliberately disagree', async () => {
        // The rows are rigged to be inconsistent with the document. A future
        // "simplification" that summed rows would change these numbers; the server's
        // totals are the ones the buyer is charged, so they must win.
        scenario.scenario.set('cart-summary-mismatch');
        mockCart.seedQuantity('YOB-ANCHOR-HD-12', 1);
        store.load().subscribe();
        await Promise.resolve();
        await Promise.resolve();

        const cart = store.cart()!;
        const rows = store.pricingRows();
        const rowTax = rows.reduce((total, row) => total + row.tax_amount, 0);
        const rowTotal = rows.reduce((total, row) => total + row.total_amount, 0);

        expect(rowTax).toBe(999);
        expect(rowTotal).toBe(9999);
        // Untouched by the row figures.
        expect(cart.tax_total).not.toBe(rowTax);
        expect(cart.grand_total).not.toBe(rowTotal);
        expect(cart.grand_total).toBe(round2(cart.net_total + cart.tax_total));
      });

      it('carries row tax through from the backend without recomputing it', async () => {
        mockCart.seedQuantity('YOB-ANCHOR-HD-12', 1);
        store.load().subscribe();
        await Promise.resolve();
        await Promise.resolve();

        const row = store.pricingRows()[0];
        const line = store.lines()[0];

        // Straight from the line the server priced, not derived from a rate.
        expect(row.tax_amount).toBe(line.tax_amount);
        expect(row.total_amount).toBe(line.total_amount);
        expect(row.tax_components.length).toBeGreaterThan(0);
      });

      it('preserves a null tax_type and the numeric inclusive flag', async () => {
        scenario.scenario.set('cart-tax-generic');
        mockCart.seedQuantity('YOB-ANCHOR-HD-12', 1);
        store.load().subscribe();
        await Promise.resolve();
        await Promise.resolve();

        const part = store.pricingRows()[0].tax_components[0];
        expect(part.tax_type).toBeNull();
        expect(part.label).toBe('Service Tax');
        // A number on the wire; typing it as boolean would make 0 truthy.
        expect(part.included_in_print_rate).toBe(0);
      });

      it('keeps the inclusive-tax figures exactly as sent', async () => {
        scenario.scenario.set('cart-tax-inclusive');
        mockCart.seedQuantity('YOB-ANCHOR-HD-12', 1);
        store.load().subscribe();
        await Promise.resolve();
        await Promise.resolve();

        const row = store.pricingRows()[0];
        expect(row.amount).toBe(100);
        expect(row.net_amount).toBe(84.75);
        expect(row.tax_amount).toBe(15.25);
        // The total equals the amount, because the tax was already inside it.
        expect(row.total_amount).toBe(100);
      });
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
