import { Service, inject, signal } from '@angular/core';

import type {
  CartAddressDto,
  CartContactDto,
  CartLineDto,
  CartPayloadDto,
  CartPricingRowDto,
  CartTaxComponentDto,
} from '../../app/domains/cart/contracts/cart.types';
import {
  MOCK_ADDRESS_LOCAL,
  MOCK_CONTACT_PRIMARY,
  MOCK_HOME_STATE,
  MOCK_INTERSTATE_SURCHARGE_RATE,
} from '../fixtures/address-book.fixture';
import { MOCK_ITEM_DETAILS_BY_SLUG, MOCK_VARIANT_DETAILS } from '../fixtures/catalog.fixture';
import { couponDiscountRate } from '../fixtures/coupon.fixture';
import { MockApiScenario } from '../scenarios/mock-scenario';
import { MockServerAddressBook } from './mock-server-address-book';

/** The gift SKU the different-item promotion scenario hands out. */
export const MOCK_GIFT_ITEM_CODE = 'YOB-GIFT-CAP';
export const MOCK_GIFT_ITEM_NAME = 'YOB Branded Cap';

/**
 * Split a line's tax into CGST and SGST, as an intra-state sale does.
 *
 * The halves carry the rounding remainder on the first component, so the two amounts do
 * not always sum evenly to `tax_amount`. That asymmetry is the point: a UI that summed
 * components rather than reading the authoritative `tax_amount` would drift by a paisa,
 * and this fixture makes that drift visible.
 */
function splitGst(taxAmount: number, taxableAmount: number): CartTaxComponentDto[] {
  if (taxAmount === 0) {
    return [];
  }
  const half = Math.round((taxAmount / 2) * 100) / 100;
  const remainder = Math.round((taxAmount - half) * 100) / 100;
  const base = { taxable_amount: taxableAmount, included_in_print_rate: 0, charge_type: 'On Net Total' };
  return [
    { tax_type: 'CGST', label: 'CGST', rate: 9, amount: half, ...base },
    { tax_type: 'SGST', label: 'SGST', rate: 9, amount: remainder, ...base },
  ];
}

/**
 * The mock API's server-side cart.
 *
 * Server state, like `MockServerSession`: it lives behind the interceptor and the
 * application reaches it only through HTTP. Nothing is written to localStorage or
 * sessionStorage, so a page reload resets it - acceptable for a stand-in, and recorded
 * as a known limitation.
 *
 * Prices come from the catalog item fixtures, and the line/cart arithmetic happens
 * *here* because here is the server. That is exactly the work the frontend must never
 * do.
 */
@Service()
export class MockServerCart {
  /** item_code -> quantity. The only thing the mock cart really stores. */
  private readonly quantities = signal<ReadonlyMap<string, number>>(new Map());

  /** Item codes whose rate the "server" has changed since they were added. */
  private readonly repricedCodes = signal<ReadonlySet<string>>(new Set());
  /** Item codes the "server" has withdrawn. */
  private readonly withdrawnCodes = signal<ReadonlySet<string>>(new Set());

  private readonly addressBook = inject(MockServerAddressBook);
  private readonly scenario = inject(MockApiScenario);

  /**
   * The cart's current selections.
   *
   * Seeded, because a customer who has ordered before already has a contact and a
   * billing address on their cart - and preselection is a behaviour worth testing
   * rather than a state only reachable by first clicking something.
   */
  private readonly contactPerson = signal<string | null>(MOCK_CONTACT_PRIMARY);
  private readonly billingAddress = signal<string | null>(MOCK_ADDRESS_LOCAL);
  private readonly shippingAddress = signal<string | null>(MOCK_ADDRESS_LOCAL);

  /**
   * Forces `is_shippable` to 0.
   *
   * The real backend derives it from `is_stock_item` on the cart's items, and every
   * catalog fixture here is a physical product, so a non-shippable cart is not
   * reachable by ordinary means. This stands in for a cart of services or downloads.
   */
  private readonly notShippable = signal(false);

  readonly isEmpty = () => this.quantities().size === 0;

  /**
   * Look up an item by its Frappe item code, as `add_to_cart` does.
   *
   * Resolved variants are included: a variant has no slug of its own to be fetched by,
   * but it is an ordinary salable SKU once the resolver has named it, and the cart takes
   * it exactly like any other. A template code is deliberately **not** here - nothing can
   * add one, which is what makes the mock refuse it with `item_not_found`.
   */
  findItemByCode(itemCode: string) {
    return (
      Object.values(MOCK_ITEM_DETAILS_BY_SLUG).find((item) => item.name === itemCode) ??
      MOCK_VARIANT_DETAILS.find((item) => item.name === itemCode)
    );
  }

  /**
   * Add a quantity to an item's line, creating the line if it is not there.
   *
   * ## `qty` is a DELTA
   *
   * `cart.py` does `existing.quantity = (existing.quantity or 0) + qty`, so a line
   * holding 2 that receives 5 ends at **7** - not 5, and not a second row. Verified by
   * execution against the running backend (`tests/test_cart_quantity_semantics.py`)
   * and recorded in the backend handoff.
   *
   * Earlier phases of this frontend pinned the opposite - SET - and were wrong. The
   * regression tests were rewritten rather than adjusted, because a test asserting
   * `2 then 5 is 5` was actively protecting a defect.
   *
   * **Not idempotent.** Applying the same call twice adds twice: 2 → 7 → 12. That is
   * why the store guards re-entry and why nothing retries this call.
   */
  addQuantity(itemCode: string, quantity: number): void {
    const next = new Map(this.quantities());
    next.set(itemCode, (next.get(itemCode) ?? 0) + quantity);
    this.quantities.set(next);
  }

  /**
   * Put a line at an exact quantity, bypassing the delta.
   *
   * Test scaffolding only - there is no absolute set-quantity endpoint, so this has no
   * counterpart in the backend and is never reachable from application code. It exists
   * so a test can arrange a starting cart in one step instead of reasoning about
   * accumulated deltas.
   */
  seedQuantity(itemCode: string, quantity: number): void {
    const next = new Map(this.quantities());
    next.set(itemCode, quantity);
    this.quantities.set(next);
  }

  /**
   * Drop an item code from the cart.
   *
   * Matches the current backend, which filters out every row whose `item_code`
   * matches. That is unambiguous today only because Add keeps one effective row per
   * code - see the deferred contract note in `docs/PROJECT-STATE.md`.
   */
  removeItem(itemCode: string): void {
    const next = new Map(this.quantities());
    next.delete(itemCode);
    this.quantities.set(next);
  }

  /** Whether a code is currently in the cart. */
  has(itemCode: string): boolean {
    return this.quantities().has(itemCode);
  }

  /** Mark an item as repriced by the server, for the reconciliation scenario. */
  markRepriced(itemCode: string): void {
    this.repricedCodes.set(new Set([...this.repricedCodes(), itemCode]));
  }

  /** Mark an item as withdrawn, for the removed-item reconciliation scenario. */
  markWithdrawn(itemCode: string): void {
    this.withdrawnCodes.set(new Set([...this.withdrawnCodes(), itemCode]));
  }

  /** Logout ends the session, and the cart belongs to it. */
  reset(): void {
    this.quantities.set(new Map());
    this.repricedCodes.set(new Set());
    this.withdrawnCodes.set(new Set());
    this.contactPerson.set(MOCK_CONTACT_PRIMARY);
    this.billingAddress.set(MOCK_ADDRESS_LOCAL);
    this.shippingAddress.set(MOCK_ADDRESS_LOCAL);
    this.notShippable.set(false);
  }

  // ------------------------------------------------------------- selections

  setContactPerson(name: string): void {
    this.contactPerson.set(name);
  }

  /**
   * Set the billing address, and adopt it for shipping when shipping is empty.
   *
   * Wire-verified backend behaviour, reproduced rather than invented:
   * `set_cart_billing_address` does `if not cart.shipping_address: cart.shipping_address
   * = billing_address`, and its reply echoes both fields for that reason.
   */
  setBillingAddress(name: string): void {
    this.billingAddress.set(name);
    if (this.shippingAddress() === null) {
      this.shippingAddress.set(name);
    }
  }

  setShippingAddress(name: string): void {
    this.shippingAddress.set(name);
  }

  /**
   * Leave the cart with no shipping address.
   *
   * The state a first-time cart is in, and the only one in which the backend copies
   * billing across - so it has to be reachable for that behaviour to be testable.
   */
  clearShippingAddress(): void {
    this.shippingAddress.set(null);
  }

  /**
   * The applied coupon, upper-cased.
   *
   * Server-side state like everything else here. The real backend stores
   * `(code or "").strip().upper()`, so this does too - which is what makes "the
   * applied code shown is the server's, not what the buyer typed" testable.
   */
  private readonly couponCode = signal<string | null>(null);

  currentCouponCode(): string | null {
    return this.couponCode();
  }

  /** Apply a coupon. The handler has already validated it against the fixtures. */
  setCoupon(code: string): void {
    this.couponCode.set(code.trim().toUpperCase());
  }

  clearCoupon(): void {
    this.couponCode.set(null);
  }

  currentContactPerson(): string | null {
    return this.contactPerson();
  }

  currentBillingAddress(): string | null {
    return this.billingAddress();
  }

  currentShippingAddress(): string | null {
    return this.shippingAddress();
  }

  /**
   * Whether this cart needs shipping.
   *
   * An empty cart never does - the backend's `any(...)` over zero rows is false, and
   * that detail matters because `set_cart_shipping_address` refuses with
   * `shipping_not_applicable` in exactly that case.
   */
  isShippable(): boolean {
    return !this.notShippable() && this.quantities().size > 0;
  }

  /** Force the non-shippable state. Used by the `cart-not-shippable` scenario. */
  setNotShippable(value: boolean): void {
    this.notShippable.set(value);
  }

  /**
   * Build the canonical `get_cart` payload.
   *
   * Reconciliation is applied here, on read, exactly as the backend does it: withdrawn
   * lines are dropped and reported by code, repriced lines get a new rate and are
   * reported by code.
   */
  buildPayload(options: { reprice?: boolean; withdraw?: boolean } = {}): CartPayloadDto {
    const removed: string[] = [];
    const repriced: string[] = [];
    const lines: CartLineDto[] = [];

    for (const [itemCode, quantity] of this.quantities()) {
      const item = this.findItemByCode(itemCode);
      if (item === undefined) {
        removed.push(itemCode);
        continue;
      }

      const withdrawn = options.withdraw === true || this.withdrawnCodes().has(itemCode);
      if (withdrawn) {
        removed.push(itemCode);
        continue;
      }

      const shouldReprice = options.reprice === true || this.repricedCodes().has(itemCode);
      // A visible, deterministic change so a test can prove the new rate is shown.
      const rate = shouldReprice ? round(item.rate + 1) : item.rate;
      if (shouldReprice) {
        repriced.push(itemCode);
      }

      const amount = round(rate * quantity);
      const taxAmount = round(item.tax_amount * quantity);

      lines.push({
        item_code: item.name,
        item_name: item.item_name,
        image: item.image,
        quantity,
        base_price: item.base_price,
        rate,
        amount,
        // Two different units, and the fixture now has an item where they differ.
        uom: item.uom,
        stock_uom: item.stock_uom,
        discount_percentage: shouldReprice ? 0 : item.discount_percentage,
        discount_amount: shouldReprice ? 0 : item.discount_amount,
        tax_amount: taxAmount,
        total_amount: round(amount + taxAmount),
        item_slug: item.custom_slug,
        pricing_rule_label: shouldReprice ? null : item.pricing_rule_label,
      });
    }

    const grossNet = round(lines.reduce((sum, line) => sum + line.amount, 0));

    // The coupon's transaction-level discount.
    //
    // A flat percentage from the fixture, NOT a reimplementation of ERPNext's Pricing
    // Rule engine - the frontend is being tested against the contract (a server-owned
    // `coupon_discount` that moves the totals), not against ERPNext's arithmetic.
    //
    // It reduces `net_total` and therefore `grand_total`, which is what the real
    // backend was observed doing: applying a coupon moved net 135.00 -> 108.00 and
    // coupon_discount 0 -> 27.00, while item-level `total_discount` stayed 15.00.
    const couponRate = couponDiscountRate(this.couponCode());
    const couponDiscount = round(grossNet * couponRate);
    const netTotal = round(grossNet - couponDiscount);

    const lineTax = round(lines.reduce((sum, line) => sum + line.tax_amount, 0));

    // Destination-based surcharge: shipping out of the company's own state costs more.
    // A stand-in for real tax rules, and the reason a selection can change the total -
    // which is the behaviour the frontend has to get right. Nothing in the application
    // knows this rule exists; it only reads the totals that come back.
    const billingState = this.addressBook.findAddress(this.billingAddress() ?? '')?.state ?? null;
    const surcharge =
      billingState !== null && billingState !== MOCK_HOME_STATE
        ? round(netTotal * MOCK_INTERSTATE_SURCHARGE_RATE)
        : 0;

    const taxTotal = round(lineTax + surcharge);
    const totalQuantity = round(lines.reduce((sum, line) => sum + line.quantity, 0));
    const totalDiscount = round(
      lines.reduce((sum, line) => sum + line.discount_amount * line.quantity, 0),
    );

    return {
      cart: {
        name: 'CART-MOCK-0001',
        customer: 'Mock Trading Co',
        company: 'Shayona Technology',
        user: 'mock.buyer@example.invalid',
        currency: 'INR',
        selling_price_list: 'Standard Selling',
        status: 'Draft',
        order_type: 'Shopping Cart',
        is_shippable: this.isShippable() ? 1 : 0,
        contact_person: this.contactPerson(),
        billing_address: this.billingAddress(),
        shipping_address: this.shippingAddress(),
        company_address: null,
        sales_order: null,
        checkout_by: 'mock.buyer@example.invalid',
        ordered_on: '2026-08-10 12:00:00.000000',
        total_quantity: totalQuantity,
        net_total: netTotal,
        tax_total: taxTotal,
        grand_total: round(netTotal + taxTotal),
        total_discount: totalDiscount,
        // Two separate fields, kept separate: item-level discount above, the coupon's
        // transaction-level discount here. Never merged.
        coupon_code: this.couponCode(),
        coupon_discount: couponDiscount,
        items: lines,
        pricing_rows: this.buildPricingRows(lines),
      },
      // Resolved blocks, as `build_cart_response` returns them: a summary of the
      // selected record, not the master record itself.
      contact: this.resolveContact(),
      billing_address: this.resolveAddress(this.billingAddress()),
      shipping_address: this.resolveAddress(this.shippingAddress()),
      cart_updated: removed.length > 0 || repriced.length > 0,
      removed_items: removed,
      price_updated_items: repriced,
      // Reported, but NOT counted as `cart_updated`: the backend does not restate a line
      // in the new unit, so nothing about the cart actually changed. It is a condition
      // the buyer has to resolve, not an edit the server already made.
      uom_changed_items: this.uomChangedCodes(lines),
    };
  }

  /**
   * Lines whose stored UOM is no longer the item's selling UOM.
   *
   * Scenario-driven, because it is otherwise unreachable: the mock cart records a line
   * with whatever unit the item sells in *now*, so the two can only disagree if the
   * item's UOM changed in ERPNext after the line was created. The scenario stands in for
   * that merchant edit, and it is the same fact `add_to_cart` refuses on.
   */
  private uomChangedCodes(lines: readonly CartLineDto[]): string[] {
    if (this.scenario.scenario() !== 'cart-item-uom-changed') {
      return [];
    }
    return lines.map((line) => line.item_code);
  }

  /**
   * The priced projection ERPNext would derive from the temporary Sales Order.
   *
   * Mirrors the real contract rather than echoing `items`: every paid line becomes a
   * `Paid` row, and the promotion scenarios add ERPNext-generated `Promotion` rows that
   * exist in no cart item. `row_id` is positional and stable within a response, which is
   * what lets one SKU appear twice without the two rows colliding.
   */
  private buildPricingRows(lines: readonly CartLineDto[]): CartPricingRowDto[] {
    const rows: CartPricingRowDto[] = lines.map((line, index) => {
      // The server's own conversion, done here because here is the server. A row of
      // 2 Box is 50 Nos of stock, and the browser is told rather than asked to work it
      // out - which is the whole point of the field being on the wire.
      const conversionFactor = this.findItemByCode(line.item_code)?.conversion_factor ?? 1;

      return {
        row_id: String(index),
        line_role: 'Paid',
        is_free_item: 0,
        item_code: line.item_code,
        item_name: line.item_name,
        uom: line.uom,
        stock_uom: line.stock_uom,
        conversion_factor: conversionFactor,
        qty: line.quantity,
        stock_qty: round(line.quantity * conversionFactor),
        base_price: line.base_price,
        rate: line.rate,
        discount_percentage: line.discount_percentage,
        discount_amount: line.discount_amount,
        amount: line.amount,
        net_amount: line.amount,
        // Tax exactly as the backend reports it, so the frontend has nothing to compute.
        tax_amount: line.tax_amount,
        total_amount: line.total_amount,
        tax_components: splitGst(line.tax_amount, line.amount),
        // The frontend's CartLineDto does not carry rule names; the projection does.
        pricing_rules: line.pricing_rule_label === null ? [] : ['PRLE-MOCK-0001'],
        // The real backend supplies cart-item row names here. They are unresolvable in the
        // browser because `items` carries no `name`, and the mock reproduces that faithfully
        // rather than inventing an id the application could accidentally start relying on.
        source_line_ids: [`mock-line-${index}`],
      };
    });

    const scenario = this.scenario.scenario();
    const first = lines[0];
    if (first === undefined) {
      return rows;
    }

    if (scenario === 'cart-promotion-same-item') {
      // Buy some, get one of the *same* SKU free. The row that used to overwrite the
      // paid row's price before backend Phase 23B-1.
      //
      // The free row is priced in the item's **stock** UOM, which is what ERPNext does
      // when the Pricing Rule sets no `free_item_uom`. With the bolt - sold by the Box,
      // stocked in Nos - that produces a paid `Box` row beside a promotional `Nos` row
      // for one item code, which is exactly the case a UI must not "tidy up".
      rows.push(
        this.freeRow(
          String(rows.length),
          first.item_code,
          first.item_name,
          first.stock_uom,
          first.stock_uom,
        ),
      );
    }

    if (scenario === 'cart-promotion-other-item') {
      // A gift of a different SKU, which exists in no cart item at all.
      rows.push(this.freeRow(String(rows.length), MOCK_GIFT_ITEM_CODE, MOCK_GIFT_ITEM_NAME, 'Nos', 'Nos'));
    }

    if (scenario === 'cart-tax-inclusive') {
      // The case naive arithmetic gets wrong: the tax is already inside `amount`, so the
      // total equals the amount. `net + tax` would show 115.25 and charge tax twice.
      rows[0] = {
        ...rows[0],
        amount: 100,
        net_amount: 84.75,
        tax_amount: 15.25,
        total_amount: 100,
        tax_components: [
          {
            tax_type: 'CGST',
            label: 'CGST',
            rate: 9,
            amount: 7.63,
            taxable_amount: 84.75,
            included_in_print_rate: 1,
            charge_type: 'On Net Total',
          },
          {
            tax_type: 'SGST',
            label: 'SGST',
            rate: 9,
            amount: 7.62,
            taxable_amount: 84.75,
            included_in_print_rate: 1,
            charge_type: 'On Net Total',
          },
        ],
      };
    }

    if (scenario === 'cart-tax-igst') {
      rows[0] = {
        ...rows[0],
        amount: 100,
        net_amount: 100,
        tax_amount: 18,
        total_amount: 118,
        tax_components: [
          {
            tax_type: 'IGST',
            label: 'IGST',
            rate: 18,
            amount: 18,
            taxable_amount: 100,
            included_in_print_rate: 0,
            charge_type: 'On Net Total',
          },
        ],
      };
    }

    if (scenario === 'cart-tax-generic') {
      // A GST-unregistered company produces real but unclassified tax. `tax_type` is
      // null, so the buyer-facing name has to come from `label`.
      rows[0] = {
        ...rows[0],
        amount: 100,
        net_amount: 100,
        tax_amount: 5,
        total_amount: 105,
        tax_components: [
          {
            tax_type: null,
            label: 'Service Tax',
            rate: 5,
            amount: 5,
            taxable_amount: 100,
            included_in_print_rate: 0,
            charge_type: 'On Net Total',
          },
        ],
      };
    }

    if (scenario === 'cart-summary-mismatch') {
      // Rows deliberately disagreeing with the document totals, so a future
      // "simplification" that summed rows would be caught immediately.
      rows[0] = { ...rows[0], tax_amount: 999, total_amount: 9999 };
    }

    if (scenario === 'cart-paid-zero-rate') {
      // A *paid* row priced to zero by a legitimate 100% discount. Must not be labelled
      // a promotion merely because it is free.
      rows[0] = {
        ...rows[0],
        rate: 0,
        amount: 0,
        net_amount: 0,
        discount_percentage: 100,
        discount_amount: rows[0].base_price,
        // Free to the buyer, and ERPNext still decides the tax. Never inferred from rate.
        tax_amount: 0,
        total_amount: 0,
        tax_components: [],
        pricing_rules: ['PRLE-MOCK-FULL-DISCOUNT'],
      };
    }

    return rows;
  }

  /**
   * One ERPNext-generated free row.
   *
   * `uom` is the caller's to decide, because ERPNext's is: a free Product Discount row
   * takes `Pricing Rule.free_item_uom`, falling back to the item's `stock_uom`. It is
   * never assumed to match the paid row it accompanies.
   */
  private freeRow(
    rowId: string,
    itemCode: string,
    itemName: string,
    uom: string,
    stockUom: string,
  ): CartPricingRowDto {
    return {
      row_id: rowId,
      line_role: 'Promotion',
      is_free_item: 1,
      item_code: itemCode,
      item_name: itemName,
      uom,
      stock_uom: stockUom,
      conversion_factor: 1,
      qty: 1,
      stock_qty: 1,
      base_price: 0,
      rate: 0,
      discount_percentage: 0,
      discount_amount: 0,
      amount: 0,
      net_amount: 0,
      // A promotion row carries its own authoritative tax result. Zero here, with a
      // component that still belongs to *this* row - proving the UI never borrows tax
      // from the paid row, and never hides a component because the amount is zero.
      tax_amount: 0,
      total_amount: 0,
      tax_components: [
        {
          tax_type: 'CGST',
          label: 'CGST',
          rate: 9,
          amount: 0,
          taxable_amount: 0,
          included_in_print_rate: 0,
          charge_type: 'On Net Total',
        },
      ],
      pricing_rules: ['PRLE-MOCK-PROMO'],
      source_line_ids: [],
    };
  }

  /** Four fields, matching `build_cart_response` - not the ten `get_contacts` returns. */
  private resolveContact(): CartContactDto | null {
    const name = this.contactPerson();
    if (name === null) {
      return null;
    }

    const contact = this.addressBook.contacts().find((candidate) => candidate.name === name);
    if (contact === undefined) {
      return null;
    }

    return {
      name: contact.name,
      full_name: contact.full_name,
      email: contact.email,
      phone: contact.phone,
    };
  }

  /** Six fields, again matching `build_cart_response` rather than the master record. */
  private resolveAddress(name: string | null): CartAddressDto | null {
    if (name === null) {
      return null;
    }

    const address = this.addressBook.findAddress(name);
    if (address === undefined) {
      return null;
    }

    return {
      name: address.name,
      display: address.display,
      city: address.city,
      state: address.state,
      country: address.country,
      pincode: address.pincode,
    };
  }
}

/** Currency-ish rounding, so fixture totals stay comparable. */
function round(value: number): number {
  return Math.round(value * 100) / 100;

}
