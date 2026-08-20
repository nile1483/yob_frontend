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

const TEMPLATE = 'YOB-VEST';
const ORANGE_MEDIUM = 'YOB-VEST-ORG-M';
const YELLOW_LARGE = 'YOB-VEST-YEL-L';

/**
 * A family whose matrix is deliberately **not** the cross-product of its attributes.
 *
 * Orange, Yellow, Medium and Large all exist as values; only Orange/Medium and
 * Yellow/Large exist as products. Everything below turns on that gap.
 */
function familyPayload(over: Record<string, unknown> = {}) {
  return {
    message: {
      data: {
        name: TEMPLATE,
        item_name: 'Hi-Vis Safety Vest',
        image: '/mock-media/family.svg',
        item_group: 'Safety Equipment',
        custom_slug: 'hi-vis-safety-vest',
        is_template: 1,
        is_purchasable: 0,
        attributes: [
          { attribute: 'Colour', numeric: 0, values: ['Orange', 'Yellow'] },
          { attribute: 'Size', numeric: 0, values: ['Medium', 'Large'] },
        ],
        variants: [
          { item_code: ORANGE_MEDIUM, attributes: { Colour: 'Orange', Size: 'Medium' } },
          { item_code: YELLOW_LARGE, attributes: { Colour: 'Yellow', Size: 'Large' } },
        ],
        ...over,
      },
      notice: 'Item loaded',
    },
  };
}

/** What the resolver answers: an ordinary priced item, with its own SKU and units. */
function variantPayload(over: Record<string, unknown> = {}) {
  return {
    message: {
      data: {
        name: ORANGE_MEDIUM,
        item_name: 'Hi-Vis Safety Vest - Orange, Medium',
        image: '/mock-media/orange-medium.svg',
        item_group: 'Safety Equipment',
        custom_slug: 'hi-vis-safety-vest',
        qty: 1,
        variant_of: TEMPLATE,
        selected: { Colour: 'Orange', Size: 'Medium' },
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
      notice: 'Variant resolved',
    },
  };
}

function variantError(code: string, status: number) {
  return {
    body: { message: { errors: [{ code, detail: 'Server wording that is never rendered.' }] } },
    status,
  };
}

/**
 * Variant family selection (Phase 24C).
 *
 * The buyer chooses attributes; the **backend** chooses the SKU. These tests pin both
 * halves: that the matrix drives what is offerable, and that nothing but the resolver
 * decides what is bought.
 *
 * Driven directly against the testing backend, so every request - and every request that
 * should not exist - is observable.
 */
describe('ItemPage variant family', () => {
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

  function all(testId: string): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testId}"]`),
    );
  }

  function text(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  /** Every offered value, as `Attribute:Value` plus its state. */
  function options(): { key: string; state: string | null }[] {
    return all('item-attribute-value').map((node) => ({
      key: `${node.getAttribute('data-attribute')}:${node.getAttribute('data-value')}`,
      state: node.getAttribute('data-state'),
    }));
  }

  function stateOf(attribute: string, value: string): string | null {
    return options().find((o) => o.key === `${attribute}:${value}`)?.state ?? null;
  }

  async function choose(attribute: string, value: string): Promise<void> {
    const button = all('item-attribute-value').find(
      (node) =>
        node.getAttribute('data-attribute') === attribute &&
        node.getAttribute('data-value') === value,
    );
    (button as HTMLButtonElement).click();
    await settle();
  }

  async function open(payload = familyPayload()): Promise<void> {
    fixture = TestBed.createComponent(ItemPage);
    fixture.componentRef.setInput('itemSlug', 'hi-vis-safety-vest');
    fixture.detectChanges();
    http.expectOne((r) => r.url.includes('get_item')).flush(payload);
    await settle();
  }

  function pendingResolve(): TestRequest {
    return http.expectOne((r) => r.url.includes('resolve_variant'));
  }

  /** Choose the pair that exists, and let the backend answer with the variant. */
  async function resolveOrangeMedium(payload = variantPayload()): Promise<void> {
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

  afterEach(() => http.verify());

  describe('the family page', () => {
    it('renders one control per attribute, in the backend order', async () => {
      await open();

      expect(all('item-attribute-name').map((n) => n.textContent?.trim())).toEqual([
        'Colour',
        'Size',
      ]);
    });

    it('keeps the backend order of the values inside each attribute', async () => {
      await open();

      expect(options().map((o) => o.key)).toEqual([
        'Colour:Orange',
        'Colour:Yellow',
        'Size:Medium',
        'Size:Large',
      ]);
    });

    it('shows no price, no quantity and no Add before a variant exists', async () => {
      await open();

      expect(el('item-rate')).toBeNull();
      expect(el('item-quantity')).toBeNull();
      expect(el('add-to-cart')).toBeNull();
      expect(el('item-variant-prompt')).not.toBeNull();
    });

    it('offers no unit or warehouse control', async () => {
      await open();

      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelectorAll('select')).toHaveLength(0);
      expect(text()).not.toContain('Warehouse');
    });
  });

  describe('which combinations are offerable', () => {
    it('offers every value before anything is chosen', async () => {
      await open();

      expect(options().every((o) => o.state === 'available')).toBe(true);
    });

    it('disables a size that exists but not in the chosen colour', async () => {
      await open();
      await choose('Colour', 'Orange');

      // Orange/Medium is real; Orange/Large is not, though Orange and Large both exist.
      expect(stateOf('Size', 'Medium')).toBe('available');
      expect(stateOf('Size', 'Large')).toBe('disabled');
    });

    it('constrains in the other direction too', async () => {
      await open();
      await choose('Size', 'Large');

      expect(stateOf('Colour', 'Yellow')).toBe('available');
      expect(stateOf('Colour', 'Orange')).toBe('disabled');
    });

    it('keeps the sibling values of the chosen attribute switchable', async () => {
      await open();
      await choose('Colour', 'Orange');

      // Changing your mind about colour must stay possible.
      expect(stateOf('Colour', 'Orange')).toBe('selected');
      expect(stateOf('Colour', 'Yellow')).toBe('available');
    });

    it('keeps an unavailable value visible rather than hiding it', async () => {
      await open();
      await choose('Colour', 'Orange');

      const large = all('item-attribute-value').find(
        (n) => n.getAttribute('data-value') === 'Large',
      );
      expect(large).not.toBeUndefined();
      expect((large as HTMLButtonElement).disabled).toBe(true);
    });

    it('lets a chosen attribute be changed again, dropping what it contradicts', async () => {
      await open();
      await resolveOrangeMedium();

      // A complete selection must not be a dead end: every alternative colour is
      // unavailable "with Medium", but the buyer may still switch to Yellow.
      expect(stateOf('Colour', 'Yellow')).toBe('available');

      await choose('Colour', 'Yellow');

      // Medium contradicts Yellow, so it is dropped rather than silently substituted -
      // and nothing is resolved until the buyer answers Size again.
      expect(stateOf('Size', 'Medium')).toBe('disabled');
      expect(stateOf('Size', 'Large')).toBe('available');
      expect(el('item-variant-prompt')).not.toBeNull();
      http.expectNone((r) => r.url.includes('resolve_variant'));
    });

    it('drops the resolved variant the moment the selection stops being complete', async () => {
      await open();
      await resolveOrangeMedium();
      expect(el('add-to-cart')).not.toBeNull();

      await choose('Colour', 'Yellow');

      // Nothing purchasable is on screen until the backend names a variant again.
      expect(el('add-to-cart')).toBeNull();
      expect(el('item-rate')).toBeNull();
      http.expectNone((r) => r.url.includes('resolve_variant'));
    });

    it('offers nothing the matrix does not contain, whatever the attribute lists say', async () => {
      await open();
      await choose('Colour', 'Yellow');

      expect(stateOf('Size', 'Large')).toBe('available');
      expect(stateOf('Size', 'Medium')).toBe('disabled');
    });
  });

  describe('resolution', () => {
    it('asks nothing while the selection is incomplete', async () => {
      await open();
      await choose('Colour', 'Orange');

      http.expectNone((r) => r.url.includes('resolve_variant'));
    });

    it('resolves once the last attribute is chosen', async () => {
      await open();
      await choose('Colour', 'Orange');
      await choose('Size', 'Medium');

      const request = pendingResolve();
      expect(request.request.params.get('template')).toBe(TEMPLATE);
      expect(JSON.parse(request.request.params.get('attributes') ?? '{}')).toEqual({
        Colour: 'Orange',
        Size: 'Medium',
      });

      request.flush(variantPayload());
      await settle();
    });

    it('sends the template and the chosen values, and no SKU of its own', async () => {
      await open();
      await choose('Colour', 'Orange');
      await choose('Size', 'Medium');

      const request = pendingResolve();
      const url = request.request.urlWithParams;

      // The resolver is asked *which* SKU this is. Angular does not have an opinion:
      // no candidate code, no concatenation of values, no ERPNext naming.
      expect(url).not.toContain(ORANGE_MEDIUM);
      expect(url).not.toContain('ORG');
      expect(request.request.params.get('item_code')).toBeNull();
      expect(request.request.params.get('uom')).toBeNull();
      expect(request.request.params.get('warehouse')).toBeNull();
      expect(request.request.params.get('conversion_factor')).toBeNull();
      expect(request.request.params.get('price_list')).toBeNull();

      request.flush(variantPayload());
      await settle();
    });

    it('re-resolves when the selection changes, and only then', async () => {
      await open();
      await resolveOrangeMedium();

      await choose('Colour', 'Yellow');
      // Colour alone leaves Size stale, so the selection is complete again with Large
      // only once it is chosen - and Medium is no longer offerable.
      expect(stateOf('Size', 'Medium')).toBe('disabled');
      await choose('Size', 'Large');

      const request = pendingResolve();
      expect(JSON.parse(request.request.params.get('attributes') ?? '{}')).toEqual({
        Colour: 'Yellow',
        Size: 'Large',
      });
      request.flush(variantPayload({ name: YELLOW_LARGE, image: null, uom: 'Nos' }));
      await settle();
    });
  });

  describe('the resolved variant', () => {
    it('becomes the item on screen', async () => {
      await open();
      await resolveOrangeMedium();

      expect(el('item-title')?.textContent).toContain('Orange, Medium');
      expect(text()).toContain(ORANGE_MEDIUM);
    });

    it('shows the price in the backend selling UOM', async () => {
      await open();
      await resolveOrangeMedium();

      expect(el('item-rate')?.textContent).toContain('1,000');
      expect(el('item-uom')?.textContent).toContain('Box');
    });

    it('shows availability in the backend stock UOM', async () => {
      await open();
      await resolveOrangeMedium();

      expect(el('item-availability')?.textContent).toContain('125');
      expect(el('item-availability-uom')?.textContent?.trim()).toBe('Nos');
    });

    it('labels the quantity with the resolved selling UOM', async () => {
      await open();
      await resolveOrangeMedium();

      const label = (fixture.nativeElement as HTMLElement).querySelector('label');
      expect(label?.textContent).toContain('Box');
      expect(el('item-quantity-uom')?.textContent?.trim()).toBe('Box');
    });

    it('converts nothing between the two units', async () => {
      await open();
      await resolveOrangeMedium();

      // 1000/25 = 40, 125/25 = 5. Neither figure belongs anywhere on this page.
      expect(text()).not.toContain('40.00');
      expect(el('item-availability')?.textContent).not.toContain('5 Box');
    });

    it('replaces the family image with the variant own', async () => {
      await open();
      await resolveOrangeMedium();

      expect(el('item-image')?.querySelector('img')?.getAttribute('src')).toContain(
        'orange-medium',
      );
    });

    it('keeps the family image when the variant has none', async () => {
      await open();
      await choose('Colour', 'Yellow');
      await choose('Size', 'Large');
      pendingResolve().flush(variantPayload({ name: YELLOW_LARGE, image: null }));
      await settle();

      // Nothing is inherited or invented: the template's picture simply stays.
      expect(el('item-image')?.querySelector('img')?.getAttribute('src')).toContain('family');
    });
  });

  describe('quantity', () => {
    it('starts at 1 for a newly resolved variant', async () => {
      await open();
      await resolveOrangeMedium();

      expect((el('item-quantity') as HTMLInputElement).value).toBe('1');
    });

    it('resets to 1 when the resolved variant changes', async () => {
      await open();
      await resolveOrangeMedium();

      const input = el('item-quantity') as HTMLInputElement;
      input.value = '7';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('change'));
      await settle();
      expect((el('item-quantity') as HTMLInputElement).value).toBe('7');

      await choose('Colour', 'Yellow');
      await choose('Size', 'Large');
      pendingResolve().flush(variantPayload({ name: YELLOW_LARGE, uom: 'Nos', image: null }));
      await settle();

      // 7 Box must never become 7 Nos of a different product.
      expect((el('item-quantity') as HTMLInputElement).value).toBe('1');
      expect(el('item-quantity-uom')?.textContent?.trim()).toBe('Nos');
    });

    it('issues no request when the quantity changes', async () => {
      await open();
      await resolveOrangeMedium();

      const input = el('item-quantity') as HTMLInputElement;
      for (const value of ['2', '3', '9']) {
        input.value = value;
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('change'));
        await settle();
      }

      // Quantity is local. Nothing re-prices and nothing re-resolves.
      http.expectNone(() => true);
    });
  });

  describe('add to cart', () => {
    async function submit(): Promise<TestRequest> {
      const form = (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();
      return http.expectOne((r) => r.url.includes('add_to_cart'));
    }

    it('is not possible before a variant is resolved', async () => {
      await open();
      await choose('Colour', 'Orange');

      expect(el('add-to-cart')).toBeNull();
      expect((fixture.nativeElement as HTMLElement).querySelector('form')).toBeNull();
    });

    it('sends exactly the resolved SKU and the quantity', async () => {
      await open();
      await resolveOrangeMedium();

      const request = await submit();

      expect(request.request.body).toEqual({ item_code: ORANGE_MEDIUM, qty: 1 });
      request.flush({ message: { data: {} } });
      http.expectOne((r) => r.url.includes('get_cart')).flush({ message: { data: {} } });
    });

    it('never sends the template code, the attributes or any unit', async () => {
      await open();
      await resolveOrangeMedium();

      const request = await submit();
      const body = request.request.body as Record<string, unknown>;

      expect(Object.keys(body).sort()).toEqual(['item_code', 'qty']);
      // The purchased SKU is the resolver's answer, never the template it came from.
      // Deliberately an identity check and not a string-shape one: what a variant code
      // looks like is ERPNext's business, and asserting a naming pattern here would be
      // this test reconstructing exactly what the application must not.
      expect(body['item_code']).not.toBe(TEMPLATE);
      const serialised = JSON.stringify(body);
      expect(serialised).not.toContain('Orange');
      expect(serialised).not.toContain('Box');
      expect(serialised).not.toContain('Stores - ST');
      expect(body['uom']).toBeUndefined();
      expect(body['stock_uom']).toBeUndefined();
      expect(body['conversion_factor']).toBeUndefined();
      expect(body['warehouse']).toBeUndefined();
      expect(body['rate']).toBeUndefined();
      expect(body['price_list']).toBeUndefined();
      expect(body['stock_qty']).toBeUndefined();

      request.flush({ message: { data: {} } });
      http.expectOne((r) => r.url.includes('get_cart')).flush({ message: { data: {} } });
    });
  });

  describe('when the backend refuses', () => {
    it('explains an unavailable combination and offers nothing to buy', async () => {
      await open();
      await choose('Colour', 'Orange');
      await choose('Size', 'Medium');

      const { body, status } = variantError('variant_not_available', 404);
      pendingResolve().flush(body, { status, statusText: 'Not Found' });
      await settle();

      expect(el('item-variant-error')?.textContent).toContain('not available');
      expect(el('add-to-cart')).toBeNull();
      expect(el('item-rate')).toBeNull();
    });

    it('does not retry, and does not look for another SKU', async () => {
      await open();
      await choose('Colour', 'Orange');
      await choose('Size', 'Medium');

      const { body, status } = variantError('variant_not_available', 404);
      pendingResolve().flush(body, { status, statusText: 'Not Found' });
      await settle();

      // A stale matrix is not licence to guess: nothing is re-sent, and no second
      // combination is tried on the buyer's behalf. http.verify() would catch either.
      http.expectNone(() => true);
    });

    it('shows our wording, never the server text', async () => {
      await open();
      await choose('Colour', 'Orange');
      await choose('Size', 'Medium');

      const { body, status } = variantError('variant_not_available', 404);
      pendingResolve().flush(body, { status, statusText: 'Not Found' });
      await settle();

      expect(text()).not.toContain('Server wording');
    });

    it('handles an unsupported family safely', async () => {
      await open();
      await choose('Colour', 'Orange');
      await choose('Size', 'Medium');

      const { body, status } = variantError('variant_family_unsupported', 422);
      pendingResolve().flush(body, { status, statusText: 'Unprocessable Entity' });
      await settle();

      expect(el('item-variant-error')?.textContent).toContain('cannot be configured online');
      expect(el('add-to-cart')).toBeNull();
    });

    it('handles a required-attributes refusal without guessing which one', async () => {
      await open();
      await choose('Colour', 'Orange');
      await choose('Size', 'Medium');

      const { body, status } = variantError('variant_attributes_required', 422);
      pendingResolve().flush(body, { status, statusText: 'Unprocessable Entity' });
      await settle();

      expect(el('item-variant-error')?.textContent).toContain('every field');
    });
  });

  describe('a family that cannot be configured', () => {
    it('says so, and offers no controls at all', async () => {
      await open(familyPayload({ attributes: [], variants: [] }));

      expect(el('item-family-unavailable')).not.toBeNull();
      expect(el('item-attributes')).toBeNull();
      expect(el('add-to-cart')).toBeNull();
      expect(el('item-rate')).toBeNull();
    });
  });
});
