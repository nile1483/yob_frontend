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
 * Choosing a quantity is local, and costs nothing.
 *
 * ## Why this file inverted in Phase 23B-2
 *
 * It used to prove that a *stale* quantity reprice could not overwrite a newer one -
 * necessary while every committed quantity refetched `get_item`. That refetch is gone:
 * the displayed price is the customer's standalone preview at the backend's default
 * quantity, and the transaction rate is only settled when the whole cart is priced as
 * one document. Angular cannot preview that without reimplementing ERPNext's pricing,
 * which is the one thing it must never do.
 *
 * So there is no race left to lose, and the guarantee worth pinning is the stronger one:
 * **no pricing request happens at all** until Add to cart. The old assertions are not
 * deleted so much as replaced by the reason they became unnecessary.
 *
 * The component is driven directly rather than through the router, and against the
 * testing backend rather than the mock API, so every request is observable.
 */
describe('ItemPage local quantity', () => {
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
    // The product route's content slots ask once on render. Answered here so the
    // assertions below still mean "no *catalog* request", which is their subject.
    answerRouteContent(http);

    // Initial load for the default quantity of 1.
    pendingItemRequest().flush(itemPayload(1, 11.25));
    await settle();
    expect(rate()).toContain('11.25');
  });

  afterEach(() => {
    // Every content-bearing route asks for its merchant content on render.
    // Answering it keeps `verify()` meaningful for the requests these tests
    // are about - an unmatched one still fails.
    answerRouteContent(http);
    http.verify();
  });

  it('issues no pricing request when a quantity is committed', async () => {
    await commit('7');

    // The whole point of the phase: typing a quantity is a local decision.
    expect(http.match((r) => r.url.includes('get_item'))).toHaveLength(0);
    expect(quantityInput().value).toBe('7');
  });

  it('issues no pricing request through a burst of quantity changes', async () => {
    for (const value of ['2', '5', '25', '100']) {
      await commit(value);
    }

    expect(http.match((r) => r.url.includes('get_item'))).toHaveLength(0);
    expect(quantityInput().value).toBe('100');
  });

  it('keeps showing the preview price whatever quantity is chosen', async () => {
    await commit('50');

    // Still the standalone preview. Angular does not pretend to know what 50 will cost:
    // quantity rules, mixed conditions and transaction-level effects are settled by
    // ERPNext when the cart is priced, and a multiplied preview would be a guess
    // presented as a fact.
    expect(rate()).toContain('11.25');
  });

  it('does not multiply the preview by the chosen quantity', async () => {
    await commit('4');

    // 11.25 x 4 = 45.00 must appear nowhere.
    expect(rate()).not.toContain('45.00');
    expect(rate()).toContain('11.25');
  });

  it('sends the chosen quantity to the cart exactly once, and only on Add', async () => {
    await commit('5');
    expect(http.match((r) => r.url.includes('get_item'))).toHaveLength(0);

    const form = (fixture.nativeElement as HTMLElement).querySelector('form');
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    const adds = http.match((r) => r.url.includes('add_to_cart'));
    expect(adds).toHaveLength(1);
    expect((adds[0]?.request.body as { qty?: number } | null)?.qty).toBe(5);

    // The store re-reads the cart after a successful add, because the server's cart is
    // the authoritative result of the mutation - not the add's own reply.
    adds[0]?.flush({ message: { data: { name: 'CART-1' } } });
    await settle();

    const reads = http.match((r) => r.url.includes('get_cart'));
    expect(reads).toHaveLength(1);
    reads[0]?.flush({ message: { data: { cart: { name: 'CART-1', items: [], pricing_rows: [] } } } });
    await settle();
  });
});
