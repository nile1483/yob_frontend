import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CATALOG_CURRENCY } from '../catalog.currency';
import type { CatalogItemDto } from '../contracts/catalog.types';
import { ItemCard } from './item-card';

function item(overrides: Partial<CatalogItemDto> = {}): CatalogItemDto {
  return {
    name: 'YOB-BOLT-M10',
    item_name: 'Hex Bolt M10 x 50mm',
    slug: 'hex-bolt-m10-50',
    // Sold by the Box, stocked in Nos: the two units are different fields for a reason,
    // and the card must caption the price with the selling one.
    uom: 'Box',
    conversion_factor: 25,
    stock_uom: 'Nos',
    has_variants: 0,
    price_state: 'priced',
    image: null,
    base_price: 12.5,
    rate: 11.25,
    discount_percentage: 10,
    discount_amount: 1.25,
    net_amount: 11.25,
    tax_amount: 0,
    total_amount: 11.25,
    pricing_rule_label: 'YOB Demo Bulk Discount',
    ...overrides,
  };
}

@Component({
  imports: [ItemCard],
  template: `<app-item-card [item]="value()" />`,
})
class Host {
  readonly value = signal<CatalogItemDto>(item());
}

describe('ItemCard', () => {
  async function render(dto: CatalogItemDto = item()) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: CATALOG_CURRENCY, useValue: 'INR' }],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.value.set(dto);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      element,
      text: () => element.textContent ?? '',
      testId: (id: string) => element.querySelector(`[data-testid="${id}"]`),
      settle: async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      },
    };
  }

  it('shows the item name and code', async () => {
    const view = await render();
    expect(view.text()).toContain('Hex Bolt M10 x 50mm');
    expect(view.text()).toContain('YOB-BOLT-M10');
  });

  it('labels the price with the selling UOM, never the stock UOM', async () => {
    const view = await render();

    // The fixture sells by the Box and stocks in Nos. Before backend Phase 23B-5U the
    // card only had `stock_uom` to work with and captioned a Box price "per Nos".
    expect(view.testId('item-uom')?.textContent).toContain('Box');
    expect(view.testId('item-uom')?.textContent).not.toContain('Nos');
  });

  describe('a variant family (Phase 24C)', () => {
    /** One card for the family, with no money on it. */
    function family(): CatalogItemDto {
      return item({
        name: 'YOB-VEST',
        item_name: 'Hi-Vis Safety Vest',
        slug: 'hi-vis-safety-vest',
        has_variants: 1,
        price_state: 'select_options',
        // The backend still sends these fields; a family card renders none of them.
        base_price: 0,
        rate: 0,
        discount_percentage: 0,
        pricing_rule_label: null,
      });
    }

    it('says Select options instead of a price', async () => {
      const view = await render(family());

      expect(view.testId('item-select-options')?.textContent).toContain('Select options');
      expect(view.testId('item-rate')).toBeNull();
    });

    it('invents no price, not even a cheapest or a zero', async () => {
      const view = await render(family());

      // A family has no single price. Showing ₹0.00, or the lowest child's price, would
      // both be figures the backend never quoted.
      expect(view.text()).not.toContain('₹');
      expect(view.text()).not.toContain('0.00');
      expect(view.testId('item-base-price')).toBeNull();
      expect(view.testId('item-discount')).toBeNull();
      expect(view.testId('item-uom')).toBeNull();
    });

    it('still links to the family page', async () => {
      const view = await render(family());

      expect(view.testId('item-link')?.getAttribute('href')).toBe(
        '/catalog/item/hi-vis-safety-vest',
      );
    });

    it('keeps the ordinary priced card for a simple item', async () => {
      const view = await render();

      expect(view.testId('item-select-options')).toBeNull();
      expect(view.testId('item-rate')?.textContent).toContain('11.25');
    });

    it('shows a price whenever the backend has not said otherwise', async () => {
      // A row from a backend that predates price_state must not lose its price.
      const view = await render(item({ price_state: undefined as unknown as 'priced' }));

      expect(view.testId('item-rate')?.textContent).toContain('11.25');
      expect(view.testId('item-select-options')).toBeNull();
    });
  });

  it('does not convert the price into stock units', async () => {
    // conversion_factor is 25. A card that multiplied would show 281.25.
    const view = await render();

    expect(view.testId('item-rate')?.textContent).toContain('11.25');
    expect(view.testId('item-rate')?.textContent).not.toContain('281');
  });

  describe('pricing', () => {
    it('renders the backend rate as localized currency, not concatenated text', async () => {
      const view = await render();
      const rate = view.testId('item-rate')?.textContent ?? '';

      // Formatted through CurrencyPipe: a symbol and grouped decimals, never "INR11.25".
      expect(rate).toContain('11.25');
      expect(rate).toMatch(/[₹]/);
      expect(rate).not.toContain('INR11.25');
    });

    it('shows the struck-through base price when discounted', async () => {
      const view = await render();

      expect(view.testId('item-base-price')?.textContent).toContain('12.50');
      expect(view.testId('item-base-price')?.tagName).toBe('S');
    });

    it('shows the backend discount percentage', async () => {
      const view = await render();
      expect(view.testId('item-discount')?.textContent).toContain('10');
    });

    it('never derives a discount figure of its own', async () => {
      // base_price - rate would be 1.25 here too, but the card must show the
      // backend's discount_percentage, not a number it worked out.
      const view = await render(item({ discount_percentage: 7, base_price: 20, rate: 11.25 }));

      expect(view.testId('item-discount')?.textContent).toContain('7');
      expect(view.testId('item-discount')?.textContent).not.toContain('43');
    });

    it('hides discount decoration when there is no discount', async () => {
      const view = await render(
        item({ base_price: 1.2, rate: 1.2, discount_percentage: 0, discount_amount: 0 }),
      );

      expect(view.testId('item-base-price')).toBeNull();
      expect(view.testId('item-discount')).toBeNull();
      expect(view.testId('item-rate')?.textContent).toContain('1.20');
    });

    it('does not advertise a 0% discount when a rule matched but changed nothing', async () => {
      const view = await render(
        item({ base_price: 12.5, rate: 12.5, discount_percentage: 0, pricing_rule_label: 'Rule' }),
      );

      expect(view.testId('item-discount')).toBeNull();
    });

    it('shows the pricing rule label when the backend supplies one', async () => {
      const view = await render();
      expect(view.testId('item-pricing-rule')?.textContent).toContain('YOB Demo Bulk Discount');
    });

    it('renders nothing for a missing pricing rule label', async () => {
      const view = await render(item({ pricing_rule_label: null }));
      expect(view.testId('item-pricing-rule')).toBeNull();
    });

    it('uses the injected currency rather than a hardcoded symbol', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideRouter([]), { provide: CATALOG_CURRENCY, useValue: 'USD' }],
      });
      const fixture = TestBed.createComponent(Host);
      await fixture.whenStable();

      const rate =
        (fixture.nativeElement as HTMLElement).querySelector('[data-testid="item-rate"]')
          ?.textContent ?? '';
      expect(rate).toContain('$');
      expect(rate).not.toContain('₹');
    });
  });

  describe('image', () => {
    it('renders a decorative placeholder when there is no image', async () => {
      const view = await render(item({ image: null }));

      expect(view.element.querySelector('img')).toBeNull();
      expect(view.element.querySelector('[aria-hidden="true"]')).not.toBeNull();
    });

    it('renders the path the backend supplied', async () => {
      // Root-relative is what a Frappe Attach Image field stores; it resolves
      // same-origin, so no rewriting is needed.
      const view = await render(item({ image: '/files/hex-bolt-m10.png' }));
      const img = view.element.querySelector('img');

      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('/files/hex-bolt-m10.png');
    });

    it('leaves the card image alt empty, because the name is right beside it', async () => {
      // The whole tile is one link whose text is the product name, so naming the image
      // too makes a screen reader announce the same product twice. The item detail page
      // is the opposite case - there the image is the subject - and it does pass a name.
      const view = await render(item({ image: '/files/hex-bolt-m10.png' }));

      expect(view.element.querySelector('img')?.getAttribute('alt')).toBe('');
    });

    it('falls back to the placeholder when the image fails to load', async () => {
      const view = await render(item({ image: '/files/deleted-from-disk.png' }));
      const img = view.element.querySelector('img');
      expect(img).not.toBeNull();

      // A URL that 404s is the same thing to a buyer as no picture at all, and must
      // never leave the browser's broken-image icon in a product grid.
      img?.dispatchEvent(new Event('error'));
      await view.settle();

      expect(view.element.querySelector('img')).toBeNull();
      expect(view.element.querySelector('[aria-hidden="true"]')).not.toBeNull();
    });
  });

  it('uses a heading for the item name so a listing has structure', async () => {
    const view = await render();
    expect(view.element.querySelector('h3')?.textContent).toContain('Hex Bolt M10 x 50mm');
  });

  describe('navigation', () => {
    it('links the item to its detail route', async () => {
      const view = await render();
      const link = view.testId('item-link') as HTMLAnchorElement;

      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toBe('/catalog/item/hex-bolt-m10-50');
    });

    it('links using the item slug, not the item code', async () => {
      // `slug` is the routable identifier; `name` is the Frappe item code.
      const view = await render(item({ slug: 'flat-washer-m10', name: 'YOB-WASH-M10' }));

      expect(view.testId('item-link')?.getAttribute('href')).toBe('/catalog/item/flat-washer-m10');
    });

    it('keeps the link inside the heading so a listing keeps its outline', async () => {
      const view = await render();
      expect(view.element.querySelector('h3 a[data-testid="item-link"]')).not.toBeNull();
    });

    it('has exactly one interactive element, so the tile is unambiguous', async () => {
      const view = await render();

      // The stretched link covers the card; a future add-to-cart button will need to
      // sit above it rather than beside it.
      expect(view.element.querySelectorAll('a, button')).toHaveLength(1);
    });
  });
});
