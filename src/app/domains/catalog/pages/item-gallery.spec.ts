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

const TEMPLATE = 'YOB-VEST';
const ORANGE_MEDIUM = 'YOB-VEST-ORG-M';
const FAMILY_SLUG = 'hi-vis-safety-vest';
const SIMPLE_SLUG = 'hex-bolt-m10-50';

/**
 * Product gallery ownership, at the page level (Phase 27C).
 *
 * `product-gallery.spec.ts` proves the picker works. This file proves the page hands it
 * the **right** data, which is where the ownership rule actually lives:
 *
 * - a simple Item's gallery is its own;
 * - a family's gallery is the **template's**;
 * - a generated variant contributes nothing to either, ever.
 *
 * The third is the one worth having tests for. It is asserted here against a resolver
 * response that deliberately carries a different image and - in one case - illegally
 * carries a gallery too, because a guard that only holds while the backend behaves is not
 * a guard.
 */
describe('ItemPage product gallery', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ItemPage>;

  const GALLERY = [
    { image: '/files/side.png', alt_text: 'Side', caption: 'Side view', is_primary: false },
    { image: '/files/front.png', alt_text: 'Front', caption: 'Front view', is_primary: true },
    { image: '/files/back.png', alt_text: null, caption: null, is_primary: false },
  ];

  function simplePayload(over: Record<string, unknown> = {}) {
    return {
      message: {
        data: {
          name: 'YOB-BOLT-M10',
          item_name: 'Hex Bolt M10 x 50mm',
          image: '/files/base-bolt.png',
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
          actual_qty: 10,
          pricing: {},
          pricing_rule_label: null,
          pricing_rule_apply_on: null,
          available_rules: [],
          gallery: [],
          sections: [],
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
          image: '/files/template-base.png',
          item_group: 'Safety Equipment',
          custom_slug: FAMILY_SLUG,
          is_template: 1,
          is_purchasable: 0,
          attributes: [
            { attribute: 'Colour', numeric: 0, values: ['Orange'] },
            { attribute: 'Size', numeric: 0, values: ['Medium'] },
          ],
          variants: [
            { item_code: ORANGE_MEDIUM, attributes: { Colour: 'Orange', Size: 'Medium' } },
          ],
          gallery: [],
          sections: [],
          ...over,
        },
        notice: 'Item loaded',
      },
    };
  }

  /** What `resolve_variant` answers: the serializer, with no merchandising on it. */
  function variantPayload(over: Record<string, unknown> = {}) {
    return {
      message: {
        data: {
          name: ORANGE_MEDIUM,
          item_name: 'Hi-Vis Safety Vest - Orange, Medium',
          image: '/files/VARIANT-RED-LARGE.png',
          item_group: 'Safety Equipment',
          custom_slug: FAMILY_SLUG,
          qty: 1,
          is_template: 0,
          is_purchasable: 1,
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

  function mainSrc(): string | null {
    return el('item-image')?.querySelector('img')?.getAttribute('src') ?? null;
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
        (node) =>
          node.getAttribute('data-attribute') === attribute &&
          node.getAttribute('data-value') === value,
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

  describe('a simple product', () => {
    it('shows its own gallery', async () => {
      await open(SIMPLE_SLUG, simplePayload({ gallery: GALLERY }));

      expect(mainSrc()).toContain('front.png');
      expect(all('product-gallery-thumb')).toHaveLength(3);
    });

    it('prefers its gallery over its base image', async () => {
      await open(SIMPLE_SLUG, simplePayload({ gallery: GALLERY }));

      expect(mainSrc()).not.toContain('base-bolt');
    });

    it('does not add the base image as an extra gallery row', async () => {
      await open(SIMPLE_SLUG, simplePayload({ gallery: GALLERY }));

      const sources = all('product-gallery-thumb').map(
        (button) => button.querySelector('img')?.getAttribute('src') ?? '',
      );

      expect(sources).toHaveLength(3);
      expect(sources.join(' ')).not.toContain('base-bolt');
    });

    it('falls back to its base image when no gallery is configured', async () => {
      await open(SIMPLE_SLUG, simplePayload({ gallery: [] }));

      expect(mainSrc()).toContain('base-bolt');
      expect(all('product-gallery-thumb')).toHaveLength(0);
    });

    it('shows the shared placeholder with neither gallery nor image', async () => {
      await open(SIMPLE_SLUG, simplePayload({ gallery: [], image: null }));

      expect(el('item-image-placeholder')).not.toBeNull();
    });
  });

  describe('a variant family', () => {
    it('shows the template gallery', async () => {
      await open(FAMILY_SLUG, familyPayload({ gallery: GALLERY }));

      expect(mainSrc()).toContain('front.png');
      expect(all('product-gallery-thumb')).toHaveLength(3);
    });

    it('falls back to the template base image when it has no gallery', async () => {
      await open(FAMILY_SLUG, familyPayload({ gallery: [] }));

      expect(mainSrc()).toContain('template-base');
    });
  });

  describe('resolving a variant', () => {
    it('leaves the template gallery and the chosen image exactly as they were', async () => {
      await open(FAMILY_SLUG, familyPayload({ gallery: GALLERY }));

      // The buyer picks the third image, which is not the primary.
      (all('product-gallery-thumb')[2] as HTMLButtonElement).click();
      await settle();
      expect(mainSrc()).toContain('back.png');

      await chooseOrangeMedium();

      // Still theirs. Not the variant's photograph, and not reset to the primary.
      expect(mainSrc()).toContain('back.png');
      expect(mainSrc()).not.toContain('VARIANT-RED-LARGE');
      expect(
        all('product-gallery-thumb').map(
          (button) => button.querySelector('img')?.getAttribute('src') ?? '',
        ),
      ).toEqual([
        expect.stringContaining('side.png'),
        expect.stringContaining('front.png'),
        expect.stringContaining('back.png'),
      ]);
    });

    it('never substitutes the variant image for a template fallback either', async () => {
      await open(FAMILY_SLUG, familyPayload({ gallery: [] }));
      expect(mainSrc()).toContain('template-base');

      await chooseOrangeMedium();

      expect(mainSrc()).toContain('template-base');
      expect(mainSrc()).not.toContain('VARIANT-RED-LARGE');
    });

    it('ignores merchandising even if a resolver response illegally carries it', async () => {
      // The contract says resolve_variant answers ProductDetail and cannot carry these.
      // Asserted anyway: the page must not grow a path that reads them, so that a
      // backend regression could never reach a buyer's screen.
      await open(FAMILY_SLUG, familyPayload({ gallery: GALLERY }));
      await chooseOrangeMedium(
        variantPayload({
          gallery: [{ image: '/files/ROGUE.png', alt_text: null, caption: null, is_primary: true }],
        }),
      );

      expect(mainSrc()).toContain('front.png');
      expect(mainSrc()).not.toContain('ROGUE');
    });

    it('still updates the item code, price, UOM and stock', async () => {
      // The gallery holding still must not come from the page ignoring the resolver.
      await open(FAMILY_SLUG, familyPayload({ gallery: GALLERY }));
      await chooseOrangeMedium();

      const rendered = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(
        /\s+/g,
        ' ',
      );

      expect(rendered).toContain(ORANGE_MEDIUM);
      expect(el('item-rate')?.textContent).toContain('1,000');
      expect(el('item-uom')?.textContent).toContain('Box');
      expect(el('item-availability')?.textContent).toContain('125');
    });

    it('issues no request of its own when a thumbnail is clicked', async () => {
      await open(FAMILY_SLUG, familyPayload({ gallery: GALLERY }));

      (all('product-gallery-thumb')[0] as HTMLButtonElement).click();
      await settle();
      (all('product-gallery-thumb')[2] as HTMLButtonElement).click();
      await settle();

      // Nothing outstanding: `afterEach` verifies, and this says it explicitly.
      http.verify();
      expect(mainSrc()).toContain('back.png');
    });
  });

  describe('page composition', () => {
    it('renders no product content section yet', async () => {
      // Phase 27C is the gallery only. `sections` arrives and is deliberately not drawn;
      // the renderer is 27D, and this fails if one appears early.
      await open(
        SIMPLE_SLUG,
        simplePayload({
          gallery: GALLERY,
          sections: [
            { title: 'Description', blocks: [{ type: 'rich_text', content: '<p>Hello</p>' }] },
          ],
        }),
      );

      expect(el('product-content')).toBeNull();
      expect(((fixture.nativeElement as HTMLElement).textContent ?? '')).not.toContain(
        'Description',
      );
      expect((fixture.nativeElement as HTMLElement).innerHTML).not.toContain('Hello');
    });

    it('keeps the route content slots in their locked positions', async () => {
      await open(SIMPLE_SLUG, simplePayload({ gallery: GALLERY }));

      const html = (fixture.nativeElement as HTMLElement).innerHTML;
      const above = html.indexOf('data-slot="above_product"');
      const gallery = html.indexOf('data-testid="product-gallery"');
      const below = html.indexOf('data-slot="below_product"');

      // Slots render nothing when empty, so absent is the ordinary case here; what must
      // never happen is the gallery escaping the band between them.
      expect(gallery).toBeGreaterThan(-1);
      if (above > -1) {
        expect(above).toBeLessThan(gallery);
      }
      if (below > -1) {
        expect(below).toBeGreaterThan(gallery);
      }
    });
  });
});
