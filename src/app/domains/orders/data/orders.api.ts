import { Service, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';

import { YobApiClient } from '../../../foundation/network/yob-api-client';
import type { OrderDetailDto, OrderSummaryDto } from '../contracts/orders.types';

const GET_ORDERS = 'yob_storefront.api.order.get_orders';
const GET_ORDER_DETAILS = 'yob_storefront.api.order.get_order_details';

/**
 * The buyer's own orders.
 *
 * Both endpoints are authenticated storefront APIs: the customer is derived from the
 * session, never sent. Nothing here touches Frappe's generic `/api/resource/Sales
 * Order` - the storefront API is the only way in, and it is what enforces ownership.
 */
@Service()
export class OrdersApi {
  private readonly api = inject(YobApiClient);

  /**
   * Every order belonging to the signed-in customer, newest first.
   *
   * **No parameters exist.** No pagination, no filters, no sort options, no search -
   * the endpoint takes nothing and returns the whole list ordered `creation desc`. No
   * such controls are offered in the UI, because offering them would mean inventing
   * behaviour the API cannot honour.
   *
   * The rows carry no currency and no payment information; see `orders.types.ts`.
   */
  getOrders(): Observable<readonly OrderSummaryDto[]> {
    return this.api.get<readonly OrderSummaryDto[]>(GET_ORDERS).pipe(map((r) => r.data));
  }

  /**
   * One order in full.
   *
   * `orderId` is the Sales Order **`name`** (`SAL-ORD-2026-00001`), which is also what
   * the buyer sees - there is no separate display order number to translate between.
   *
   * ## Ownership is the backend's, and it refuses to leak
   *
   * The endpoint checks `exists("Sales Order", {name, customer})` before loading
   * anything, so an order that does not exist and one belonging to another customer
   * answer **identically**: `404 order_not_found`. Changing the id in the URL
   * therefore reveals nothing, and the frontend must not undo that by wording the two
   * cases differently - it cannot tell them apart anyway.
   *
   * A missing `order_id` answers `422 validation_failed` with `field: "order_id"`.
   */
  getOrderDetails(orderId: string): Observable<OrderDetailDto> {
    return this.api
      .get<OrderDetailDto>(GET_ORDER_DETAILS, { order_id: orderId })
      .pipe(map((r) => r.data));
  }
}
