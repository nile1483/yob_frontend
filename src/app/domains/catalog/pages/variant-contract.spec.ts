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

const TEMPLATE = 'TEE';
const RESOLVED_SKU = 'TEE-ORG-M';

/**
 * The family from the published contract's own example (API 3.3.0, FRONTEND-CONTRACT.md).
 */
function familyPayload() {
  return {
    message: {
      data: {
        name: TEMPLATE,
        item_name: 'Cotton Tee',
        item_group: 'Apparel',
        image: '/files/tee.png',
        custom_slug: 'cotton-tee',
        is_template: 1,
        is_purchasable: 0,
        variant_of: null,
        attributes: [
          { attribute: 'Colour', numeric: 0, values: ['Orange', 'Yellow'] },
          { attribute: 'Size', numeric: 0, values: ['Medium', 'Large'] },
        ],
        variants: [
          { item_code: RESOLVED_SKU, attributes: { Colour: 'Orange', Size: 'Medium' } },
          { item_code: 'TEE-YEL-L', attributes: { Colour: 'Yellow', Size: 'Large' } },
        ],
      },
      notice: 'Item loaded',
    },
  };
}

/**
 * Every field API 3.3.0 marks required on `ProductDetail`, with values chosen so that a
 * calculated figure would be visibly different from a read one.
 *
 * `rate` 1000 in `Box` of 25 `Nos`: a converted price is 40, a multiplied one 25,000, and
 * `actual_qty` 125 Nos is 5 Box. None of those numbers may appear.
 */
function resolvedPayload(over: Record<string, unknown> = {}) {
  return {
    message: {
      data: {
        name: RESOLVED_SKU,
        item_name: 'Cotton Tee - Orange, Medium',
        image: '/files/tee-orange.png',
        item_group: 'Apparel',
        custom_slug: 'cotton-tee',
        qty: 1,
        is_template: 0,
        is_purchasable: 1,
        variant_of: TEMPLATE,
        selected: { Colour: 'Orange', Size: 'Medium' },
        base_price: 1200,
        rate: 1000,
        discount_percentage: 16.67,
        discount_amount: 200,
        net_amount: 1000,
        tax_amount: 180,
        tax_label: 'GST 18%',
        total_amount: 1180,
        uom: 'Box',
        stock_uom: 'Nos',
        conversion_factor: 25,
        stock_qty: 25,
        is_stock_item: 1,
        warehouse: 'Stores - ST',
        actual_qty: 125,
        pricing: {},
        pricing_rule_label: 'Launch offer',
        pricing_rule_apply_on: 'Item Code',
        available_rules: ['10% off on 5 boxes or more'],
        ...over,
      },
      notice: 'Variant resolved',
    },
  };
}

function errorBody(code: string) {
  return { message: { errors: [{ code, detail: 'Internal server wording, never rendered.' }] } };
}

/**
 * Angular against the published wire contract (Phase 24D-2).
 *
 * A sign-off suite, not a feature suite: every assertion here restates something API
 * 3.3.0 says, so that a future change to either side has to break a test rather than
 * drift quietly. Nothing about the UX is exercised that `item-variant.spec.ts` does not
 * already cover.
 */
describe('variant wire contract (API 3.3.0)', () => {
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

  function values(): HTMLButtonElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="item-attribute-value"]'),
    );
  }

  async function choose(attribute: string, value: string): Promise<void> {
    const button = values().find(
      (n) => n.getAttribute('data-attribute') === attribute && n.getAttribute('data-value') === value,
    );
    (button as HTMLButtonElement).click();
    await settle();
  }

  async function open(payload: object = familyPayload()): Promise<void> {
    fixture = TestBed.createComponent(ItemPage);
    fixture.componentRef.setInput('itemSlug', 'cotton-tee');
    fixture.detectChanges();
    // The product route's content slots ask once on render. Answered here so the
    // assertions below still mean "no *catalog* request", which is their subject.
    answerRouteContent(http);
    http.expectOne((r) => r.url.includes('get_item')).flush(payload);
    await settle();
  }

  /** Fail the load the way `get_item` does. */
  async function openWithError(code: string, status = 422): Promise<void> {
    fixture = TestBed.createComponent(ItemPage);
    fixture.componentRef.setInput('itemSlug', 'cotton-tee');
    fixture.detectChanges();
    // The product route's content slots ask once on render. Answered here so the
    // assertions below still mean "no *catalog* request", which is their subject.
    answerRouteContent(http);
    http
      .expectOne((r) => r.url.includes('get_item'))
      .flush(errorBody(code), { status, statusText: 'Unprocessable Entity' });
    await settle();
  }

  function pendingResolve(): TestRequest {
    return http.expectOne((r) => r.url.includes('resolve_variant'));
  }

  async function resolveOrangeMedium(payload: object = resolvedPayload()): Promise<void> {
    await choose('Colour', 'Orange');
    await choose('Size', 'Medium');
    pendingResolve().flush(payload);
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

  describe('the resolver request', () => {
    it('is a GET to the published method', async () => {
      await open();
      await choose('Colour', 'Orange');
      await choose('Size', 'Medium');

      const request = pendingResolve();

      expect(request.request.method).toBe('GET');
      expect(request.request.url).toBe(
        '/api/method/yob_storefront.api.catalog.resolve_variant',
      );
      // A GET carries no body at all - the contract's parameters are query parameters.
      expect(request.request.body).toBeNull();

      request.flush(resolvedPayload());
      await settle();
    });

    it('sends exactly template, attributes and qty', async () => {
      await open();
      await choose('Colour', 'Orange');
      await choose('Size', 'Medium');

      const request = pendingResolve();
      const params = request.request.params;

      expect(params.keys().sort()).toEqual(['attributes', 'qty', 'template']);
      expect(params.get('template')).toBe(TEMPLATE);
      expect(params.get('qty')).toBe('1');
      expect(JSON.parse(params.get('attributes') ?? '{}')).toEqual({
        Colour: 'Orange',
        Size: 'Medium',
      });

      request.flush(resolvedPayload());
      await settle();
    });

    it('URL-encodes the attributes JSON into the query string', async () => {
      await open();
      await choose('Colour', 'Orange');
      await choose('Size', 'Medium');

      const request = pendingResolve();
      const url = request.request.urlWithParams;

      expect(url).toContain('template=TEE');
      expect(url).toContain('qty=1');
      // Percent-encoded, as the contract's example shows: attributes=%7B%22Colour%22...
      expect(url).toContain('attributes=%7B%22');

      // What actually matters is that it decodes back to the selection. Angular encodes
      // `{` and `"` but leaves `:` and `,` literal - both are legal in a query value, and
      // the backend json-loads the decoded string either way, so the assertion is on the
      // round trip and not on one encoder's choices. Nor on key order: a JSON object is
      // a map, and `pruneSelection` rebuilds it around whichever attribute was clicked
      // last, so the order legitimately varies.
      const encoded = url.split('attributes=')[1]?.split('&')[0] ?? '';
      expect(JSON.parse(decodeURIComponent(encoded))).toEqual({
        Colour: 'Orange',
        Size: 'Medium',
      });

      request.flush(resolvedPayload());
      await settle();
    });

    it('constructs no SKU and sends no pricing, unit or warehouse input', async () => {
      await open();
      await choose('Colour', 'Orange');
      await choose('Size', 'Medium');

      const request = pendingResolve();
      const url = request.request.urlWithParams;

      // The resolver is asked which SKU this is; Angular has no opinion to send.
      expect(url).not.toContain(RESOLVED_SKU);
      expect(url).not.toContain('ORG');
      for (const forbidden of [
        'item_code',
        'uom',
        'stock_uom',
        'conversion_factor',
        'warehouse',
        'rate',
        'price_list',
        'selling_price_list',
      ]) {
        expect(request.request.params.get(forbidden)).toBeNull();
      }

      request.flush(resolvedPayload());
      await settle();
    });

    it('does not depend on the order the attributes were chosen in', async () => {
      await open();
      // Size first, then Colour - the reverse of the family's declared order.
      await choose('Size', 'Medium');
      await choose('Colour', 'Orange');

      const request = pendingResolve();
      const sent = JSON.parse(request.request.params.get('attributes') ?? '{}') as Record<
        string,
        string
      >;

      // A JSON object is a map, not a sequence: the same pairs are the same selection
      // however they were clicked, and the resolver answers the same SKU.
      expect(sent).toEqual({ Colour: 'Orange', Size: 'Medium' });
      request.flush(resolvedPayload());
      await settle();

      expect(text()).toContain(RESOLVED_SKU);
    });
  });

  describe('the resolved response', () => {
    it('is read, field by field, exactly as the backend sent it', async () => {
      await open();
      await resolveOrangeMedium();

      // Identity
      expect(text()).toContain(RESOLVED_SKU);
      expect(el('item-title')?.textContent).toContain('Cotton Tee - Orange, Medium');
      // Money, in the backend's own figures
      expect(el('item-rate')?.textContent).toContain('1,000');
      expect(el('item-base-price')?.textContent).toContain('1,200');
      expect(el('item-discount')?.textContent).toContain('16.67');
      expect(el('item-total-amount')?.textContent).toContain('1,180');
      expect(el('item-tax-amount')?.textContent).toContain('180');
      expect(el('item-tax-label')?.textContent).toContain('GST 18%');
      // Units and stock
      expect(el('item-uom')?.textContent).toContain('Box');
      expect(el('item-availability')?.textContent).toContain('125');
      expect(el('item-availability-uom')?.textContent?.trim()).toBe('Nos');
      // The merchandising image is the FAMILY's throughout - see the Phase 27C tests
      // below. What the resolver changed is everything transactional above.
      expect(el('item-image')?.querySelector('img')?.getAttribute('src')).toContain('tee.png');
      // Offers

      expect(el('item-offers')?.textContent).toContain('10% off on 5 boxes or more');
      expect(el('item-pricing-rule')?.textContent).toContain('Launch offer');
    });

    it('calculates none of it', async () => {
      await open();
      await resolveOrangeMedium();

      const rendered = text();
      // rate / conversion_factor = 40; rate * conversion_factor = 25,000;
      // net + tax computed independently = 1,180 (matches, so it is pinned above by the
      // backend's own total); actual_qty / conversion_factor = 5 Box.
      expect(rendered).not.toContain('40.00');
      expect(rendered).not.toContain('25,000');
      expect(el('item-availability')?.textContent).not.toContain('5 Box');
      // discount_amount is the backend's; 1200 - 1000 happens to equal it, so the
      // percentage is the real tell: a derived one would be 16.666...%, not 16.67.
      expect(rendered).not.toContain('16.666');
    });

    it('carries variant_of and selected through without acting on them', async () => {
      await open();
      await resolveOrangeMedium();

      // The SKU is the authority for what is bought; `selected` is the backend's own
      // record of the attributes behind it, and `variant_of` names the family. Neither
      // is used to build an identity - proven by the add payload below.
      const request = await submitAdd();
      const body = request.request.body as Record<string, unknown>;

      expect(body).toEqual({ item_code: RESOLVED_SKU, qty: 1 });
      // An identity check, not a substring one: a variant code may legitimately begin
      // with its template's, and asserting anything about that shape would be this test
      // reproducing ERPNext's naming - the one thing the application must never do.
      expect(body['item_code']).not.toBe(TEMPLATE);
      expect(Object.keys(body).sort()).toEqual(['item_code', 'qty']);
      // `selected` and `variant_of` were read from the response and stayed there.
      expect(JSON.stringify(body)).not.toContain('Orange');

      request.flush({ message: { data: {} } });
      http.expectOne((r) => r.url.includes('get_cart')).flush({ message: { data: {} } });
    });

    it('keeps the family image whether or not the resolved variant has one', async () => {
      // Phase 27C: this used to hold only because the variant's image was null. It now
      // holds unconditionally - merchandising belongs to the template, so a resolved
      // child's photograph never reaches this column either way.
      await open();
      await resolveOrangeMedium(resolvedPayload({ image: null }));
      expect(el('item-image')?.querySelector('img')?.getAttribute('src')).toContain('tee.png');

      await open();
      await resolveOrangeMedium(resolvedPayload({ image: '/files/tee-orange.png' }));
      expect(el('item-image')?.querySelector('img')?.getAttribute('src')).toContain('tee.png');
    });
  });

  async function submitAdd(): Promise<TestRequest> {
    const form = (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    return http.expectOne((r) => r.url.includes('add_to_cart'));
  }

  describe('the published error codes', () => {
    it('handles variant_family_unsupported from get_item as a permanent state', async () => {
      await openWithError('variant_family_unsupported');

      // Not the generic "please try again": retrying cannot make a Manufacturer-based
      // family configurable.
      expect(el('item-family-unavailable')?.textContent).toContain('cannot be configured');
      expect(el('item-error')).toBeNull();
      expect(text()).not.toContain('try again');
      expect(el('item-attributes')).toBeNull();
      expect(el('add-to-cart')).toBeNull();
    });

    it('handles item_not_found as a destination, not a fault', async () => {
      await openWithError('item_not_found', 404);

      expect(el('item-not-found')).not.toBeNull();
      expect(el('item-error')).toBeNull();
    });

    it('handles variant_attributes_required without guessing the missing one', async () => {
      await open();
      await choose('Colour', 'Orange');
      await choose('Size', 'Medium');
      pendingResolve().flush(errorBody('variant_attributes_required'), {
        status: 422,
        statusText: 'Unprocessable Entity',
      });
      await settle();

      expect(el('item-variant-error')?.textContent).toContain('every field');
      expect(el('add-to-cart')).toBeNull();
    });

    it('handles variant_not_available without offering a neighbour', async () => {
      await open();
      await choose('Colour', 'Orange');
      await choose('Size', 'Medium');
      pendingResolve().flush(errorBody('variant_not_available'), {
        status: 422,
        statusText: 'Unprocessable Entity',
      });
      await settle();

      expect(el('item-variant-error')?.textContent).toContain('not available');
      // No second resolve, no other SKU tried, nothing purchasable left on screen.
      http.expectNone(() => true);
      expect(el('add-to-cart')).toBeNull();
      expect(el('item-rate')).toBeNull();
    });

    it('handles item_is_template on add without falling back to the template', async () => {
      await open();
      await resolveOrangeMedium();

      const request = await submitAdd();
      request.flush(errorBody('item_is_template'), {
        status: 422,
        statusText: 'Unprocessable Entity',
      });
      await settle();

      expect(el('add-to-cart-error')?.textContent).toContain('Choose the options');
      // A refusal is final: no retry, and above all no second add with another code.
      http.expectNone(() => true);
    });

    it('handles item_not_purchasable without suggesting a retry', async () => {
      await open();
      await resolveOrangeMedium();

      const request = await submitAdd();
      request.flush(errorBody('item_not_purchasable'), {
        status: 422,
        statusText: 'Unprocessable Entity',
      });
      await settle();

      expect(el('add-to-cart-error')?.textContent).toContain('cannot be ordered');
      expect(el('add-to-cart-error')?.textContent).not.toContain('try again');
      http.expectNone(() => true);
    });

    it('never renders the server detail for any of them', async () => {
      await open();
      await choose('Colour', 'Orange');
      await choose('Size', 'Medium');
      pendingResolve().flush(errorBody('variant_not_available'), {
        status: 422,
        statusText: 'Unprocessable Entity',
      });
      await settle();

      expect(text()).not.toContain('Internal server wording');
    });
  });
});
