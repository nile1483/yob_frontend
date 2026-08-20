import { describe, expect, it } from 'vitest';

import { toCartRowViews } from './cart.rows';
import type { CartLineDto, CartPricingRowDto } from './contracts/cart.types';

function paid(over: Partial<CartPricingRowDto> = {}): CartPricingRowDto {
  return {
    row_id: '0',
    line_role: 'Paid',
    is_free_item: 0,
    item_code: 'ITEM-A',
    item_name: 'Item A',
    uom: 'Nos',
    stock_uom: 'Nos',
    conversion_factor: 1,
    qty: 2,
    stock_qty: 2,
    base_price: 100,
    rate: 100,
    discount_percentage: 0,
    discount_amount: 0,
    amount: 200,
    net_amount: 200,
    tax_amount: 36,
    total_amount: 236,
    tax_components: [
      {
        tax_type: 'CGST',
        label: 'CGST',
        rate: 9,
        amount: 18,
        taxable_amount: 200,
        included_in_print_rate: 0,
        charge_type: 'On Net Total',
      },
      {
        tax_type: 'SGST',
        label: 'SGST',
        rate: 9,
        amount: 18,
        taxable_amount: 200,
        included_in_print_rate: 0,
        charge_type: 'On Net Total',
      },
    ],
    pricing_rules: [],
    source_line_ids: ['line-1'],
    ...over,
  };
}

function promotion(over: Partial<CartPricingRowDto> = {}): CartPricingRowDto {
  return paid({
    row_id: '1',
    line_role: 'Promotion',
    is_free_item: 1,
    qty: 1,
    stock_qty: 1,
    base_price: 0,
    rate: 0,
    amount: 0,
    net_amount: 0,
    tax_amount: 0,
    total_amount: 0,
    tax_components: [],
    source_line_ids: [],
    ...over,
  });
}

function intent(over: Partial<CartLineDto> = {}): CartLineDto {
  return {
    item_code: 'ITEM-A',
    item_name: 'Item A',
    image: '/files/a.jpg',
    quantity: 2,
    base_price: 100,
    rate: 100,
    amount: 200,
    uom: 'Nos',
    stock_uom: 'Nos',
    discount_percentage: 0,
    discount_amount: 0,
    tax_amount: 0,
    total_amount: 200,
    item_slug: 'item-a',
    pricing_rule_label: 'Bulk offer',
    ...over,
  } as CartLineDto;
}

describe('cart projection', () => {
  it('renders the priced projection, not the intent snapshot', () => {
    // The intent row still holds the pre-pricing rate; the projection is what ERPNext
    // actually charged. The display must follow the projection.
    const views = toCartRowViews([paid({ rate: 80, amount: 160 })], [intent({ rate: 100 })]);

    expect(views).toHaveLength(1);
    expect(views[0].row.rate).toBe(80);
    expect(views[0].row.amount).toBe(160);
  });

  it('keeps a same-SKU paid and promotion row separate', () => {
    const views = toCartRowViews([paid(), promotion()], [intent()]);

    // Two rows for one SKU. Merging or de-duplicating them is the bug backend Phase
    // 23B-1 fixed: the free row would overwrite the paid row's price.
    expect(views).toHaveLength(2);
    expect(views.map((v) => v.row.row_id)).toEqual(['0', '1']);
    expect(views[0].row.rate).toBe(100);
    expect(views[1].row.rate).toBe(0);
  });

  it('gives the paid row mutation controls and the promotion row none', () => {
    const views = toCartRowViews([paid(), promotion()], [intent()]);

    expect(views[0].mutable).toBe(true);
    // ERPNext generated it; the buyer does not own it and cannot remove it.
    expect(views[1].mutable).toBe(false);
  });

  it('renders a different-SKU gift that exists in no cart item', () => {
    const gift = promotion({ item_code: 'ITEM-B', item_name: 'Item B' });
    const views = toCartRowViews([paid(), gift], [intent()]);

    expect(views).toHaveLength(2);
    expect(views[1].row.item_code).toBe('ITEM-B');
    expect(views[1].mutable).toBe(false);
    // No intent row, so no thumbnail or product link - correct rather than degraded.
    expect(views[1].image).toBeNull();
    expect(views[1].slug).toBeNull();
  });

  it('treats a paid row priced to zero as Paid, not a promotion', () => {
    // A legitimate 100% discount. Inferring the role from rate === 0 would tell the
    // buyer they are getting a gift when they are not.
    const views = toCartRowViews([paid({ rate: 0, amount: 0, discount_percentage: 100 })], [intent()]);

    expect(views[0].row.line_role).toBe('Paid');
    expect(views[0].mutable).toBe(true);
  });

  it('does not offer controls for a paid row with no matching intent', () => {
    const views = toCartRowViews([paid({ item_code: 'ITEM-GHOST' })], [intent()]);

    // Nothing to mutate: Remove takes an item_code the cart does not hold.
    expect(views[0].mutable).toBe(false);
  });

  it('joins decoration from the intent row only', () => {
    const views = toCartRowViews([paid({ rate: 80 })], [intent({ rate: 100 })]);

    expect(views[0].image).toBe('/files/a.jpg');
    expect(views[0].slug).toBe('item-a');
    expect(views[0].ruleLabel).toBe('Bulk offer');
    // ...while every figure still comes from the projection.
    expect(views[0].row.rate).toBe(80);
  });

  it('shows no offer wording on a promotion row', () => {
    const views = toCartRowViews([promotion()], [intent()]);
    expect(views[0].ruleLabel).toBeNull();
  });

  it('carries source_line_ids through without using them for lookup', () => {
    // Typed because the contract supplies it. It cannot be resolved today - cart.items
    // exposes no row name - so mapping is by item_code, and this pins that the ids are
    // preserved rather than silently dropped.
    const views = toCartRowViews([paid({ source_line_ids: ['abc', 'def'] })], [intent()]);
    expect(views[0].row.source_line_ids).toEqual(['abc', 'def']);
    expect(views[0].mutable).toBe(true);
  });

  it('keeps projection order', () => {
    const rows = [paid({ row_id: '0' }), promotion({ row_id: '1' }), paid({ row_id: '2', item_code: 'ITEM-C' })];
    expect(toCartRowViews(rows, [intent()]).map((v) => v.row.row_id)).toEqual(['0', '1', '2']);
  });
});
