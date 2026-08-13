import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable } from 'rxjs';

import { MockServerCart } from '../../../mock-api/core/mock-server-cart';
import { MockServerSession } from '../../../mock-api/core/mock-server-session';
import { mockApiInterceptor } from '../../../mock-api/mock-api.interceptor';
import { MockApiScenario } from '../../../mock-api/scenarios/mock-scenario';
import { routes } from '../../app.routes';
import { yobCsrfInterceptor } from '../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../foundation/network/yob-api.config';
import { SessionStore } from '../../foundation/session/session.store';
import { ItemPage } from '../catalog/pages/item-page';
import { CartApi } from './data/cart.api';
import { CartStore } from './state/cart.store';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const ADD_TO_CART = '/api/method/yob_storefront.api.cart.add_to_cart';
const GET_CART = '/api/method/yob_storefront.api.cart.get_cart';
const BOLT = 'YOB-BOLT-M10';
const BOLT_SLUG = 'hex-bolt-m10-50';

/**
 * `add_to_cart` semantics, pinned end to end.
 *
 * The backend adds `qty` to the existing line and the call is not idempotent. An
 * earlier phase of this frontend asserted the opposite, so these exist to make the
 * correct rule hard to un-learn.
 */
describe('add_to_cart is a non-idempotent delta', () => {
  describe('through the item page', () => {
    let mockCart: MockServerCart;
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
      mockCart = TestBed.inject(MockServerCart);
      scenario = TestBed.inject(MockApiScenario);
      TestBed.inject(MockServerSession).signIn('TEST_APP', 'password');
      TestBed.inject(SessionStore).restore().subscribe();
    });

    afterEach(() => {
      scenario.reset();
      mockCart.reset();
    });

    async function openItem() {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/catalog/item/${BOLT_SLUG}`);
      await harness.fixture.whenStable();
      const root = harness.fixture.nativeElement as HTMLElement;

      const settle = async () => {
        for (let i = 0; i < 4; i++) {
          await Promise.resolve();
        }
        harness.fixture.detectChanges();
        await harness.fixture.whenStable();
        harness.fixture.detectChanges();
      };
      await settle();

      return {
        settle,
        root,
        text: () => root.textContent ?? '',
        page: harness.fixture.debugElement.query(By.directive(ItemPage))
          .componentInstance as ItemPage,
        quantity: () => root.querySelector('[data-testid="item-quantity"]') as HTMLInputElement,
        addButton: () => root.querySelector('[data-testid="add-to-cart"]') as HTMLButtonElement,
        form: () => root.querySelector('form') as HTMLFormElement,
        testId: (id: string) => root.querySelector(`[data-testid="${id}"]`),
      };
    }

    /** Type a quantity the way a buyer does, committing it with a change event. */
    async function enterQuantity(
      view: { quantity: () => HTMLInputElement; settle: () => Promise<void> },
      value: string,
    ) {
      const input = view.quantity();
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await view.settle();
    }

    it('treats the entered quantity as the amount to add, not a target total', async () => {
      // A cart that already holds two of this item.
      mockCart.seedQuantity(BOLT, 2);

      const view = await openItem();
      await enterQuantity(view, '5');
      view.addButton().click();
      await view.settle();

      const store = TestBed.inject(CartStore);
      // 2 + 5 = 7. Not 5 (a target), and not 3 (a locally computed delta).
      expect(store.lines()[0]?.quantity).toBe(7);
      expect(store.lines()).toHaveLength(1);
    });

    it('sends the buyer input verbatim, computing no delta of its own', async () => {
      mockCart.seedQuantity(BOLT, 2);
      const api = TestBed.inject(CartApi);
      const spy = vi.spyOn(api, 'addToCart');

      const view = await openItem();
      await enterQuantity(view, '5');
      view.addButton().click();
      await view.settle();

      // Never `desired - existing`. The input IS the delta.
      expect(spy).toHaveBeenCalledWith(BOLT, 5);
    });

    it('says the quantity is what gets added', async () => {
      const view = await openItem();
      // The label previously read just "Quantity", which reads as a target on a page
      // showing an item rather than a cart line.
      expect(view.text()).toContain('Quantity to add');
    });

    it('adds again on a second visit, reaching 12', async () => {
      mockCart.seedQuantity(BOLT, 2);

      const view = await openItem();
      await enterQuantity(view, '5');
      view.addButton().click();
      await view.settle();
      expect(TestBed.inject(CartStore).lines()[0]?.quantity).toBe(7);

      view.addButton().click();
      await view.settle();

      expect(TestBed.inject(CartStore).lines()[0]?.quantity).toBe(12);
    });

    // ------------------------------------------------------------ concurrency

    it('issues one request for a double click', async () => {
      const api = TestBed.inject(CartApi);
      const spy = vi.spyOn(api, 'addToCart').mockReturnValue(new Observable<never>());

      const view = await openItem();
      view.addButton().click();
      view.addButton().click();
      view.addButton().click();
      await view.settle();

      // Each duplicate would add the delta again.
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('issues one request for repeated keyboard submits', async () => {
      const api = TestBed.inject(CartApi);
      const spy = vi.spyOn(api, 'addToCart').mockReturnValue(new Observable<never>());

      const view = await openItem();
      // Enter in a form submits it; holding Enter repeats the submit event.
      for (let i = 0; i < 3; i++) {
        view.form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
      await view.settle();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('marks the button busy while an add is in flight', async () => {
      const api = TestBed.inject(CartApi);
      vi.spyOn(api, 'addToCart').mockReturnValue(new Observable<never>());

      const view = await openItem();
      expect(view.addButton().disabled).toBe(false);

      view.addButton().click();
      await view.settle();

      expect(view.addButton().disabled).toBe(true);
      expect(view.addButton().getAttribute('aria-busy')).toBe('true');
    });
  });

  // ================================================================== transport

  describe('at the transport boundary', () => {
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

    it('never retries the add automatically', () => {
      store.add(BOLT, 5).subscribe();

      // A network failure - the classic trigger for a retry operator.
      http.expectOne(ADD_TO_CART).error(new ProgressEvent('network error'));

      // Exactly one add was ever issued. A retry here could add the delta twice, and
      // the buyer would have no way to know.
      http.expectNone(ADD_TO_CART);
    });

    it('recovers by reading the cart when the outcome is unknown', () => {
      store.add(BOLT, 5).subscribe();
      http.expectOne(ADD_TO_CART).error(new ProgressEvent('network error'));

      // A read, not another add: repeating a read is safe.
      const recovery = http.expectOne(GET_CART);
      recovery.flush({
        message: {
          data: {
            cart: { name: 'C', currency: 'INR', items: [{ item_code: BOLT, quantity: 7 }] },
            removed_items: [],
            price_updated_items: [],
            cart_updated: false,
          },
        },
      });

      expect(store.addUnconfirmed()).toBe('refreshed');
      // Ingested, so the buyer sees what the server actually holds.
      expect(store.lines()[0]?.quantity).toBe(7);
      // And it is not reported as a refusal, because we do not know that it was one.
      expect(store.addError()).toBeNull();
      http.verify();
    });

    it('admits it knows nothing when recovery also fails', () => {
      store.add(BOLT, 5).subscribe();
      http.expectOne(ADD_TO_CART).error(new ProgressEvent('network error'));
      http.expectOne(GET_CART).error(new ProgressEvent('network error'));

      expect(store.addUnconfirmed()).toBe('unknown');
      expect(store.addError()).toBeNull();
      // Still no second add.
      http.expectNone(ADD_TO_CART);
      http.verify();
    });

    it('treats a server fault as uncertain too', () => {
      store.add(BOLT, 5).subscribe();

      // The request was accepted; the failure happened afterwards. The delta may have
      // applied before the fault.
      http
        .expectOne(ADD_TO_CART)
        .flush(
          { message: { errors: [{ code: 'internal_server_error', detail: 'x' }] } },
          { status: 500, statusText: 'Internal Server Error' },
        );

      http.expectOne(GET_CART).flush({
        message: {
          data: { cart: { items: [] }, removed_items: [], price_updated_items: [] },
        },
      });

      expect(store.addUnconfirmed()).toBe('refreshed');
      http.verify();
    });

    it('does NOT re-read the cart after a definite refusal', () => {
      store.add(BOLT, 0).subscribe();

      // The server received the request and rejected it. Nothing was applied, so
      // there is nothing to recover and no reason to spend a request finding out.
      http
        .expectOne(ADD_TO_CART)
        .flush(
          { message: { errors: [{ code: 'quantity_invalid', detail: 'x', field: 'qty' }] } },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      expect(store.addError()?.code).toBe('quantity_invalid');
      expect(store.addUnconfirmed()).toBeNull();
      http.expectNone(GET_CART);
      http.verify();
    });

    it('treats a permission refusal as definite', () => {
      store.add(BOLT, 5).subscribe();

      http
        .expectOne(ADD_TO_CART)
        .flush(
          { exc_type: 'PermissionError', exc: '["traceback"]' },
          { status: 403, statusText: 'Forbidden' },
        );

      expect(store.addError()).not.toBeNull();
      expect(store.addUnconfirmed()).toBeNull();
      http.expectNone(GET_CART);
      http.verify();
    });
  });
});
