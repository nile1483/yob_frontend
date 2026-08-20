import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  type TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { MockServerCart } from '../../../mock-api/core/mock-server-cart';
import { MockServerSession } from '../../../mock-api/core/mock-server-session';
import { mockApiInterceptor } from '../../../mock-api/mock-api.interceptor';
import { MockApiScenario } from '../../../mock-api/scenarios/mock-scenario';
import { routes } from '../../app.routes';
import { yobCsrfInterceptor } from '../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../foundation/network/yob-api.config';
import { SessionStore } from '../../foundation/session/session.store';
import { ItemPage } from '../catalog/pages/item-page';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const BOLT = 'YOB-BOLT-M10';

/** The 409 `add_to_cart` answers when the line is held in a unit no longer sold. */
function uomChangedBody(detail = 'This item is now sold in a different unit.') {
  return {
    message: {
      errors: [
        {
          code: 'cart_item_uom_changed',
          detail,
          field: 'item_code',
          details: { item_code: BOLT, existing_uom: 'Nos', current_uom: 'Box' },
        },
      ],
    },
  };
}

function itemPayload() {
  return {
    message: {
      data: {
        name: BOLT,
        item_name: 'Hex Bolt M10 x 50mm',
        image: null,
        item_group: 'Fasteners',
        custom_slug: 'hex-bolt-m10-50',
        qty: 1,
        base_price: 1200,
        rate: 1000,
        discount_percentage: 0,
        discount_amount: 0,
        net_amount: 1000,
        tax_amount: 0,
        tax_label: null,
        total_amount: 1000,
        uom: 'Box',
        stock_uom: 'Nos',
        conversion_factor: 25,
        stock_qty: 25,
        is_stock_item: 1,
        warehouse: 'Stores - ST',
        actual_qty: 125,
        pricing: {},
        pricing_rule_label: null,
        pricing_rule_apply_on: null,
        available_rules: [],
      },
      notice: 'Item loaded',
    },
  };
}

/**
 * `cart_item_uom_changed` (Phase 23B-5U-FE).
 *
 * ERPNext changed the unit an item sells in while a cart line still holds the old one.
 * The backend refuses the add with a 409 rather than restating the line, because
 * deciding what `2 Nos` becomes in `Box` is a conversion nobody authorised - and the
 * frontend does not authorise it either. It says what happened and lets the buyer remove
 * the line and add the product again.
 */
describe('add_to_cart UOM conflict', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ItemPage>;

  async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  }

  function el(testId: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
  }

  function text(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function quantityInput(): HTMLInputElement {
    return el('item-quantity') as HTMLInputElement;
  }

  async function open(): Promise<void> {
    fixture = TestBed.createComponent(ItemPage);
    fixture.componentRef.setInput('itemSlug', 'hex-bolt-m10-50');
    fixture.detectChanges();
    http.expectOne((r) => r.url.includes('get_item')).flush(itemPayload());
    await settle();
  }

  /** Submit the buy form and return the pending add request. */
  async function submit(): Promise<TestRequest> {
    const form = (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    return http.expectOne((r) => r.url.includes('add_to_cart'));
  }

  /** Refuse the add the way the backend does. */
  async function refuse(body = uomChangedBody()): Promise<void> {
    const request = await submit();
    request.flush(body, { status: 409, statusText: 'Conflict' });
    await settle();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('tells the buyer to remove the line and add it again', async () => {
    await open();
    await refuse();

    expect(el('add-to-cart-uom-changed')?.textContent).toContain('sold in a different unit');
    expect(el('add-to-cart-uom-changed')?.textContent).toContain('add it again');
  });

  it('offers a way to the cart, where the fix has to happen', async () => {
    await open();
    await refuse();

    const link = el('add-to-cart-uom-changed')?.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/cart');
  });

  it('does not also show the generic add failure', async () => {
    await open();
    await refuse();

    expect(el('add-to-cart-error')).toBeNull();
    expect(text()).not.toContain('Please try again');
  });

  it('does not claim the item was added', async () => {
    await open();
    await refuse();

    expect(el('add-to-cart-success')).toBeNull();
    expect(el('add-to-cart-unconfirmed')).toBeNull();
  });

  it('does not retry the add', async () => {
    await open();
    await refuse();

    // A definite refusal: the request reached the endpoint and was rejected, so nothing
    // was applied and there is nothing to re-read. `http.verify()` in afterEach would
    // fail on any second attempt.
    http.expectNone((r) => r.url.includes('add_to_cart'));
  });

  it('does not re-read the cart, because nothing changed', async () => {
    await open();
    await refuse();

    http.expectNone((r) => r.url.includes('get_cart'));
  });

  it('leaves the quantity exactly as the buyer typed it', async () => {
    await open();
    const input = quantityInput();
    input.value = '2';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    await settle();

    await refuse();

    // 2 Box is not silently rewritten as 50 Nos, in the box or in the unit beside it.
    expect(quantityInput().value).toBe('2');
    expect(el('item-quantity-uom')?.textContent?.trim()).toBe('Box');
    expect(text()).not.toContain('50 Nos');
  });

  it('sent no unit in the request that was refused', async () => {
    await open();
    const request = await submit();

    expect(request.request.body).toEqual({ item_code: BOLT, qty: 1 });

    request.flush(uomChangedBody(), { status: 409, statusText: 'Conflict' });
    await settle();
  });

  it('shows our wording, not the server text, and never the raw units', async () => {
    await open();
    await refuse(uomChangedBody('Cart Item 0a1b2c uom mismatch: Nos != Box'));

    expect(text()).not.toContain('0a1b2c');
    expect(text()).not.toContain('Nos != Box');
    expect(el('add-to-cart-uom-changed')?.textContent).toContain('sold in a different unit');
  });
});

/**
 * The same fact on a read: `get_cart` reports the affected lines in `uom_changed_items`.
 */
describe('CartPage UOM conflict notice', () => {
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
    http.verify();
  });

  async function open() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/cart');
    await harness.fixture.whenStable();
    const root = harness.fixture.nativeElement as HTMLElement;
    return {
      testId: (id: string) => root.querySelector(`[data-testid="${id}"]`),
      all: (id: string) => root.querySelectorAll(`[data-testid="${id}"]`),
      text: () => (root.textContent ?? '').replace(/\s+/g, ' ').trim(),
    };
  }

  it('tells the buyer which action to take', async () => {
    mockCart.seedQuantity(BOLT, 2);
    scenario.scenario.set('cart-item-uom-changed');

    const view = await open();

    expect(view.testId('cart-uom-changed')?.textContent).toContain('sold in a different unit');
    expect(view.testId('cart-uom-changed')?.textContent).toContain('add them again');
  });

  it('keeps the line on screen rather than removing it', async () => {
    mockCart.seedQuantity(BOLT, 2);
    scenario.scenario.set('cart-item-uom-changed');

    const view = await open();

    // Nothing is removed on the buyer's behalf: the storefront reports, the buyer
    // decides. The line still shows the unit the backend priced it in.
    expect(view.all('cart-line')).toHaveLength(1);
    expect(view.testId('cart-line-uom')?.textContent?.trim()).toBe('Box');
  });

  it('stays quiet for an ordinary cart', async () => {
    mockCart.seedQuantity(BOLT, 2);

    const view = await open();

    expect(view.testId('cart-uom-changed')).toBeNull();
  });
});
