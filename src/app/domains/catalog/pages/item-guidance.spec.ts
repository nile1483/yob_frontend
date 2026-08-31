import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { YOB_API_CONFIG, type YobApiConfig } from '../../../foundation/network/yob-api.config';
import { ItemPage } from './item-page';
import { answerRouteContent } from '../../content/route-content.testing';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

const SIMPLE_SLUG = 'hex-bolt-m10-50';
const FAMILY_SLUG = 'hi-vis-safety-vest';
const TEMPLATE = 'YOB-VEST';
const ORANGE_MEDIUM = 'YOB-VEST-ORG-M';

/**
 * MRP and quantity guidance on the product page (Phase 29B).
 *
 * Two features that share one source - the resolved Item Price - and one rule that
 * governs both: **neither is ever enforced.** The backend accepts quantities outside this
 * guidance, so nothing here may refuse one, and no message may claim the server would.
 *
 * Driven against the testing backend so every request - and every request that must not
 * happen while a buyer edits a quantity - is observable.
 */
describe('ItemPage MRP and quantity guidance', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ItemPage>;

  const NONE = { moq: null, quantity_multiplier: null, allowed: true };

  function simplePayload(over: Record<string, unknown> = {}) {
    return {
      message: {
        data: {
          name: 'YOB-BOLT-M10',
          item_name: 'Hex Bolt M10 x 50mm',
          image: null,
          item_group: 'Fasteners',
          custom_slug: SIMPLE_SLUG,
          qty: 1,
          is_template: 0,
          is_purchasable: 1,
          variant_of: null,
          selected: null,
          base_price: 100,
          rate: 100,
          discount_percentage: 0,
          discount_amount: 0,
          net_amount: 100,
          tax_amount: 0,
          tax_label: null,
          total_amount: 100,
          uom: 'Nos',
          stock_uom: 'Nos',
          conversion_factor: 1,
          stock_qty: 1,
          is_stock_item: 1,
          warehouse: 'Stores - ST',
          actual_qty: 500,
          pricing: {},
          pricing_rule_label: null,
          pricing_rule_apply_on: null,
          available_rules: [],
          gallery: [],
          sections: [],
          mrp: null,
          quantity_control: NONE,
          ...over,
        },
        notice: 'Item loaded',
      },
    };
  }

  function familyPayload(over: Record<string, unknown> = {}) {
    return {
      message: {
        data: {
          name: TEMPLATE,
          item_name: 'Hi-Vis Safety Vest',
          image: null,
          item_group: 'Safety Equipment',
          custom_slug: FAMILY_SLUG,
          is_template: 1,
          is_purchasable: 0,
          attributes: [
            { attribute: 'Colour', numeric: 0, values: ['Orange', 'Yellow'] },
            { attribute: 'Size', numeric: 0, values: ['Medium', 'Large'] },
          ],
          variants: [
            { item_code: ORANGE_MEDIUM, attributes: { Colour: 'Orange', Size: 'Medium' } },
            { item_code: 'YOB-VEST-YEL-L', attributes: { Colour: 'Yellow', Size: 'Large' } },
          ],
          gallery: [],
          sections: [],
          ...over,
        },
        notice: 'Item loaded',
      },
    };
  }

  function variantPayload(over: Record<string, unknown> = {}) {
    return {
      message: {
        data: {
          ...simplePayload().message.data,
          name: ORANGE_MEDIUM,
          item_name: 'Hi-Vis Safety Vest - Orange, Medium',
          custom_slug: FAMILY_SLUG,
          variant_of: TEMPLATE,
          selected: { Colour: 'Orange', Size: 'Medium' },
          uom: 'Box',
          ...over,
        },
        notice: 'Variant resolved',
      },
    };
  }

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

  function input(): HTMLInputElement {
    return el('item-quantity') as HTMLInputElement;
  }

  function quantity(): string {
    return input().value;
  }

  /** Type a value and commit it, exactly as a blur or Enter would. */
  async function type(value: string): Promise<void> {
    input().value = value;
    input().dispatchEvent(new Event('input'));
    await settle();
    input().dispatchEvent(new Event('change'));
    await settle();
  }

  async function open(slug: string, payload: object): Promise<void> {
    fixture = TestBed.createComponent(ItemPage);
    fixture.componentRef.setInput('itemSlug', slug);
    fixture.detectChanges();
    answerRouteContent(http);
    http.expectOne((r) => r.url.includes('get_item')).flush(payload);
    await settle();
  }

  async function chooseOrangeMedium(payload = variantPayload()): Promise<void> {
    for (const [attribute, value] of [
      ['Colour', 'Orange'],
      ['Size', 'Medium'],
    ]) {
      const button = all('item-attribute-value').find(
        (n) =>
          n.getAttribute('data-attribute') === attribute && n.getAttribute('data-value') === value,
      );
      (button as HTMLButtonElement).click();
      await settle();
    }
    http.expectOne((r) => r.url.includes('resolve_variant')).flush(payload);
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

  // ------------------------------------------------------------------------ MRP

  describe('MRP', () => {
    it('renders a positive MRP', async () => {
      await open(SIMPLE_SLUG, simplePayload({ mrp: 1500 }));

      expect(el('item-mrp')).not.toBeNull();
      expect(el('item-mrp')?.textContent).toContain('MRP');
      expect(el('item-mrp')?.textContent).toContain('1,500');
    });

    it('renders nothing when there is no MRP', async () => {
      await open(SIMPLE_SLUG, simplePayload({ mrp: null }));

      expect(el('item-mrp')).toBeNull();
    });

    it('renders nothing for a zero or negative MRP', async () => {
      for (const mrp of [0, -5]) {
        await open(SIMPLE_SLUG, simplePayload({ mrp }));
        expect(el('item-mrp')).toBeNull();
      }
    });

    it('uses the same currency formatting as the rate', async () => {
      await open(SIMPLE_SLUG, simplePayload({ mrp: 1500, rate: 1200 }));

      // Same symbol and grouping as the price beside it - one currency context, and no
      // separate MRP currency field anywhere.
      const rate = el('item-rate')?.textContent ?? '';
      const mrp = el('item-mrp')?.textContent ?? '';
      const symbol = rate.trim().charAt(0);
      expect(mrp).toContain(symbol);
      expect(mrp).toContain('1,500');
    });

    it('shows even when the quantity guidance is disallowed', async () => {
      // An MRP has no quantity behaviour, so a Pricing Rule cannot conflict with it.
      await open(
        SIMPLE_SLUG,
        simplePayload({ mrp: 900, quantity_control: { moq: 10, quantity_multiplier: 6, allowed: false } }),
      );

      expect(el('item-mrp')?.textContent).toContain('900');
      expect(quantity()).toBe('1');
    });

    it('derives no saving, percentage or comparison from it', async () => {
      // The contract says the MRP is not validated against the rate and may be LOWER, so
      // any derived discount would sometimes be negative. Nothing is derived at all.
      await open(SIMPLE_SLUG, simplePayload({ mrp: 1000, rate: 700, base_price: 700 }));

      const text = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
      expect(text).not.toContain('You save');
      expect(text).not.toContain('300');
      expect(text).not.toContain('30%');
      // The existing discount badge is driven by base_price vs rate, and is absent here.
      expect(el('item-discount')).toBeNull();
    });

    it('shows a lower MRP than the rate without complaint', async () => {
      await open(SIMPLE_SLUG, simplePayload({ mrp: 50, rate: 700 }));

      expect(el('item-mrp')?.textContent).toContain('50');
      expect(el('item-rate')?.textContent).toContain('700');
    });

    it('updates when a variant resolves, and clears when the new one has none', async () => {
      await open(FAMILY_SLUG, familyPayload());
      expect(el('item-mrp')).toBeNull();

      await chooseOrangeMedium(variantPayload({ mrp: 1400 }));
      expect(el('item-mrp')?.textContent).toContain('1,400');

      // Re-resolve to a variant with no MRP: the previous variant's figure must go.
      await open(FAMILY_SLUG, familyPayload());
      await chooseOrangeMedium(variantPayload({ mrp: null }));
      expect(el('item-mrp')).toBeNull();
    });

    it('is not rendered on a family before a variant resolves', async () => {
      // A template is not priced, so it has no Item Price and no MRP to show.
      await open(FAMILY_SLUG, familyPayload());

      expect(el('item-mrp')).toBeNull();
    });
  });

  // ------------------------------------------------------------- default behaviour

  describe('with no usable guidance', () => {
    it('behaves exactly as before when nothing is configured', async () => {
      await open(SIMPLE_SLUG, simplePayload({ quantity_control: NONE }));

      expect(quantity()).toBe('1');
      expect(input().getAttribute('step')).toBe('any');
      expect(input().getAttribute('min')).toBeNull();
    });

    it('ignores BOTH values when allowed is false', async () => {
      // The pair is governed by one flag. Applying the MOQ but not the multiplier would
      // be a third behaviour the contract never describes.
      await open(
        SIMPLE_SLUG,
        simplePayload({ quantity_control: { moq: 10, quantity_multiplier: 6, allowed: false } }),
      );

      expect(quantity()).toBe('1');
      expect(input().getAttribute('step')).toBe('any');
      expect(input().getAttribute('min')).toBeNull();

      // And a typed value is left alone rather than snapped to a sequence.
      await type('7');
      expect(quantity()).toBe('7');
    });

    it('treats zero and negative configuration as unset', async () => {
      await open(
        SIMPLE_SLUG,
        simplePayload({ quantity_control: { moq: 0, quantity_multiplier: -3, allowed: true } }),
      );

      expect(quantity()).toBe('1');
      expect(input().getAttribute('step')).toBe('any');
    });
  });

  // -------------------------------------------------------------------- MOQ + step

  describe('MOQ and multiplier together', () => {
    const BOTH = { moq: 10, quantity_multiplier: 6, allowed: true };

    it('starts at the MOQ', async () => {
      await open(SIMPLE_SLUG, simplePayload({ quantity_control: BOTH }));

      expect(quantity()).toBe('10');
    });

    it('exposes the sequence to the native control, counting from the start', async () => {
      // With both `min` and `step`, the browser's own spinner counts from `min`: 10, 16,
      // 22 - the contract's rule, not multiples of six.
      await open(SIMPLE_SLUG, simplePayload({ quantity_control: BOTH }));

      expect(input().getAttribute('min')).toBe('10');
      expect(input().getAttribute('step')).toBe('6');
    });

    it('normalises a typed value onto the sequence, rounding down', async () => {
      await open(SIMPLE_SLUG, simplePayload({ quantity_control: BOTH }));

      // 10, 16, 22, 28 ... a value between two valid ones settles on the lower.
      await type('19');
      expect(quantity()).toBe('16');

      await type('22');
      expect(quantity()).toBe('22');

      await type('27');
      expect(quantity()).toBe('22');

      await type('28');
      expect(quantity()).toBe('28');
    });

    it('clamps a value below the start up to the start', async () => {
      await open(SIMPLE_SLUG, simplePayload({ quantity_control: BOTH }));

      await type('3');
      expect(quantity()).toBe('10');

      await type('0');
      expect(quantity()).toBe('10');
    });

    it('never produces a value below the start, whatever is typed', async () => {
      await open(SIMPLE_SLUG, simplePayload({ quantity_control: BOTH }));

      for (const typed of ['1', '5', '9', '9.9']) {
        await type(typed);
        expect(Number(quantity())).toBeGreaterThanOrEqual(10);
      }
    });

    it('settles a cleared box on the start rather than on an error', async () => {
      // `Number('')` is 0, which the clamp lifts to the start. Deterministic and quiet,
      // which is what a guidance-only feature should be: clearing the box and tabbing
      // away leaves a buyable quantity rather than a validation message.
      await open(SIMPLE_SLUG, simplePayload({ quantity_control: BOTH }));

      await type('');
      expect(quantity()).toBe('10');
      expect(el('add-to-cart')?.hasAttribute('disabled')).toBe(false);
    });

    it('still refuses genuinely unparseable input', async () => {
      // `Number('abc')` is NaN, which is left exactly as it is so the existing
      // "enter a quantity greater than zero" validation still speaks.
      await open(SIMPLE_SLUG, simplePayload({ quantity_control: BOTH }));

      input().value = 'abc';
      input().dispatchEvent(new Event('input'));
      await settle();

      expect(el('add-to-cart')?.hasAttribute('disabled')).toBe(true);
      expect(el('item-quantity-error') ?? el('add-to-cart')).not.toBeNull();
    });

    it('leaves a cleared box alone when there is no guidance', async () => {
      // The pre-29B path is untouched: no guidance, no clamp, and the existing
      // validation still refuses an empty box.
      await open(SIMPLE_SLUG, simplePayload({ quantity_control: NONE }));

      await type('');
      expect(el('add-to-cart')?.hasAttribute('disabled')).toBe(true);
    });
  });

  describe('MOQ only', () => {
    it('starts at the MOQ and leaves the step unconstrained', async () => {
      await open(
        SIMPLE_SLUG,
        simplePayload({ quantity_control: { moq: 25, quantity_multiplier: null, allowed: true } }),
      );

      expect(quantity()).toBe('25');
      // No invented step: the input stays as free as it always was.
      expect(input().getAttribute('step')).toBe('any');
      expect(input().getAttribute('min')).toBe('25');
    });

    it('clamps below the MOQ but accepts any value above it', async () => {
      await open(
        SIMPLE_SLUG,
        simplePayload({ quantity_control: { moq: 25, quantity_multiplier: null, allowed: true } }),
      );

      await type('4');
      expect(quantity()).toBe('25');

      await type('37');
      expect(quantity()).toBe('37');

      await type('26.5');
      expect(quantity()).toBe('26.5');
    });
  });

  describe('multiplier only', () => {
    const STEP_ONLY = { moq: null, quantity_multiplier: 5, allowed: true };

    it('keeps the ordinary start rather than forcing it up to the multiplier', async () => {
      await open(SIMPLE_SLUG, simplePayload({ quantity_control: STEP_ONLY }));

      expect(quantity()).toBe('1');
      expect(input().getAttribute('step')).toBe('5');
      // `min` is set even with no MOQ. HTML counts a step from the step BASE, which is
      // `min` - or zero when absent. Without it the browser would treat 0, 5, 10 as the
      // valid values and reject the start of 1 outright.
      expect(input().getAttribute('min')).toBe('1');
    });

    it('steps from the ordinary start: 1, 6, 11', async () => {
      await open(SIMPLE_SLUG, simplePayload({ quantity_control: STEP_ONLY }));

      await type('6');
      expect(quantity()).toBe('6');

      await type('11');
      expect(quantity()).toBe('11');

      // Between two valid values, rounds down. 8 -> 6, not 11 and not 5.
      await type('8');
      expect(quantity()).toBe('6');
      await type('4');
      expect(quantity()).toBe('1');
    });
  });

  describe('the native control agrees with the guidance', () => {
    // The regression this pins was real: `step="5"` with no `min` makes the browser's
    // step base ZERO, so it rejected the starting quantity of 1 with its own validation
    // bubble and Add to cart silently did nothing. Checking `checkValidity()` at the
    // start is what catches that, because the sequence assertions alone did not.
    for (const [label, control, expected] of [
      ['MOQ and multiplier', { moq: 10, quantity_multiplier: 6, allowed: true }, '10'],
      ['MOQ only', { moq: 25, quantity_multiplier: null, allowed: true }, '25'],
      ['multiplier only', { moq: null, quantity_multiplier: 5, allowed: true }, '1'],
      ['no guidance', NONE, '1'],
      [
        'disallowed',
        { moq: 10, quantity_multiplier: 6, allowed: false },
        '1',
      ],
    ] as const) {
      it(`starts on a natively valid value: ${label}`, async () => {
        await open(SIMPLE_SLUG, simplePayload({ quantity_control: control }));

        expect(quantity()).toBe(expected);
        expect(input().checkValidity(), input().validationMessage).toBe(true);
        expect(el('add-to-cart')?.hasAttribute('disabled')).toBe(false);
      });
    }

    it('keeps every normalised value natively valid', async () => {
      await open(
        SIMPLE_SLUG,
        simplePayload({ quantity_control: { moq: 10, quantity_multiplier: 6, allowed: true } }),
      );

      for (const typed of ['19', '3', '28', '100']) {
        await type(typed);
        expect(input().checkValidity(), `${typed} -> ${quantity()}`).toBe(true);
      }
    });
  });

  describe('fractional guidance', () => {
    it('survives floating-point arithmetic without dropping a step', async () => {
      // 10 + 3*0.1 is not exactly 10.3 in binary. A naive floor would answer 10.2.
      await open(
        SIMPLE_SLUG,
        simplePayload({ quantity_control: { moq: 10, quantity_multiplier: 0.1, allowed: true } }),
      );

      await type('10.3');
      expect(Number(quantity())).toBeCloseTo(10.3, 6);
    });
  });

  // ---------------------------------------------------------------------- variants

  describe('variants', () => {
    it('adopts the resolved variant own starting quantity', async () => {
      await open(FAMILY_SLUG, familyPayload());
      // A family is not priced, so there is no quantity box until a SKU resolves.
      expect(el('item-quantity')).toBeNull();

      await chooseOrangeMedium(
        variantPayload({ quantity_control: { moq: 10, quantity_multiplier: 5, allowed: true } }),
      );

      expect(quantity()).toBe('10');
      expect(input().getAttribute('step')).toBe('5');
    });

    it('never carries variant A guidance onto variant B', async () => {
      await open(FAMILY_SLUG, familyPayload());
      await chooseOrangeMedium(
        variantPayload({ mrp: 900, quantity_control: { moq: 10, quantity_multiplier: 5, allowed: true } }),
      );
      expect(quantity()).toBe('10');

      // Re-choose, resolving to a variant with a different Item Price.
      const yellow = all('item-attribute-value').find(
        (n) => n.getAttribute('data-attribute') === 'Colour' && n.getAttribute('data-value') === 'Yellow',
      );
      (yellow as HTMLButtonElement).click();
      await settle();
      const large = all('item-attribute-value').find(
        (n) => n.getAttribute('data-attribute') === 'Size' && n.getAttribute('data-value') === 'Large',
      );
      (large as HTMLButtonElement).click();
      await settle();

      http.expectOne((r) => r.url.includes('resolve_variant')).flush(
        variantPayload({
          name: 'YOB-VEST-YEL-L',
          selected: { Colour: 'Yellow', Size: 'Large' },
          mrp: 120,
          quantity_control: { moq: 2, quantity_multiplier: 2, allowed: true },
        }),
      );
      await settle();

      expect(quantity()).toBe('2');
      expect(input().getAttribute('min')).toBe('2');
      expect(input().getAttribute('step')).toBe('2');
      expect(el('item-mrp')?.textContent).toContain('120');
      expect(el('item-mrp')?.textContent).not.toContain('900');
    });

    it('falls back to the ordinary quantity for a disallowed variant', async () => {
      await open(FAMILY_SLUG, familyPayload());

      await chooseOrangeMedium(
        variantPayload({ quantity_control: { moq: 12, quantity_multiplier: 4, allowed: false } }),
      );

      expect(quantity()).toBe('1');
      expect(input().getAttribute('min')).toBeNull();
      expect(input().getAttribute('step')).toBe('any');
    });

    it('holds no stale guidance while the resolver is in flight', async () => {
      await open(FAMILY_SLUG, familyPayload());
      await chooseOrangeMedium(
        variantPayload({ mrp: 900, quantity_control: { moq: 10, quantity_multiplier: 5, allowed: true } }),
      );

      // Start a second resolution and inspect the page before it answers.
      const yellow = all('item-attribute-value').find(
        (n) => n.getAttribute('data-attribute') === 'Colour' && n.getAttribute('data-value') === 'Yellow',
      );
      (yellow as HTMLButtonElement).click();
      await settle();

      // The previous variant is gone the moment the selection changed: no MRP, and no
      // quantity box at all until a new SKU is resolved.
      expect(el('item-mrp')).toBeNull();
      expect(el('item-quantity')).toBeNull();

      const large = all('item-attribute-value').find(
        (n) => n.getAttribute('data-attribute') === 'Size' && n.getAttribute('data-value') === 'Large',
      );
      (large as HTMLButtonElement).click();
      await settle();
      http.expectOne((r) => r.url.includes('resolve_variant')).flush(variantPayload({ mrp: null }));
      await settle();
    });
  });

  // ------------------------------------------------------------- no network, no claims

  describe('quantity editing is local', () => {
    it('issues no request at all while the quantity changes', async () => {
      await open(
        SIMPLE_SLUG,
        simplePayload({ quantity_control: { moq: 10, quantity_multiplier: 6, allowed: true } }),
      );

      await type('16');
      await type('22');
      await type('19');
      await type('3');

      // Not a reprice, not a re-read, not a resolver call, not a listing call. `afterEach`
      // verifies nothing is outstanding; these say which ones specifically must be absent.
      http.expectNone((r) => r.url.includes('get_item'));
      http.expectNone((r) => r.url.includes('resolve_variant'));
      http.expectNone((r) => r.url.includes('get_items'));
      http.expectNone((r) => r.url.includes('get_product_suggestions'));
    });

    it('sends only item_code and qty to the cart, with the guided quantity', async () => {
      await open(
        SIMPLE_SLUG,
        simplePayload({ mrp: 1500, quantity_control: { moq: 10, quantity_multiplier: 6, allowed: true } }),
      );
      await type('22');

      const form = (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();

      const request = http.expectOne((r) => r.url.includes('add_to_cart'));
      const body = request.request.body as Record<string, unknown>;

      // The payload is unchanged by this phase: no moq, no multiplier, no mrp.
      expect(Object.keys(body).sort()).toEqual(['item_code', 'qty']);
      expect(body).toEqual({ item_code: 'YOB-BOLT-M10', qty: 22 });

      request.flush({ message: { data: {} } });
      http.expectOne((r) => r.url.includes('get_cart')).flush({ message: { data: {} } });
      await settle();
    });

    it('claims no backend enforcement anywhere on the page', async () => {
      // The contract is explicit that these are never enforced. A message promising a
      // rejection would be the storefront inventing a refusal the cart would not make.
      await open(
        SIMPLE_SLUG,
        simplePayload({ mrp: 1500, quantity_control: { moq: 10, quantity_multiplier: 6, allowed: true } }),
      );

      const text = ((fixture.nativeElement as HTMLElement).textContent ?? '').toLowerCase();
      for (const phrase of ['minimum order', 'will be rejected', 'pack size', 'must be at least', 'moq']) {
        expect(text, `the page claims: ${phrase}`).not.toContain(phrase);
      }
    });
  });
});
