import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { toCartRowViews } from './cart.rows';
import { CartLine } from './parts/cart-line';
import type { CartLineDto, CartPricingRowDto } from './contracts/cart.types';

/**
 * Row UOM is displayed, per row, exactly as the projection reports it.
 *
 * The cases below are the ones a "tidy" implementation gets wrong: a promotion row and
 * its paid row share an `item_code` and legitimately do **not** share a unit, because
 * ERPNext gives a free Product Discount row `Pricing Rule.free_item_uom` or the item's
 * `stock_uom`. Anything that reached for the cart item's unit, the stock unit or the
 * conversion factor would agree with the backend by luck and disagree the moment a
 * merchant sells by the Box.
 */

function row(over: Partial<CartPricingRowDto> = {}): CartPricingRowDto {
  return {
    row_id: '0',
    line_role: 'Paid',
    is_free_item: 0,
    item_code: 'ITEM-A',
    item_name: 'Item A',
    // Sold by the Box, stocked in Nos, 25 to a Box.
    uom: 'Box',
    stock_uom: 'Nos',
    conversion_factor: 25,
    qty: 2,
    stock_qty: 50,
    base_price: 1000,
    rate: 1000,
    discount_percentage: 0,
    discount_amount: 0,
    amount: 2000,
    net_amount: 2000,
    tax_amount: 0,
    total_amount: 2000,
    tax_components: [],
    pricing_rules: [],
    source_line_ids: ['line-1'],
    ...over,
  };
}

/** The free row ERPNext generates for the same SKU: one Nos, not one Box. */
function freeRow(over: Partial<CartPricingRowDto> = {}): CartPricingRowDto {
  return row({
    row_id: '1',
    line_role: 'Promotion',
    is_free_item: 1,
    uom: 'Nos',
    stock_uom: 'Nos',
    conversion_factor: 1,
    qty: 1,
    stock_qty: 1,
    base_price: 0,
    rate: 0,
    amount: 0,
    net_amount: 0,
    total_amount: 0,
    ...over,
  });
}

function intent(over: Partial<CartLineDto> = {}): CartLineDto {
  return {
    item_code: 'ITEM-A',
    item_name: 'Item A',
    image: null,
    quantity: 2,
    base_price: 1000,
    rate: 1000,
    amount: 2000,
    uom: 'Box',
    stock_uom: 'Nos',
    discount_percentage: 0,
    discount_amount: 0,
    tax_amount: 0,
    total_amount: 2000,
    item_slug: 'item-a',
    pricing_rule_label: null,
    ...over,
  };
}

@Component({
  imports: [CartLine],
  template: `<app-cart-line [view]="view()" currency="INR" />`,
})
class Host {
  readonly view = signal(toCartRowViews([row()], [intent()])[0]);
}

describe('cart row UOM', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  async function render(view = toCartRowViews([row()], [intent()])[0]) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.view.set(view);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return {
      text: () => (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
      q: (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`),
    };
  }

  describe('a paid row', () => {
    it('shows the projection row own UOM', async () => {
      const view = await render();

      expect(view.q('cart-line-uom')?.textContent?.trim()).toBe('Box');
      expect(view.q('cart-line-quantity')?.textContent?.trim()).toBe('2');
    });

    it('does not fall back to the cart item unit', async () => {
      // The intent row disagrees with the projection. The projection wins: it is what
      // ERPNext priced, and the intent row is a snapshot of what was asked for.
      const view = await render(
        toCartRowViews([row({ uom: 'Box' })], [intent({ uom: 'Nos' })])[0],
      );

      expect(view.q('cart-line-uom')?.textContent?.trim()).toBe('Box');
    });

    it('does not fall back to the stock UOM', async () => {
      const view = await render(toCartRowViews([row({ stock_uom: 'Nos' })], [intent()])[0]);

      expect(view.q('cart-line-uom')?.textContent?.trim()).not.toBe('Nos');
    });

    it('does not convert the quantity or the rate through the conversion factor', async () => {
      // conversion_factor is 25: a converted quantity would read 50, and a converted
      // rate 40. Both figures are the backend's, in the backend's unit.
      const view = await render();

      expect(view.q('cart-line-quantity')?.textContent?.trim()).toBe('2');
      expect(view.text()).not.toContain('50 Box');
      expect(view.q('cart-line-rate')?.textContent).toContain('1,000');
    });
  });

  describe('a promotion row for the same SKU', () => {
    it('keeps its own UOM rather than the paid row one', async () => {
      const views = toCartRowViews([row(), freeRow()], [intent()]);

      const paid = await render(views[0]);
      const promotion = await render(views[1]);

      expect(paid.q('cart-line-uom')?.textContent?.trim()).toBe('Box');
      expect(promotion.q('cart-line-uom')?.textContent?.trim()).toBe('Nos');
    });

    it('reads 1 Nos, added by an offer', async () => {
      const views = toCartRowViews([row(), freeRow()], [intent()]);
      const promotion = await render(views[1]);

      expect(promotion.text()).toContain('1 Nos, added by an offer');
    });

    it('still offers no quantity or removal control', async () => {
      const views = toCartRowViews([row(), freeRow()], [intent()]);
      const promotion = await render(views[1]);

      expect(promotion.q('cart-line-remove')).toBeNull();
      expect(promotion.q('cart-line-rate')).toBeNull();
    });
  });

  describe('a promotion row for a SKU the buyer never asked for', () => {
    it('shows its own UOM with no intent row to borrow one from', async () => {
      const gift = freeRow({ row_id: '2', item_code: 'ITEM-GIFT', item_name: 'Gift', uom: 'Pack' });
      const views = toCartRowViews([row(), gift], [intent()]);

      const promotion = await render(views[1]);

      expect(promotion.q('cart-line-uom')?.textContent?.trim()).toBe('Pack');
    });
  });
});
