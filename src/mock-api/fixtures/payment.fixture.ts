import type {
  CartBackedCheckoutDto,
  PaymentMethodDto,
  SalesOrderBackedCheckoutDto,
} from '../../app/domains/payment/contracts/payment.types';

/**
 * Payment fixtures, shaped from reference 2.0.0 `payment.get_checkout_data`.
 *
 * Fictitious throughout. The Razorpay identifiers match the reference's own obviously
 * fake examples (`order_EXAMPLE0001`), and no real key or signature appears anywhere -
 * `razorpay_key` here is a visibly fake publishable key, and there is no secret,
 * because the browser never receives one.
 */

/** The token the mock issues from `proceed_to_payment`, and the only one it honours. */
export const MOCK_CHECKOUT_TOKEN = 'mock-checkout-token-0001';

export const MOCK_PAYMENT_REQUEST = 'ACC-PRQ-2026-00002';
export const MOCK_SALES_ORDER = 'SAL-ORD-2026-00002';
export const MOCK_CART_NAME = 'CART-2026-08-0002';
export const MOCK_RAZORPAY_ORDER_ID = 'order_EXAMPLE0001';
/** Publishable key only. Obviously fake, and not a secret. */
export const MOCK_RAZORPAY_KEY = 'rzp_test_EXAMPLE0001';

/** Business units, as `get_checkout_data` and Pay Later report it. */
export const MOCK_AMOUNT = 135.0;
/** Provider units for the same money: paise. Razorpay only. */
export const MOCK_AMOUNT_PAISE = 13500;
export const MOCK_CURRENCY = 'INR';

export const MOCK_METHOD_PAY_LATER: PaymentMethodDto = {
  name: 'Pay Later',
  method_code: 'paylater',
  payment_type: 'Offline',
  display_order: 1,
  icon: null,
  description: 'Pay against your agreed credit terms.',
};

export const MOCK_METHOD_RAZORPAY: PaymentMethodDto = {
  name: 'Razorpay',
  method_code: 'razorpay',
  payment_type: 'Online',
  display_order: 2,
  icon: null,
  description: 'Card, UPI or net banking.',
};

/**
 * Before payment is initiated.
 *
 * Note `item_name` is `null` on the cart row - that is what the verified capture shows,
 * and the summary has to cope with it rather than assuming a name is present.
 */
export const MOCK_CART_BACKED: CartBackedCheckoutDto = {
  source_doctype: 'Cart',
  source_name: MOCK_CART_NAME,
  payment_request: MOCK_PAYMENT_REQUEST,
  amount: MOCK_AMOUNT,
  currency: MOCK_CURRENCY,
  payment_methods: [MOCK_METHOD_PAY_LATER, MOCK_METHOD_RAZORPAY],
  cart: {
    name: MOCK_CART_NAME,
    customer: 'Mock Trading Co',
    company: 'Shayona Technology',
    currency: MOCK_CURRENCY,
    status: 'Draft',
    total_quantity: 12,
    net_total: 135.0,
    tax_total: 0.0,
    grand_total: 135.0,
    total_discount: 15.0,
    items: [
      {
        item_code: 'YOB-BOLT-M10',
        item_name: null,
        quantity: 12.0,
        rate: 11.25,
        amount: 135.0,
        uom: 'Nos',
        total_amount: 135.0,
        tax_amount: 0.0,
        discount_amount: 1.25,
        pricing_rule_label: 'YOB Demo Bulk Discount',
      },
    ],
  },
  contact: {
    name: 'Demo Buyer-Mock Trading Co',
    full_name: 'Priya Mock',
    email: 'priya.mock@example.invalid',
    phone: '+91 22 5550 0101',
  },
  billing_address: {
    name: 'Mock Trading Co-Billing',
    display: 'Plot 19, Sanand Industrial Estate<br>Ahmedabad<br>Gujarat<br>382110<br>India<br>',
    city: 'Ahmedabad',
    state: 'Gujarat',
    country: 'India',
    pincode: '382110',
  },
  shipping_address: {
    name: 'Mock Trading Co-Shipping',
    display: 'Plot 19, Sanand Industrial Estate<br>Ahmedabad<br>Gujarat<br>382110<br>India<br>',
    city: 'Ahmedabad',
    state: 'Gujarat',
    country: 'India',
    pincode: '382110',
  },
  cart_updated: false,
  removed_items: [],
  price_updated_items: [],
};

/**
 * After commitment.
 *
 * Deliberately different, exactly as the contract is: flat `items[]`, addresses as bare
 * **name strings**, no cart, no contact object.
 */
export const MOCK_SALES_ORDER_BACKED: SalesOrderBackedCheckoutDto = {
  source_doctype: 'Sales Order',
  source_name: MOCK_SALES_ORDER,
  payment_request: MOCK_PAYMENT_REQUEST,
  amount: MOCK_AMOUNT,
  currency: MOCK_CURRENCY,
  payment_methods: [MOCK_METHOD_PAY_LATER, MOCK_METHOD_RAZORPAY],
  customer: 'Mock Trading Co',
  company: 'Shayona Technology',
  items: [
    {
      item_code: 'YOB-BOLT-M10',
      item_name: 'Hex Bolt M10 x 50mm',
      quantity: 12.0,
      rate: 11.25,
      amount: 135.0,
      uom: 'Nos',
    },
  ],
  billing_address: 'Mock Trading Co-Billing',
  shipping_address: 'Mock Trading Co-Shipping',
  contact_person: 'Demo Buyer-Mock Trading Co',
  order_status: 'Draft',
  docstatus: 0,
};
