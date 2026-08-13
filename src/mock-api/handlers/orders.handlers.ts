import type { MockContext, MockHandler } from '../core/mock-handler';
import { type MockReply, mockPermissionError, mockSuccess, mockYobError } from '../core/mock-reply';
import { MOCK_ORDER_DETAILS, MOCK_ORDER_LIST } from '../fixtures/orders.fixture';

/**
 * Buyer order handlers.
 *
 * Reproduces `yob_storefront/api/order.py`, including the parts a convenient mock
 * would smooth over: the list takes **no parameters at all** - no pagination, no
 * filters, no sorting - and carries no currency or payment fields, so a page cannot
 * quietly grow a dependency on data the real endpoint does not send.
 *
 * Both endpoints are authenticated; a guest gets the raw Frappe 403, as everywhere.
 */

const getOrders: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  const orders = ctx.scenario === 'empty' ? [] : MOCK_ORDER_LIST;

  return mockSuccess(orders, {
    notice: 'Orders fetched successfully',
    meta: { count: orders.length },
  });
};

/**
 * One order.
 *
 * The backend checks ownership *before* loading, so an unknown order and another
 * customer's answer identically with `order_not_found`. The mock does the same: it
 * knows nothing about other customers, and every id outside its own fixtures - real or
 * invented - produces the same 404. That is what makes the identifier un-probeable.
 */
const getOrderDetails: MockHandler = (ctx) => {
  const guard = requireSession(ctx);
  if (guard) {
    return guard;
  }

  const orderId = ctx.params.get('order_id') ?? '';

  if (orderId === '') {
    return mockYobError('validation_failed', 'Order ID is required.', {
      field: 'order_id',
      status: 422,
    });
  }

  const order = MOCK_ORDER_DETAILS[orderId];
  if (order === undefined) {
    return mockYobError('order_not_found', 'Order not found.', {
      field: 'order_id',
      status: 404,
    });
  }

  return mockSuccess(order, { notice: 'Order fetched successfully' });
};

function requireSession(ctx: MockContext): MockReply | null {
  return ctx.session.isAuthenticated() ? null : mockPermissionError(ctx.rpcMethod);
}

export const ORDERS_HANDLERS: Readonly<Record<string, MockHandler>> = {
  'yob_storefront.api.order.get_orders': getOrders,
  'yob_storefront.api.order.get_order_details': getOrderDetails,
};
