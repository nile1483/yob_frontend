import type { AnyContentBlockDto } from './page.types';

/**
 * System route content contracts (API 3.5.0 `RouteContentResponse` / `ContentSlot`).
 *
 * ## The distinction this file exists to keep
 *
 * A **Storefront Page** is a merchant-authored document with its own URL: the merchant
 * created it, named it, and decides everything on it. `/pages/:slug`.
 *
 * **System route content** is the opposite arrangement. The route is an application
 * page that already existed - the cart, a product, the order list - and Angular decides
 * where content may appear inside it. The merchant chooses *what* goes in a position and
 * in what order, never *where* a position is. Adding one is a source change in both
 * repositories.
 *
 * That is why the registry below is a `const` in Angular source rather than something
 * read from the response: a runtime-driven slot list would make this a layout builder,
 * which is precisely what it is not.
 *
 * The blocks are the **same** `ContentBlock` union `cms.get_page` returns - one backend
 * projector serves both - so nothing here re-describes a block.
 */

/**
 * Every route that can hold content, and the slots it declares, in render order.
 *
 * Mirrors `x-route-slots` in the published contract, which
 * `e2e/route-content-contract.spec.ts` asserts against `reference/api/openapi.json`. If
 * the backend registry ever moves, that test fails rather than a buyer seeing a slot
 * quietly render nothing.
 *
 * **Login, checkout, payment and the payment callback are absent by decision**, not by
 * omission: no merchant content around a credential form, and nothing between a cart and
 * a payment. The backend refuses those route keys with `content_route_unknown`, and this
 * type makes them unspellable here.
 */
export const ROUTE_SLOTS = {
  home: ['hero', 'main', 'bottom'],
  catalog: ['above_listing', 'below_listing'],
  category: ['above_listing', 'below_listing'],
  product: ['above_product', 'below_product'],
  cart: ['above_cart', 'below_cart'],
  account: ['above_content', 'below_content'],
  orders: ['above_list', 'below_list'],
  order_detail: ['above_order', 'below_order'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

/** A route key the backend will accept. */
export type ContentRouteKey = keyof typeof ROUTE_SLOTS;

/**
 * The slots one route declares.
 *
 * Written as an indexed access on purpose: it makes `ContentSlot<R>` reject
 * `routeKey="cart" slotKey="hero"` at compile time, because `hero` belongs to `home`.
 * The same key does appear on more than one route - `above_listing` is on both `catalog`
 * and `category` - so it is the **(route, slot) pair** that identifies a position, and
 * the pair is what the type checks.
 */
export type ContentSlotKey<R extends ContentRouteKey = ContentRouteKey> =
  (typeof ROUTE_SLOTS)[R][number];

/**
 * One application-owned position, with whatever the merchant put in it.
 *
 * `key` is typed as a plain `string` rather than `ContentSlotKey` deliberately. This is
 * the wire boundary: a backend that starts declaring a sixth slot must not make the
 * response unassignable and take a page down. Lookups go the other way - Angular asks
 * for the key *it* owns and ignores anything it did not ask for.
 *
 * An empty `blocks` is the ordinary case, not an error. Every declared slot comes back,
 * empty ones included, so nothing has to test whether a key exists.
 */
export interface ContentSlotDto {
  readonly key: string;
  readonly blocks: readonly AnyContentBlockDto[];
}

/** The `data` payload of `cms.get_route_content`. */
export interface RouteContentDto {
  readonly route_key: string;
  readonly slots: readonly ContentSlotDto[];
}
