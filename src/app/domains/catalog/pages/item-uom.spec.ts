import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  type TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { YOB_API_CONFIG, type YobApiConfig } from '../../../foundation/network/yob-api.config';
import { ItemPage } from './item-page';
import { answerRouteContent } from '../../content/route-content.testing';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

/**
 * An item ERPNext sells by the Box and stocks in Nos, 25 to a Box.
 *
 * Every figure is the backend's own, in the unit the backend labelled it with: the rate
 * is per Box, `actual_qty` is in Nos, and `stock_qty` is the server's conversion of the
 * default quantity. Nothing on the page may restate any of them in the other unit.
 */
function itemPayload(over: Record<string, unknown> = {}) {
  return {
    message: {
      data: {
        name: 'YOB-BOLT-M10',
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
        ...over,
      },
      notice: 'Item loaded',
    },
  };
}

/**
 * Authoritative selling UOM on product detail (Phase 23B-5U-FE).
 *
 * The storefront buyer never selects a unit or a warehouse: they choose a quantity, and
 * ERPNext has already decided what that quantity is counted in. These tests pin both
 * halves - that the backend's units are shown where they belong, and that no figure is
 * ever converted between them.
 *
 * Driven directly against the testing backend rather than through the mock API, so every
 * request body is observable.
 */
describe('ItemPage selling UOM', () => {
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

  async function commit(value: string): Promise<void> {
    const input = quantityInput();
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    await settle();
  }

  async function open(payload = itemPayload()): Promise<void> {
    fixture = TestBed.createComponent(ItemPage);
    fixture.componentRef.setInput('itemSlug', 'hex-bolt-m10-50');
    fixture.detectChanges();
    // The product route's content slots ask once on render. Answered here so the
    // assertions below still mean "no *catalog* request", which is their subject.
    answerRouteContent(http);
    http.expectOne((r) => r.url.includes('get_item')).flush(payload);
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

  afterEach(() => {
    // Every content-bearing route asks for its merchant content on render.
    // Answering it keeps `verify()` meaningful for the requests these tests
    // are about - an unmatched one still fails.
    answerRouteContent(http);
    http.verify();
  });

  describe('price', () => {
    it('is labelled with the selling UOM', async () => {
      await open();

      expect(el('item-rate')?.textContent).toContain('1,000');
      expect(el('item-uom')?.textContent).toContain('Box');
    });

    it('is not restated in stock units', async () => {
      await open();

      // 1000 / 25 = 40, and 1000 * 25 = 25,000. Neither number belongs on this page.
      expect(text()).not.toContain('40.00');
      expect(text()).not.toContain('25,000');
      expect(el('item-uom')?.textContent).not.toContain('Nos');
    });
  });

  describe('quantity', () => {
    it('is labelled with the selling UOM, so the accessible name carries it', async () => {
      await open();

      const label = (fixture.nativeElement as HTMLElement).querySelector('label');
      expect(label?.textContent).toContain('Quantity to add');
      expect(label?.textContent).toContain('Box');
      // The control is projected inside the label, so that text names it.
      expect(label?.querySelector('[data-testid="item-quantity"]')).not.toBeNull();
    });

    it('shows the unit beside the box, hidden from assistive technology', async () => {
      await open();

      expect(el('item-quantity-uom')?.textContent?.trim()).toBe('Box');
      // The label already says "Box"; repeating it in the accessible name is noise.
      expect(el('item-quantity-uom')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('offers no way to choose a unit', async () => {
      await open();

      // One control on the page, and it is the quantity box. No select, no combobox, no
      // unit chooser of any kind - the stock unit appears only as the label on a stock
      // figure the buyer cannot act on.
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelectorAll('select')).toHaveLength(0);
      expect(root.querySelectorAll('input')).toHaveLength(1);
      expect(root.querySelectorAll('[role="listbox"], [role="combobox"]')).toHaveLength(0);
    });

    it('stays local until Add to cart', async () => {
      await open();
      await commit('4');
      await commit('9');

      // No pricing request, no cart request - a quantity is just a number until it is
      // submitted. Unchanged by this phase, pinned here because the UOM work touched
      // the same control.
      http.expectNone(() => true);
      expect(quantityInput().value).toBe('9');
      expect(el('item-rate')?.textContent).toContain('1,000');
    });
  });

  describe('availability', () => {
    it('is counted in the stock UOM, not the selling UOM', async () => {
      await open();

      expect(el('item-availability')?.textContent).toContain('125');
      expect(el('item-availability-uom')?.textContent?.trim()).toBe('Nos');
    });

    it('is not converted into selling units', async () => {
      await open();

      // 125 Nos is 5 Box. The page says what the backend said, in the backend's unit.
      expect(el('item-availability')?.textContent).not.toContain('5 Box');
      expect(el('item-availability')?.textContent).not.toContain('3125');
    });

    it('shows a real zero', async () => {
      await open(itemPayload({ actual_qty: 0 }));

      expect(el('item-availability')?.textContent).toContain('0');
      expect(el('item-availability-uom')?.textContent?.trim()).toBe('Nos');
    });

    it('says nothing when the quantity is unknown', async () => {
      await open(itemPayload({ actual_qty: null, warehouse: null }));

      expect(el('item-availability')).toBeNull();
      expect(text()).not.toContain('Available');
    });

    it('says nothing for a non-stock item, even with a quantity present', async () => {
      await open(itemPayload({ is_stock_item: 0, actual_qty: 7 }));

      expect(el('item-availability')).toBeNull();
    });
  });

  describe('the two units coexist', () => {
    it('shows the selling unit for the price and the stock unit for the stock', async () => {
      await open();

      expect(el('item-uom')?.textContent).toContain('Box');
      expect(el('item-availability-uom')?.textContent?.trim()).toBe('Nos');
    });
  });

  describe('what Angular sends', () => {
    /** Submit the buy form and return the pending add request. */
    async function addToCart(): Promise<TestRequest> {
      const form = (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();
      return http.expectOne((r) => r.url.includes('add_to_cart'));
    }

    it('sends the item code and the quantity, and nothing else', async () => {
      await open();
      await commit('3');
      const request = await addToCart();

      expect(request.request.body).toEqual({ item_code: 'YOB-BOLT-M10', qty: 3 });
      request.flush({ message: { data: {} } });
      // The store re-reads the cart after a successful mutation.
      http.expectOne((r) => r.url.includes('get_cart')).flush({ message: { data: {} } });
    });

    it('never sends a UOM, a conversion factor or a warehouse', async () => {
      await open();
      const request = await addToCart();

      const body = request.request.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['item_code', 'qty']);
      expect(body['uom']).toBeUndefined();
      expect(body['conversion_factor']).toBeUndefined();
      expect(body['warehouse']).toBeUndefined();
      expect(body['stock_uom']).toBeUndefined();

      // Nor anywhere in the serialised request, whatever a future field might be called.
      expect(JSON.stringify(request.request.body)).not.toContain('Box');
      expect(JSON.stringify(request.request.body)).not.toContain('Stores - ST');

      request.flush({ message: { data: {} } });
      http.expectOne((r) => r.url.includes('get_cart')).flush({ message: { data: {} } });
    });

    it('asks for an item by slug alone - no unit, no warehouse', async () => {
      fixture = TestBed.createComponent(ItemPage);
      fixture.componentRef.setInput('itemSlug', 'hex-bolt-m10-50');
      fixture.detectChanges();
    // The product route's content slots ask once on render. Answered here so the
    // assertions below still mean "no *catalog* request", which is their subject.
    answerRouteContent(http);

      const request = http.expectOne((r) => r.url.includes('get_item'));
      const params = request.request.params;

      expect(params.get('slug')).toBe('hex-bolt-m10-50');
      expect(params.get('uom')).toBeNull();
      expect(params.get('warehouse')).toBeNull();
      expect(params.get('conversion_factor')).toBeNull();

      request.flush(itemPayload());
      await settle();
    });
  });
});
