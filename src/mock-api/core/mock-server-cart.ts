import { Service, inject, signal } from '@angular/core';

import type {
  CartAddressDto,
  CartContactDto,
  CartLineDto,
  CartPayloadDto,
} from '../../app/domains/cart/contracts/cart.types';
import {
  MOCK_ADDRESS_LOCAL,
  MOCK_CONTACT_PRIMARY,
  MOCK_HOME_STATE,
  MOCK_INTERSTATE_SURCHARGE_RATE,
} from '../fixtures/address-book.fixture';
import { MOCK_ITEM_DETAILS_BY_SLUG } from '../fixtures/catalog.fixture';
import { MockServerAddressBook } from './mock-server-address-book';

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

  /** Look up an item by its Frappe item code, as `add_to_cart` does. */
  findItemByCode(itemCode: string) {
    return Object.values(MOCK_ITEM_DETAILS_BY_SLUG).find((item) => item.name === itemCode);
  }

  /**
   * Set the quantity for an item code.
   *
   * **Set, never increment** - mirroring `existing.quantity = qty` in `cart.py`.
   * Adding 3 to a line already holding 2 leaves 3.
   */
  setQuantity(itemCode: string, quantity: number): void {
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
        uom: item.uom,
        stock_uom: item.uom,
        discount_percentage: shouldReprice ? 0 : item.discount_percentage,
        discount_amount: shouldReprice ? 0 : item.discount_amount,
        tax_amount: taxAmount,
        total_amount: round(amount + taxAmount),
        item_slug: item.custom_slug,
        pricing_rule_label: shouldReprice ? null : item.pricing_rule_label,
      });
    }

    const netTotal = round(lines.reduce((sum, line) => sum + line.amount, 0));
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
        coupon_code: null,
        coupon_discount: 0,
        items: lines,
      },
      // Resolved blocks, as `build_cart_response` returns them: a summary of the
      // selected record, not the master record itself.
      contact: this.resolveContact(),
      billing_address: this.resolveAddress(this.billingAddress()),
      shipping_address: this.resolveAddress(this.shippingAddress()),
      cart_updated: removed.length > 0 || repriced.length > 0,
      removed_items: removed,
      price_updated_items: repriced,
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
