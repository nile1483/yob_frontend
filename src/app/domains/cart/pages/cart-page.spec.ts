import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { MockServerCart } from '../../../../mock-api/core/mock-server-cart';
import { MockServerSession } from '../../../../mock-api/core/mock-server-session';
import { mockApiInterceptor } from '../../../../mock-api/mock-api.interceptor';
import { MockApiScenario } from '../../../../mock-api/scenarios/mock-scenario';
import { routes } from '../../../app.routes';
import { yobCsrfInterceptor } from '../../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../../foundation/network/yob-api.config';
import { SessionStore } from '../../../foundation/session/session.store';
import { answerRouteContent } from '../../content/route-content.testing';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const BOLT = 'YOB-BOLT-M10';

describe('CartPage', () => {
  let http: HttpTestingController;
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
    http = TestBed.inject(HttpTestingController);
    mockCart = TestBed.inject(MockServerCart);
    scenario = TestBed.inject(MockApiScenario);

    TestBed.inject(MockServerSession).signIn('TEST_APP', 'password');
    TestBed.inject(SessionStore).restore().subscribe();
  });

  afterEach(() => {
    scenario.reset();
    answerRouteContent(http);
    http.verify();
  });

  async function open() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/cart');
    await harness.fixture.whenStable();
    const root = harness.fixture.nativeElement as HTMLElement;
    return {
      harness,
      root,
      text: () => root.textContent ?? '',
      testId: (id: string) => root.querySelector(`[data-testid="${id}"]`),
      all: (id: string) => root.querySelectorAll(`[data-testid="${id}"]`),
    };
  }

  it('shows an empty cart', async () => {
    const view = await open();

    expect(view.testId('cart-empty')).not.toBeNull();
    expect(view.text()).toContain('Your cart is empty');
    expect(view.testId('cart-lines')).toBeNull();
  });

  it('renders server-authoritative lines and totals', async () => {
    mockCart.seedQuantity(BOLT, 4);
    const view = await open();

    expect(view.all('cart-line')).toHaveLength(1);
    expect(view.text()).toContain('Hex Bolt M10 x 50mm');
    expect(view.testId('cart-line-quantity')?.textContent).toContain('4');
    expect(view.testId('cart-line-rate')?.textContent).toContain('11.25');
    // 4 x 11.25 - computed by the mock server, displayed here.
    expect(view.testId('cart-line-amount')?.textContent).toContain('45.00');
  });

  it('shows the summary totals the server reported', async () => {
    mockCart.seedQuantity(BOLT, 4);
    const view = await open();

    expect(view.testId('cart-total-quantity')?.textContent).toContain('4');
    expect(view.testId('cart-net-total')?.textContent).toContain('45.00');
    expect(view.testId('cart-grand-total')?.textContent).toContain('45.00');
  });

  it('formats amounts in the currency the cart supplied', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    // From `cart.currency`, not the environment fallback.
    expect(view.testId('cart-grand-total')?.textContent).toMatch(/₹/);
  });

  it('links a line back to its item', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    expect(view.testId('cart-line-link')?.getAttribute('href')).toBe(
      '/catalog/item/hex-bolt-m10-50',
    );
  });

  it('explains repriced lines without naming item codes', async () => {
    mockCart.seedQuantity(BOLT, 2);
    scenario.scenario.set('cart-repriced');
    const view = await open();

    const notice = view.testId('cart-reconciliation');
    expect(notice?.textContent).toContain('prices in your cart were updated');
    // The contract gives codes; a buyer cannot act on `YOB-BOLT-M10`.
    expect(notice?.textContent).not.toContain(BOLT);
  });

  it('explains removed lines without naming item codes', async () => {
    mockCart.seedQuantity(BOLT, 2);
    scenario.scenario.set('cart-item-removed');
    const view = await open();

    const notice = view.testId('cart-reconciliation');
    expect(notice?.textContent).toContain('no longer available');
    expect(notice?.textContent).not.toContain(BOLT);
  });

  it('shows no reconciliation notice for an ordinary cart', async () => {
    mockCart.seedQuantity(BOLT, 2);
    const view = await open();

    expect(view.testId('cart-reconciliation')).toBeNull();
  });

  it('fails safely when the cart cannot be loaded', async () => {
    scenario.scenario.set('server-error');
    const view = await open();

    expect(view.testId('cart-error')).not.toBeNull();
    expect(view.text()).toContain('could not load your cart');
    expect(view.text()).not.toContain('internal_server_error');
    expect(view.root.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('renders inside the secure shell', async () => {
    const view = await open();
    expect(view.root.querySelector('[data-testid="secure-shell"]')).not.toBeNull();
  });

  it('sends a guest to sign in', async () => {
    TestBed.inject(MockServerSession).signOut();
    TestBed.inject(SessionStore).restore().subscribe();

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/cart');

    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fcart');
  });

  describe('removal', () => {
    it('offers a Remove action on each line', async () => {
      mockCart.seedQuantity(BOLT, 2);
      const view = await open();

      const button = view.testId('cart-line-remove') as HTMLButtonElement;
      expect(button).not.toBeNull();
      expect(button.tagName).toBe('BUTTON');
      expect(button.type).toBe('button');
    });

    it('names the row it removes, for screen readers', async () => {
      mockCart.seedQuantity(BOLT, 2);
      const view = await open();

      // Every visible label is just "Remove"; the accessible name must disambiguate.
      const label = view.testId('cart-line-remove')?.getAttribute('aria-label');
      expect(label).toContain('Hex Bolt M10 x 50mm');
      expect(label).toContain('Remove');
    });

    it('removes the line and acknowledges it', async () => {
      mockCart.seedQuantity(BOLT, 2);
      const view = await open();

      (view.testId('cart-line-remove') as HTMLButtonElement).click();
      await view.harness.fixture.whenStable();

      expect(view.all('cart-line')).toHaveLength(0);
      expect(view.testId('cart-removed')?.textContent).toContain('Item removed from your cart');
    });

    it('keeps the acknowledgement visible once the cart is empty', async () => {
      mockCart.seedQuantity(BOLT, 1);
      const view = await open();

      (view.testId('cart-line-remove') as HTMLButtonElement).click();
      await view.harness.fixture.whenStable();

      // Regression: messages used to live inside the populated branch and vanished
      // exactly when the last line went.
      expect(view.testId('cart-empty')).not.toBeNull();
      expect(view.testId('cart-removed')).not.toBeNull();
    });

    it('removes only the chosen line', async () => {
      mockCart.seedQuantity(BOLT, 2);
      mockCart.seedQuantity('YOB-WASH-M10', 3);
      const view = await open();
      expect(view.all('cart-line')).toHaveLength(2);

      const buttons = view.all('cart-line-remove');
      (buttons[0] as HTMLButtonElement).click();
      await view.harness.fixture.whenStable();

      expect(view.all('cart-line')).toHaveLength(1);
      expect(view.text()).toContain('Flat Washer M10');
      expect(view.text()).not.toContain('Hex Bolt M10 x 50mm');
    });

    it('keeps the line and explains safely when removal fails', async () => {
      mockCart.seedQuantity(BOLT, 2);
      const view = await open();
      scenario.scenario.set('server-error');

      (view.testId('cart-line-remove') as HTMLButtonElement).click();
      await view.harness.fixture.whenStable();

      // Nothing was removed optimistically.
      expect(view.all('cart-line')).toHaveLength(1);
      expect(view.testId('cart-remove-error')?.textContent).toContain('could not remove that item');
      expect(view.text()).not.toContain('internal_server_error');
      expect(view.testId('cart-removed')).toBeNull();
    });
  });

  describe('quantity is display-only', () => {
    it('shows the quantity as text', async () => {
      mockCart.seedQuantity(BOLT, 4);
      const view = await open();

      expect(view.testId('cart-line-quantity')?.textContent).toContain('4');
      expect(view.testId('cart-line-quantity')?.tagName).not.toBe('INPUT');
    });

    it('offers no way to edit a quantity', async () => {
      mockCart.seedQuantity(BOLT, 4);
      const view = await open();

      // The backend Add endpoint can set a quantity, but that capability is not
      // exposed as cart editing - there is no input, no stepper, no inline update.
      //
      // Scoped to the LINES, not the whole page. This used to assert the page held
      // no control at all, which was incidentally true and stopped being true when
      // the coupon field arrived - a field that has nothing to do with quantity.
      // The claim being made is about cart lines, so that is what is queried; the
      // coupon has its own tests.
      const lines = view.testId('cart-lines') as HTMLElement;
      expect(lines.querySelectorAll('input')).toHaveLength(0);
      expect(lines.querySelectorAll('select')).toHaveLength(0);

      const buttonLabels = [...lines.querySelectorAll('button')].map((b) =>
        (b.textContent ?? '').trim(),
      );
      expect(buttonLabels).toEqual(['Remove']);
    });
  });
});
