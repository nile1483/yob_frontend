import type {
  OrderDetailDto,
  OrderSummaryDto,
} from '../../app/domains/orders/contracts/orders.types';

/**
 * Buyer order fixtures.
 *
 * Shaped from `yob_storefront/api/order.py` and the three real Sales Orders read from
 * the development bench on 2026-08-13 - including their awkward parts: every order is
 * `Draft`, `contact_email`/`contact_mobile` are null, `taxes` is empty, and `image` is
 * `""` rather than null.
 *
 * All values are fictitious. The real bench's Razorpay payment ids were deliberately
 * **not** copied here; these use obvious placeholders.
 */

export const MOCK_ORDER_PAID = 'SAL-ORD-MOCK-0001';
export const MOCK_ORDER_UNPAID = 'SAL-ORD-MOCK-0002';
export const MOCK_ORDER_CANCELLED = 'SAL-ORD-MOCK-0003';

/**
 * The list, newest first, exactly as `order_by="creation desc"` returns it.
 *
 * Note the absent currency: `get_orders` selects five fields and none of them names
 * one. The fixture reproduces that gap rather than papering over it.
 */
export const MOCK_ORDER_LIST: readonly OrderSummaryDto[] = [
  {
    name: MOCK_ORDER_PAID,
    // Paid in full, and still `Draft` - which is exactly the real bench's state.
    status: 'Draft',
    grand_total: 1350.0,
    transaction_date: '2026-08-12',
    delivery_date: '2026-08-19',
  },
  {
    name: MOCK_ORDER_UNPAID,
    status: 'Draft',
    grand_total: 899.0,
    transaction_date: '2026-08-10',
    delivery_date: '2026-08-17',
  },
  {
    name: MOCK_ORDER_CANCELLED,
    status: 'Cancelled',
    grand_total: 450.0,
    transaction_date: '2026-08-04',
    delivery_date: null,
  },
];

const BILLING = {
  address_title: 'Mock Trading Co',
  address_line1: 'Plot 19, Sanand Industrial Estate',
  address_line2: 'Phase II',
  city: 'Ahmedabad',
  state: 'Gujarat',
  country: 'India',
  pincode: '382110',
  phone: '+91 22 5550 0101',
} as const;

/** Paid by the provider, shippable, with a discount and tax so the totals exercise both. */
const PAID: OrderDetailDto = {
  name: MOCK_ORDER_PAID,
  customer: 'Mock Trading Co',
  status: 'Draft',
  transaction_date: '2026-08-12',
  delivery_date: '2026-08-19',
  currency: 'INR',

  original_total: 1500.0,
  discount: 150.0,
  subtotal: 1350.0,
  net_total: 1350.0,
  tax: 0.0,
  grand_total: 1350.0,
  rounded_total: 1350.0,

  contact_person: 'Priya Mock',
  // Null on every real order, so null here too.
  contact_email: null,
  contact_mobile: null,

  billing_address_name: 'Mock Trading Co-Billing',
  shipping_address_name: 'Mock Trading Co-Shipping',
  billing_address: BILLING,
  shipping_address: { ...BILLING, address_title: 'Mock Trading Co - Depot' },

  payment_terms_template: null,
  tc_name: null,
  terms: null,

  items: [
    {
      item_code: 'YOB-BOLT-M10',
      item_name: 'Hex Bolt M10 x 50mm',
      description: 'Zinc plated, DIN 933.',
      image: '',
      qty: 120.0,
      uom: 'Nos',
      price_list_rate: 12.5,
      rate: 11.25,
      discount_percentage: 10.0,
      discount_amount: 150.0,
      amount: 1350.0,
      net_amount: 1350.0,
    },
  ],
  taxes: [],
  payment_logs: [
    {
      name: 'RPL-MOCK-0001',
      // Razorpay's own vocabulary, stored verbatim by the backend.
      payment_status: 'captured',
      payment_method: 'netbanking',
      payment_amount: 1350.0,
      currency: 'INR',
      razorpay_order_id: 'order_EXAMPLE0001',
      razorpay_payment_id: 'pay_EXAMPLE0001',
      email: 'priya.mock@example.invalid',
      contact: '+91 22 5550 0101',
      creation: '2026-08-12 10:15:00.000000',
    },
  ],
};

/**
 * No payment logs at all - the unpaid, abandoned or Pay Later case.
 *
 * Also non-shippable: no shipping address of any kind, so the detail page's shipping
 * section must disappear rather than render an empty block.
 */
const UNPAID: OrderDetailDto = {
  name: MOCK_ORDER_UNPAID,
  customer: 'Mock Trading Co',
  status: 'Draft',
  transaction_date: '2026-08-10',
  delivery_date: '2026-08-17',
  currency: 'INR',

  original_total: 899.0,
  discount: 0.0,
  subtotal: 899.0,
  net_total: 899.0,
  tax: 0.0,
  grand_total: 899.0,
  rounded_total: 899.0,

  contact_person: 'Priya Mock',
  contact_email: null,
  contact_mobile: null,

  billing_address_name: 'Mock Trading Co-Billing',
  shipping_address_name: null,
  billing_address: BILLING,

  payment_terms_template: null,
  tc_name: null,
  terms: null,

  items: [
    {
      item_code: 'YOB-WASH-M10',
      item_name: 'Flat Washer M10',
      description: null,
      image: '',
      qty: 1.0,
      uom: 'Nos',
      price_list_rate: 899.0,
      rate: 899.0,
      discount_percentage: 0.0,
      discount_amount: 0.0,
      amount: 899.0,
      net_amount: 899.0,
    },
  ],
  taxes: [],
  payment_logs: [],
};

/** Cancelled, and carrying a failed provider attempt that must not read as paid. */
const CANCELLED: OrderDetailDto = {
  ...UNPAID,
  name: MOCK_ORDER_CANCELLED,
  status: 'Cancelled',
  transaction_date: '2026-08-04',
  delivery_date: null,
  original_total: 450.0,
  discount: 0.0,
  subtotal: 450.0,
  net_total: 450.0,
  tax: 0.0,
  grand_total: 450.0,
  rounded_total: 450.0,
  payment_logs: [
    {
      name: 'RPL-MOCK-0002',
      // A payment id exists, but it was never captured. Nothing may call this paid.
      payment_status: 'failed',
      payment_method: 'card',
      payment_amount: 450.0,
      currency: 'INR',
      razorpay_order_id: 'order_EXAMPLE0002',
      razorpay_payment_id: 'pay_EXAMPLE0002',
      email: 'priya.mock@example.invalid',
      contact: null,
      creation: '2026-08-04 09:00:00.000000',
    },
  ],
};

export const MOCK_ORDER_DETAILS: Readonly<Record<string, OrderDetailDto>> = {
  [MOCK_ORDER_PAID]: PAID,
  [MOCK_ORDER_UNPAID]: UNPAID,
  [MOCK_ORDER_CANCELLED]: CANCELLED,
};
