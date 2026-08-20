import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { toCartRowViews } from './cart.rows';
import { CartLine } from './parts/cart-line';
import type { CartLineDto, CartPricingRowDto, CartTaxComponentDto } from './contracts/cart.types';

function component(over: Partial<CartTaxComponentDto> = {}): CartTaxComponentDto {
  return {
    tax_type: 'CGST',
    label: 'CGST',
    rate: 9,
    amount: 9,
    taxable_amount: 100,
    included_in_print_rate: 0,
    charge_type: 'On Net Total',
    ...over,
  };
}

function row(over: Partial<CartPricingRowDto> = {}): CartPricingRowDto {
  return {
    row_id: '0',
    line_role: 'Paid',
    is_free_item: 0,
    item_code: 'ITEM-A',
    item_name: 'Item A',
    uom: 'Nos',
    stock_uom: 'Nos',
    conversion_factor: 1,
    qty: 1,
    stock_qty: 1,
    base_price: 100,
    rate: 100,
    discount_percentage: 0,
    discount_amount: 0,
    amount: 100,
    net_amount: 100,
    tax_amount: 18,
    total_amount: 118,
    tax_components: [component({ amount: 9 }), component({ tax_type: 'SGST', label: 'SGST', amount: 9 })],
    pricing_rules: [],
    source_line_ids: ['line-1'],
    ...over,
  };
}

function intent(over: Partial<CartLineDto> = {}): CartLineDto {
  return {
    item_code: 'ITEM-A',
    item_name: 'Item A',
    image: null,
    quantity: 1,
    base_price: 100,
    rate: 100,
    amount: 100,
    uom: 'Nos',
    stock_uom: 'Nos',
    discount_percentage: 0,
    discount_amount: 0,
    tax_amount: 0,
    total_amount: 0,
    item_slug: 'item-a',
    pricing_rule_label: null,
    ...over,
  } as CartLineDto;
}

@Component({
  imports: [CartLine],
  template: `<app-cart-line [view]="view()" currency="INR" />`,
})
class Host {
  readonly view = signal(toCartRowViews([row()], [intent()])[0]);
}

/**
 * Row tax is displayed, never computed.
 *
 * Every assertion below reads a number the backend supplied. The arithmetic tests are the
 * important ones: they pin figures that a "helpful" `net + tax` or `amount * rate / 100`
 * would get wrong, so the guarantee is proven by behaviour rather than by grepping source.
 */
describe('cart row tax', () => {
  // Configured once per test: `render` may be called twice in one test to compare a
  // paid row against its promotion counterpart, and reconfiguring mid-test throws.
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
      text: () => el.textContent ?? '',
      q: (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`),
      all: (id: string) =>
        Array.from(el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)).map(
          (n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        ),
    };
  }

  describe('exclusive tax', () => {
    it('shows the backend tax and total, not a computed one', async () => {
      const view = await render();

      expect(view.q('cart-line-tax')?.textContent).toContain('18.00');
      expect(view.q('cart-line-total')?.textContent).toContain('118.00');
    });
  });

  describe('inclusive tax', () => {
    it('shows the backend total, never net plus tax', async () => {
      // The case naive arithmetic gets wrong: the tax is already inside the price.
      const inclusive = row({
        amount: 100,
        net_amount: 84.75,
        tax_amount: 15.25,
        total_amount: 100,
      });
      const view = await render(toCartRowViews([inclusive], [intent()])[0]);

      expect(view.q('cart-line-total')?.textContent).toContain('100.00');
      // 84.75 + 15.25 = 100.00 is right; 100 + 15.25 = 115.25 would double-charge the tax.
      expect(view.text()).not.toContain('115.25');
      expect(view.q('cart-line-tax')?.textContent).toContain('15.25');
    });
  });

  describe('components', () => {
    it('renders CGST and SGST distinctly, with their own rates and amounts', async () => {
      const view = await render();
      const parts = view.all('cart-line-tax-component');

      expect(parts).toHaveLength(2);
      expect(parts[0]).toContain('CGST');
      expect(parts[0]).toContain('9%');
      expect(parts[1]).toContain('SGST');
    });

    it('renders a single IGST component', async () => {
      const igst = row({
        tax_amount: 18,
        total_amount: 118,
        tax_components: [component({ tax_type: 'IGST', label: 'IGST', rate: 18, amount: 18 })],
      });
      const parts = (await render(toCartRowViews([igst], [intent()])[0])).all(
        'cart-line-tax-component',
      );

      expect(parts).toHaveLength(1);
      expect(parts[0]).toContain('IGST');
      expect(parts[0]).toContain('18%');
    });

    it('names an unclassified component by its label rather than hiding it', async () => {
      // A GST-unregistered company produces real, unclassified tax.
      const generic = row({
        tax_amount: 5,
        total_amount: 105,
        tax_components: [
          component({ tax_type: null, label: 'Service Tax', rate: 5, amount: 5 }),
        ],
      });
      const view = await render(toCartRowViews([generic], [intent()])[0]);

      expect(view.all('cart-line-tax-component')).toHaveLength(1);
      expect(view.text()).toContain('Service Tax');
      // Never relabelled on a guess.
      expect(view.text()).not.toContain('GST 5%');
    });

    it('keeps the backend component order', async () => {
      const ordered = row({
        tax_components: [
          component({ tax_type: 'SGST', label: 'SGST', amount: 9 }),
          component({ tax_type: 'CGST', label: 'CGST', amount: 9 }),
        ],
      });
      const parts = (await render(toCartRowViews([ordered], [intent()])[0])).all(
        'cart-line-tax-component',
      );

      expect(parts[0]).toContain('SGST');
      expect(parts[1]).toContain('CGST');
    });

    it('shows a component the backend sent even when its amount is zero', async () => {
      const zeroPart = row({
        tax_amount: 0,
        total_amount: 100,
        tax_components: [component({ amount: 0 })],
      });
      const view = await render(toCartRowViews([zeroPart], [intent()])[0]);

      expect(view.all('cart-line-tax-component')).toHaveLength(1);
    });
  });

  describe('no arithmetic happens here', () => {
    it('does not derive tax from rate and amount', async () => {
      // 100 at 18% would be 18. The backend says 7, so 7 must appear and 18 must not.
      const odd = row({
        tax_amount: 7,
        total_amount: 107,
        tax_components: [component({ tax_type: 'IGST', label: 'IGST', rate: 18, amount: 7 })],
      });
      const view = await render(toCartRowViews([odd], [intent()])[0]);

      expect(view.q('cart-line-tax')?.textContent).toContain('7.00');
      expect(view.q('cart-line-total')?.textContent).toContain('107.00');
      expect(view.q('cart-line-total')?.textContent).not.toContain('118');
    });

    it('does not derive the total from net plus tax', async () => {
      // Deliberately inconsistent: a document-level effect ERPNext applied. The backend
      // total wins, whatever the parts add up to.
      const odd = row({ net_amount: 100, tax_amount: 18, total_amount: 111 });
      const view = await render(toCartRowViews([odd], [intent()])[0]);

      expect(view.q('cart-line-total')?.textContent).toContain('111.00');
      expect(view.q('cart-line-total')?.textContent).not.toContain('118');
    });

    it('does not derive row tax by summing its components', async () => {
      // Components sum to 17.99; ERPNext assigned the rounding difference elsewhere.
      const rounded = row({
        tax_amount: 18,
        total_amount: 118,
        tax_components: [
          component({ amount: 9 }),
          component({ tax_type: 'SGST', label: 'SGST', amount: 8.99 }),
        ],
      });
      const view = await render(toCartRowViews([rounded], [intent()])[0]);

      expect(view.q('cart-line-tax')?.textContent).toContain('18.00');
      expect(view.q('cart-line-tax')?.textContent).not.toContain('17.99');
    });

    it('does not derive a percentage from amount over taxable amount', async () => {
      // 9 / 200 is 4.5%, but the backend says the rate is 9%.
      const mismatch = row({
        tax_components: [component({ rate: 9, amount: 9, taxable_amount: 200 })],
      });
      const parts = (await render(toCartRowViews([mismatch], [intent()])[0])).all(
        'cart-line-tax-component',
      );

      expect(parts[0]).toContain('9%');
      expect(parts[0]).not.toContain('4.5%');
    });
  });

  describe('roles carry their own tax', () => {
    it('gives a promotion row its own components, never the paid row ones', async () => {
      const paid = row({ row_id: '0', tax_amount: 18, total_amount: 118 });
      const promo = row({
        row_id: '1',
        line_role: 'Promotion',
        is_free_item: 1,
        amount: 0,
        net_amount: 0,
        rate: 0,
        tax_amount: 0,
        total_amount: 0,
        tax_components: [component({ tax_type: 'CGST', label: 'CGST', amount: 0 })],
        source_line_ids: [],
      });
      const views = toCartRowViews([paid, promo], [intent()]);

      const paidView = await render(views[0]);
      expect(paidView.q('cart-line-tax')?.textContent).toContain('18.00');

      const promoView = await render(views[1]);
      // Same SKU, its own tax result - nothing borrowed from the paid row.
      expect(promoView.q('cart-line-tax')).toBeNull();
      expect(promoView.all('cart-line-tax-component')).toHaveLength(1);
      expect(promoView.q('cart-line-remove')).toBeNull();
    });

    it('renders tax for a gift SKU that has no intent row', async () => {
      const gift = row({
        row_id: '1',
        item_code: 'ITEM-B',
        item_name: 'Item B',
        line_role: 'Promotion',
        is_free_item: 1,
        tax_amount: 2,
        total_amount: 2,
        source_line_ids: [],
      });
      const view = await render(toCartRowViews([gift], [intent()])[0]);

      expect(view.q('cart-line-tax')?.textContent).toContain('2.00');
      expect(view.text()).toContain('Item B');
    });

    it('keeps a zero-rate paid row paid, with whatever tax the backend gave it', async () => {
      const free = row({ rate: 0, amount: 0, discount_percentage: 100, tax_amount: 0, total_amount: 0, tax_components: [] });
      const view = await render(toCartRowViews([free], [intent()])[0]);

      // Free to the buyer but still theirs: the control stays.
      expect(view.q('cart-line-remove')).not.toBeNull();
      expect(view.q('cart-line-tax')).toBeNull();
    });
  });

  it('stays quiet when there is no tax at all', async () => {
    const untaxed = row({ tax_amount: 0, total_amount: 100, tax_components: [] });
    const view = await render(toCartRowViews([untaxed], [intent()])[0]);

    // No "Tax ₹0.00" clutter, and the amount is still correct.
    expect(view.q('cart-line-tax')).toBeNull();
    expect(view.q('cart-line-tax-components')).toBeNull();
    expect(view.q('cart-line-amount')?.textContent).toContain('100.00');
  });
});
