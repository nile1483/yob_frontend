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

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

function itemPayload(qty: number, rate: number) {
  return {
    message: {
      data: {
        name: 'YOB-BOLT-M10',
        item_name: 'Hex Bolt M10 x 50mm',
        image: null,
        item_group: 'Fasteners',
        custom_slug: 'hex-bolt-m10-50',
        qty,
        base_price: 12.5,
        rate,
        discount_percentage: 0,
        discount_amount: 0,
        net_amount: rate * qty,
        tax_amount: 0,
        tax_label: null,
        total_amount: rate * qty,
        uom: 'Nos',
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
 * Stale quantity pricing must never win.
 *
 * The component is driven directly rather than through the router, and against the
 * testing backend rather than the mock API, because staging a race needs a request
 * left deliberately unanswered - which the mock (synchronous) and `whenStable()` (hangs
 * on a pending request) both make impossible.
 */
describe('ItemPage quantity pricing race', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ItemPage>;

  /** Deliver pending microtasks, then re-render. */
  async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  }

  function pendingItemRequest(): TestRequest {
    return http.expectOne((r) => r.url.includes('get_item'));
  }

  function rate(): string {
    return (
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="item-rate"]')
        ?.textContent ?? ''
    );
  }

  function quantityInput(): HTMLInputElement {
    return (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="item-quantity"]',
    ) as HTMLInputElement;
  }

  /** Commit a quantity the way blur or Enter does. */
  async function commit(value: string): Promise<void> {
    const input = quantityInput();
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    await settle();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(ItemPage);
    fixture.componentRef.setInput('itemSlug', 'hex-bolt-m10-50');
    fixture.detectChanges();

    // Initial load for the default quantity of 1.
    pendingItemRequest().flush(itemPayload(1, 11.25));
    await settle();
    expect(rate()).toContain('11.25');
  });

  afterEach(() => http.verify());

  it('cannot render an older quantity pricing over a newer one', async () => {
    // Quantity 10 goes out and is captured, deliberately unanswered.
    await commit('10');
    const requestForTen = pendingItemRequest();
    expect(requestForTen.request.params.get('qty')).toBe('10');

    // Quantity 50 is committed before 10 has answered.
    await commit('50');
    const requestForFifty = pendingItemRequest();
    expect(requestForFifty.request.params.get('qty')).toBe('50');

    // Changing the quantity aborted the in-flight request for the old one.
    expect(requestForTen.cancelled).toBe(true);

    // The newest quantity answers.
    requestForFifty.flush(itemPayload(50, 9));
    await settle();
    expect(rate()).toContain('9.00');

    // The stale response now tries to arrive, out of order. It cannot: the request was
    // cancelled the moment the quantity changed.
    expect(() => requestForTen.flush(itemPayload(10, 99.99))).toThrow(/cancel/i);
    await settle();

    expect(rate()).toContain('9.00');
    expect(rate()).not.toContain('99.99');
    expect(quantityInput().value).toBe('50');
  });

  it('keeps the newest pricing through a burst of quantity changes', async () => {
    const captured: TestRequest[] = [];

    for (const value of ['5', '25', '100']) {
      await commit(value);
      captured.push(pendingItemRequest());
    }

    // Only the last is live; the earlier two were aborted mid-flight.
    expect(captured[0]?.cancelled).toBe(true);
    expect(captured[1]?.cancelled).toBe(true);
    expect(captured[2]?.cancelled).toBe(false);
    expect(captured[2]?.request.params.get('qty')).toBe('100');

    captured[2]?.flush(itemPayload(100, 8.5));
    await settle();

    expect(rate()).toContain('8.50');
  });

  it('issues exactly one pricing request per committed quantity', async () => {
    await commit('7');

    const requests = http.match((r) => r.url.includes('get_item'));
    expect(requests).toHaveLength(1);
    requests[0]?.flush(itemPayload(7, 10));
    await settle();
  });
});
