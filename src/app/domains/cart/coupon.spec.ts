import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { YOB_API_CONFIG, type YobApiConfig } from '../../foundation/network/yob-api.config';
import { CartApi } from './data/cart.api';
import { CouponCode } from './parts/coupon-code/coupon-code';
import { CartStore } from './state/cart.store';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const GET_CART = '/api/method/yob_storefront.api.cart.get_cart';
const APPLY_COUPON = '/api/method/yob_storefront.api.cart.apply_coupon';
const REMOVE_COUPON = '/api/method/yob_storefront.api.cart.remove_coupon';

const BOLT = 'YOB-BOLT-M10';

/** A cart payload in the canonical `get_cart` shape. */
function cartPayload(
  overrides: { coupon_code?: string | null; coupon_discount?: number; empty?: boolean } = {},
) {
  const items = overrides.empty
    ? []
    : [{ item_code: BOLT, item_name: 'Bolt', quantity: 2, rate: 10, amount: 20 }];

  return {
    cart: {
      name: 'CART-0001',
      currency: 'INR',
      items,
      total_quantity: overrides.empty ? 0 : 2,
      net_total: 20,
      tax_total: 0,
      grand_total: 20,
      total_discount: 5,
      coupon_code: overrides.coupon_code ?? null,
      coupon_discount: overrides.coupon_discount ?? 0,
      is_shippable: 1,
      contact_person: null,
      billing_address: null,
      shipping_address: null,
    },
    contact: null,
    billing_address: null,
    shipping_address: null,
    cart_updated: false,
    removed_items: [],
    price_updated_items: [],
  };
}

function yobError(code: string, status = 422, details?: Record<string, unknown>) {
  return {
    body: { message: { errors: [{ code, detail: 'Server text.', field: 'code', ...(details ? { details } : {}) }] } },
    opts: { status, statusText: 'Unprocessable Entity' },
  };
}

describe('Cart coupon', () => {
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

    it('posts the coupon as `code`, not `coupon_code`', () => {
      api.applyCoupon('SAVE10').subscribe();

      const req = http.expectOne(APPLY_COUPON);
      expect(req.request.method).toBe('POST');
      // The backend signature is apply_coupon(code=None). `coupon_code` is the CART
      // FIELD; sending it answers coupon_code_required.
      expect(req.request.body).toEqual({ code: 'SAVE10' });
      req.flush({ message: { data: {} } });
    });

    it('sends the buyer\'s code un-recased - the server upper-cases it', () => {
      api.applyCoupon('save10').subscribe();

      const req = http.expectOne(APPLY_COUPON);
      expect(req.request.body).toEqual({ code: 'save10' });
      req.flush({ message: { data: {} } });
    });

    it('removes with no fields - the cart holds at most one coupon', () => {
      api.removeCoupon().subscribe();

      const req = http.expectOne(REMOVE_COUPON);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ message: { data: {} } });
    });
  });

  describe('CartStore', () => {
    let store: CartStore;
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: YOB_API_CONFIG, useValue: CONFIG },
        ],
      });
      store = TestBed.inject(CartStore);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('takes the applied coupon from the canonical read, not the mutation reply', () => {
      store.applyCoupon('SAVE10').subscribe();

      // The mutation says SAVE10 was applied...
      http.expectOne(APPLY_COUPON).flush({
        message: { data: { cart: {}, coupon_code: 'SAVE10' }, notice: 'Coupon applied successfully' },
      });
      // ...but the canonical cart is what decides.
      http.expectOne(GET_CART).flush({ message: { data: cartPayload({ coupon_code: 'SAVE10', coupon_discount: 2 }) } });

      expect(store.couponCode()).toBe('SAVE10');
      expect(store.hasCoupon()).toBe(true);
      expect(store.couponDiscount()).toBe(2);
    });

    it('does NOT mark a coupon applied when the mutation succeeds but the cart disagrees', () => {
      // The verified backend defect: applying to an empty cart answers "Coupon applied
      // successfully" while the stored coupon_code stays null. Believing the mutation
      // would show a coupon that does not exist.
      store.applyCoupon('SAVE10').subscribe();

      http.expectOne(APPLY_COUPON).flush({
        message: { data: { cart: {}, coupon_code: 'SAVE10' }, notice: 'Coupon applied successfully' },
      });
      http.expectOne(GET_CART).flush({ message: { data: cartPayload({ coupon_code: null, empty: true }) } });

      expect(store.couponCode()).toBeNull();
      expect(store.hasCoupon()).toBe(false);
    });

    it('never sends a blank code to the server', () => {
      store.applyCoupon('   ').subscribe();

      http.expectNone(APPLY_COUPON);
    });

    it('issues ONE request when apply is called twice in a row', () => {
      store.applyCoupon('SAVE10').subscribe();
      store.applyCoupon('SAVE10').subscribe();

      // Exactly one - expectOne throws if a second was queued.
      http.expectOne(APPLY_COUPON).flush({ message: { data: {} } });
      http.expectOne(GET_CART).flush({ message: { data: cartPayload({ coupon_code: 'SAVE10' }) } });
    });

    it('issues ONE request when remove is called twice in a row', () => {
      store.removeCoupon().subscribe();
      store.removeCoupon().subscribe();

      http.expectOne(REMOVE_COUPON).flush({ message: { data: {} } });
      http.expectOne(GET_CART).flush({ message: { data: cartPayload() } });
    });

    it('reports a pending action while a mutation is in flight', () => {
      store.applyCoupon('SAVE10').subscribe();
      expect(store.couponPending()).toBe('apply');

      http.expectOne(APPLY_COUPON).flush({ message: { data: {} } });
      http.expectOne(GET_CART).flush({ message: { data: cartPayload({ coupon_code: 'SAVE10' }) } });

      expect(store.couponPending()).toBeNull();
    });

    it('keeps the cart and does NOT re-read after a definite refusal', () => {
      store.applyCoupon('NOPE').subscribe();

      const { body, opts } = yobError('coupon_invalid');
      http.expectOne(APPLY_COUPON).flush(body, opts);

      // A definite rejection changed nothing, so there is nothing to reconcile.
      http.expectNone(GET_CART);
      expect(store.couponError()?.code).toBe('coupon_invalid');
      expect(store.hasCoupon()).toBe(false);
      expect(store.couponUnconfirmed()).toBeNull();
    });

    it('recovers from an uncertain apply by READING the cart, never by applying again', () => {
      store.applyCoupon('SAVE10').subscribe();

      http.expectOne(APPLY_COUPON).flush(
        { message: { errors: [{ code: 'internal_server_error', detail: 'x' }] } },
        { status: 500, statusText: 'Server Error' },
      );

      // The recovery is a read. A second apply could double-apply.
      http.expectNone(APPLY_COUPON);
      http.expectOne(GET_CART).flush({ message: { data: cartPayload({ coupon_code: 'SAVE10', coupon_discount: 2 }) } });

      expect(store.couponUnconfirmed()).toBe('refreshed');
      expect(store.couponCode()).toBe('SAVE10');
      // Not presented as a refusal: it may well have worked.
      expect(store.couponError()).toBeNull();
    });

    it('recovers from an uncertain remove by reading the cart', () => {
      store.removeCoupon().subscribe();

      http.expectOne(REMOVE_COUPON).flush(
        { message: { errors: [{ code: 'internal_server_error', detail: 'x' }] } },
        { status: 500, statusText: 'Server Error' },
      );

      http.expectNone(REMOVE_COUPON);
      http.expectOne(GET_CART).flush({ message: { data: cartPayload({ coupon_code: null }) } });

      expect(store.couponUnconfirmed()).toBe('refreshed');
      expect(store.hasCoupon()).toBe(false);
    });

    it('reports `unknown` when even the recovery read fails', () => {
      store.applyCoupon('SAVE10').subscribe();

      http.expectOne(APPLY_COUPON).flush(
        { message: { errors: [{ code: 'internal_server_error', detail: 'x' }] } },
        { status: 500, statusText: 'Server Error' },
      );
      http.expectOne(GET_CART).flush(
        { message: { errors: [{ code: 'internal_server_error', detail: 'x' }] } },
        { status: 500, statusText: 'Server Error' },
      );

      expect(store.couponUnconfirmed()).toBe('unknown');
    });

    it('reads coupon_discount straight off the cart without touching total_discount', () => {
      store.load().subscribe();
      http.expectOne(GET_CART).flush({ message: { data: cartPayload({ coupon_code: 'SAVE10', coupon_discount: 2 }) } });

      // Two independent server-owned figures. Nothing combines them.
      expect(store.couponDiscount()).toBe(2);
      expect(store.cart()?.total_discount).toBe(5);
      expect(store.cart()?.grand_total).toBe(20);
    });
  });

  describe('CouponCode component', () => {
    let fixture: ComponentFixture<CouponCode>;
    let http: HttpTestingController;
    let store: CartStore;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: YOB_API_CONFIG, useValue: CONFIG },
        ],
      });
      http = TestBed.inject(HttpTestingController);
      store = TestBed.inject(CartStore);
      fixture = TestBed.createComponent(CouponCode);
    });

    afterEach(() => http.verify());

    function loadCart(overrides: Parameters<typeof cartPayload>[0] = {}) {
      store.load().subscribe();
      http.expectOne(GET_CART).flush({ message: { data: cartPayload(overrides) } });
      fixture.detectChanges();
    }

    function query(testId: string): HTMLElement | null {
      return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
    }

    it('offers the input form when no coupon is applied', () => {
      loadCart();

      expect(query('cart-coupon-input')).not.toBeNull();
      expect(query('cart-coupon-apply')).not.toBeNull();
      expect(query('cart-coupon-remove')).toBeNull();
    });

    it('shows the SERVER\'s coupon code and a Remove button when applied', () => {
      loadCart({ coupon_code: 'SAVE10', coupon_discount: 2 });

      expect(query('cart-coupon-applied')?.textContent).toContain('SAVE10');
      expect(query('cart-coupon-remove')).not.toBeNull();
      expect(query('cart-coupon-input')).toBeNull();
    });

    it('keeps Apply disabled until something is typed', () => {
      loadCart();

      const apply = query('cart-coupon-apply') as HTMLButtonElement;
      expect(apply.disabled).toBe(true);
    });

    it('applies the typed code, then re-reads the canonical cart', () => {
      loadCart();

      const input = query('cart-coupon-input') as HTMLInputElement;
      input.value = 'SAVE10';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      (query('cart-coupon-apply') as HTMLButtonElement).click();

      const applyReq = http.expectOne(APPLY_COUPON);
      expect(applyReq.request.body).toEqual({ code: 'SAVE10' });
      applyReq.flush({ message: { data: {} } });
      http.expectOne(GET_CART).flush({ message: { data: cartPayload({ coupon_code: 'SAVE10', coupon_discount: 2 }) } });
      fixture.detectChanges();

      expect(query('cart-coupon-applied')?.textContent).toContain('SAVE10');
    });

    it('issues one request for a double-clicked Apply', () => {
      loadCart();

      const input = query('cart-coupon-input') as HTMLInputElement;
      input.value = 'SAVE10';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const apply = query('cart-coupon-apply') as HTMLButtonElement;
      apply.click();
      apply.click();

      http.expectOne(APPLY_COUPON).flush({ message: { data: {} } });
      http.expectOne(GET_CART).flush({ message: { data: cartPayload({ coupon_code: 'SAVE10' }) } });
    });

    it('issues one request for a repeated Enter', () => {
      loadCart();

      const input = query('cart-coupon-input') as HTMLInputElement;
      input.value = 'SAVE10';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit'));
      form.dispatchEvent(new Event('submit'));

      http.expectOne(APPLY_COUPON).flush({ message: { data: {} } });
      http.expectOne(GET_CART).flush({ message: { data: cartPayload({ coupon_code: 'SAVE10' }) } });
    });

    it('shows a localized message for a rejection and keeps the typed code', () => {
      loadCart();

      const input = query('cart-coupon-input') as HTMLInputElement;
      input.value = 'NOPE';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      (query('cart-coupon-apply') as HTMLButtonElement).click();
      const { body, opts } = yobError('coupon_invalid');
      http.expectOne(APPLY_COUPON).flush(body, opts);
      fixture.detectChanges();

      const text: string = fixture.nativeElement.textContent;
      expect(text).toContain('not valid');
      // The server's own English is never rendered.
      expect(text).not.toContain('Server text.');
      // The buyer's code survives so a typo can be corrected.
      expect((query('cart-coupon-input') as HTMLInputElement).value).toBe('NOPE');
    });

    it('does not leak backend detail for a minimum-spend refusal', () => {
      loadCart();

      const input = query('cart-coupon-input') as HTMLInputElement;
      input.value = 'BIGSPEND';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      (query('cart-coupon-apply') as HTMLButtonElement).click();
      const { body, opts } = yobError('coupon_minimum_not_met', 422, { minimum_amount: 100000 });
      http.expectOne(APPLY_COUPON).flush(body, opts);
      fixture.detectChanges();

      const text: string = fixture.nativeElement.textContent;
      expect(text).toContain('below the minimum');
      expect(text).not.toContain('100000');
      expect(text).not.toContain('Server text.');
    });

    it('says "could not confirm" rather than claiming failure after an uncertain apply', () => {
      loadCart();

      const input = query('cart-coupon-input') as HTMLInputElement;
      input.value = 'SAVE10';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      (query('cart-coupon-apply') as HTMLButtonElement).click();
      http.expectOne(APPLY_COUPON).flush(
        { message: { errors: [{ code: 'internal_server_error', detail: 'x' }] } },
        { status: 500, statusText: 'Server Error' },
      );
      http.expectOne(GET_CART).flush({ message: { data: cartPayload({ coupon_code: 'SAVE10', coupon_discount: 2 }) } });
      fixture.detectChanges();

      expect(query('cart-coupon-unconfirmed')).not.toBeNull();
      expect(fixture.nativeElement.textContent).toContain('could not confirm');
      // And the canonical truth is shown regardless.
      expect(query('cart-coupon-applied')?.textContent).toContain('SAVE10');
    });

    it('removes via the canonical read', () => {
      loadCart({ coupon_code: 'SAVE10', coupon_discount: 2 });

      (query('cart-coupon-remove') as HTMLButtonElement).click();

      const removeReq = http.expectOne(REMOVE_COUPON);
      expect(removeReq.request.body).toEqual({});
      removeReq.flush({ message: { data: {} } });
      http.expectOne(GET_CART).flush({ message: { data: cartPayload({ coupon_code: null }) } });
      fixture.detectChanges();

      expect(query('cart-coupon-input')).not.toBeNull();
      expect(query('cart-coupon-applied')).toBeNull();
    });

    it('has a real label associated with the input', () => {
      loadCart();

      const label = fixture.nativeElement.querySelector('label');
      expect(label).not.toBeNull();
      // The design Field projects the control inside the label, so association is
      // implicit and cannot be broken by a mismatched id.
      expect(label.querySelector('input')).not.toBeNull();
    });
  });
});
