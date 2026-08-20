import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { MockServerCart } from '../../../../mock-api/core/mock-server-cart';
import { MockServerSession } from '../../../../mock-api/core/mock-server-session';
import { mockApiInterceptor } from '../../../../mock-api/mock-api.interceptor';
import { routes } from '../../../app.routes';
import { yobCsrfInterceptor } from '../../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../../foundation/network/yob-api.config';
import { SessionStore } from '../../../foundation/session/session.store';
import { CartStore } from '../../cart/state/cart.store';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const BOLT_URL = '/catalog/item/hex-bolt-m10-50';
const BOLT_CODE = 'YOB-BOLT-M10';

/**
 * Item detail's quantity and add-to-cart, through the real route tree.
 *
 * There is no repricing here to test. Since Phase 23B-2 a committed quantity issues no
 * request at all: the price on the page is the backend's standalone preview for its own
 * default quantity, and the transaction rate is settled when the cart is priced as one
 * document. What is pinned below is that committing a quantity changes the number in the
 * box and nothing else.
 */
describe('ItemPage quantity and add to cart', () => {
  let http: HttpTestingController;
  let cart: CartStore;
  let mockCart: MockServerCart;

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
    cart = TestBed.inject(CartStore);
    mockCart = TestBed.inject(MockServerCart);

    TestBed.inject(MockServerSession).signIn('TEST_APP', 'password');
    TestBed.inject(SessionStore).restore().subscribe();
  });

  afterEach(() => http.verify());

  async function open() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(BOLT_URL);
    await harness.fixture.whenStable();
    const root = harness.fixture.nativeElement as HTMLElement;
    return {
      harness,
      root,
      text: () => root.textContent ?? '',
      testId: (id: string) => root.querySelector(`[data-testid="${id}"]`),
      qty: () => root.querySelector('[data-testid="item-quantity"]') as HTMLInputElement,
      addButton: () => root.querySelector('[data-testid="add-to-cart"]') as HTMLButtonElement,
      form: () => root.querySelector('form') as HTMLFormElement,
    };
  }

  /** Type into the quantity box without committing (no blur). */
  async function type(view: Awaited<ReturnType<typeof open>>, value: string) {
    view.qty().value = value;
    view.qty().dispatchEvent(new Event('input'));
    await view.harness.fixture.whenStable();
  }

  /** Commit the quantity, as blur or Enter does. */
  async function commit(view: Awaited<ReturnType<typeof open>>, value: string) {
    view.qty().value = value;
    view.qty().dispatchEvent(new Event('input'));
    view.qty().dispatchEvent(new Event('change'));
    await view.harness.fixture.whenStable();
  }

  describe('quantity control', () => {
    it('is a labelled native number input starting at 1', async () => {
      const view = await open();

      expect(view.qty().tagName).toBe('INPUT');
      expect(view.qty().type).toBe('number');
      expect(view.qty().value).toBe('1');
      expect(view.qty().labels?.[0]?.textContent).toContain('Quantity');
    });

    it('allows fractional input, because the backend does', async () => {
      const view = await open();
      // step="any" - a default step of 1 would block 2.5 in the browser.
      expect(view.qty().getAttribute('step')).toBe('any');
    });

    it('imposes no maximum or stock rule the contract does not define', async () => {
      const view = await open();
      expect(view.qty().getAttribute('max')).toBeNull();
      expect(view.qty().getAttribute('min')).toBeNull();
    });

    it('rejects zero and negative quantities', async () => {
      const view = await open();

      await type(view, '0');
      expect(view.text()).toContain('greater than zero');
      expect(view.addButton().disabled).toBe(true);

      await type(view, '-3');
      expect(view.addButton().disabled).toBe(true);
    });

    it('rejects a blank or unparseable quantity before any request', async () => {
      const view = await open();
      await type(view, '');

      expect(view.addButton().disabled).toBe(true);
      // Nothing was sent: a non-finite value never reaches the API.
      expect(cart.isAdding()).toBe(false);
    });

    it('accepts a fractional quantity', async () => {
      const view = await open();
      await type(view, '2.5');

      expect(view.addButton().disabled).toBe(false);
      expect(view.text()).not.toContain('greater than zero');
    });
  });

  describe('committing a quantity', () => {
    it('keeps the backend preview price, unmultiplied', async () => {
      const view = await open();
      await commit(view, '50');

      // The backend's own per-unit figure, exactly as it arrived: 50 x 11.25 = 562.50 is
      // a transaction total nothing here is entitled to compute or display.
      expect(view.testId('item-rate')?.textContent).toContain('11.25');
      expect(view.testId('item-rate')?.textContent).not.toContain('562');
      expect(view.qty().value).toBe('50');
    });

    it('issues no cart mutation while typing', async () => {
      const view = await open();
      const spy = vi.spyOn(TestBed.inject(CartStore), 'add');

      // Typing alone must not trigger requests; only `change` commits.
      await type(view, '2');
      await type(view, '25');
      await type(view, '250');

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('leaves the price alone when the quantity is invalid', async () => {
      const view = await open();
      await commit(view, '50');
      const priced = view.testId('item-rate')?.textContent;

      await commit(view, '0');

      // The price never depended on the quantity, so a rejected quantity cannot move it.
      expect(view.testId('item-rate')?.textContent).toBe(priced);
    });
  });

  describe('add to cart', () => {
    it('sends the item code and the chosen quantity', async () => {
      const view = await open();
      await commit(view, '4');

      view.form().dispatchEvent(new Event('submit', { cancelable: true }));
      await view.harness.fixture.whenStable();

      expect(cart.lines()[0]?.item_code).toBe(BOLT_CODE);
      expect(cart.lines()[0]?.quantity).toBe(4);
    });

    it('uses the item code, never the slug', async () => {
      const view = await open();
      view.form().dispatchEvent(new Event('submit', { cancelable: true }));
      await view.harness.fixture.whenStable();

      expect(cart.lines()[0]?.item_code).toBe(BOLT_CODE);
      expect(cart.lines()[0]?.item_code).not.toBe('hex-bolt-m10-50');
    });

    it('acknowledges success and offers the cart', async () => {
      const view = await open();
      view.form().dispatchEvent(new Event('submit', { cancelable: true }));
      await view.harness.fixture.whenStable();

      expect(view.testId('add-to-cart-success')).not.toBeNull();
      expect(view.root.querySelector('a[href="/cart"]')).not.toBeNull();
      // No automatic navigation away from the item.
      expect(TestBed.inject(Router).url).toBe(BOLT_URL);
    });

    it('does not send an invalid quantity', async () => {
      const view = await open();
      await type(view, '0');

      view.form().dispatchEvent(new Event('submit', { cancelable: true }));
      await view.harness.fixture.whenStable();

      expect(cart.lines()).toHaveLength(0);
      expect(view.testId('add-to-cart-success')).toBeNull();
    });

    it('shows a safe message when the add fails', async () => {
      const view = await open();
      // Empty the mock catalog of this code so the add 404s.
      vi.spyOn(mockCart, 'findItemByCode').mockReturnValue(undefined);

      view.form().dispatchEvent(new Event('submit', { cancelable: true }));
      await view.harness.fixture.whenStable();

      expect(view.testId('add-to-cart-error')?.textContent).toContain('no longer available');
      expect(view.text()).not.toContain('item_not_found');
      vi.restoreAllMocks();
    });
  });

  describe('a committed quantity does not disrupt the page', () => {
    it('keeps the item and the control on screen', async () => {
      const view = await open();
      await commit(view, '50');

      // The content and the control the user is operating stay put; a full-page
      // spinner would unmount the quantity box mid-edit.
      expect(view.testId('item-title')).not.toBeNull();
      expect(view.qty()).not.toBeNull();
      expect(view.testId('item-loading')).toBeNull();
    });

    it('does not carry one item over to another item', async () => {
      const view = await open();
      await commit(view, '50');
      expect(view.testId('item-title')?.textContent).toContain('Hex Bolt');

      await view.harness.navigateByUrl('/catalog/item/flat-washer-m10');
      await view.harness.fixture.whenStable();

      const root = view.harness.fixture.nativeElement as HTMLElement;
      // Retention is keyed on the slug, so a different item never inherits it.
      expect(root.textContent).not.toContain('Hex Bolt');
      expect(root.textContent).toContain('Flat Washer M10');
    });
  });
});
