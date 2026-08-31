/**
 * CMS contracts (API 3.4.0).
 *
 * Backend-owned shapes for merchant-configured navigation. Phase 25D consumes the menu
 * only; Storefront Pages and Content Blocks are the next phase and are deliberately
 * absent here rather than typed ahead of being used.
 */

/**
 * Where a navigation item goes.
 *
 * One normalised shape for every destination the backend publishes - the same object
 * appears on menu items, banners and promo cards. **Never a raw Frappe link field**:
 * there is no `link_category`, `link_page` or `link_item` here, and a client reaching
 * for one would be reading a database relationship the storefront is not given.
 *
 * `target` is a public slug, never a database id.
 */
export interface MenuDestinationDto {
  readonly type: MenuDestinationType;
  /** Public slug of the target; `null` for implied routes such as home or catalog. */
  readonly target: string | null;
  /**
   * A ready-made route, or `null`.
   *
   * Authoritative wherever it is present - use it as given rather than rebuilding it
   * from `type` and `target`. It is **always `null` for `storefront_page`**, which is
   * the one destination whose route the client owns; see {@link destinationRoute}.
   */
  readonly href: string | null;
  readonly external: boolean;
  readonly open_in_new_tab: boolean;
}

/**
 * The destination types the contract publishes (API 3.11.0).
 *
 * ## Three of these are fixed routes
 *
 * `home`, `catalog` and `all_products` carry a `null` target and a backend-owned `href`
 * that no merchant can type into - `/`, `/catalog` and `/products` respectively. The rest
 * name a record.
 *
 * ## Adding a value here is normally the whole change
 *
 * Nothing in this application switches exhaustively on `type`. Routing reads `href` (with
 * one documented exception, `storefront_page`, whose route the client owns) and
 * internal-vs-external reads the `external` boolean. So a new destination type is a
 * contract-sync concern rather than a navigation one, and `all_products` needed no
 * renderer change at all: it arrives with `href: '/products'` and `external: false`, and
 * the existing internal branch already draws it.
 *
 * `all_products` is new in 3.11.0 and is the tidy replacement for a merchant typing
 * `/products` into an `External URL`. That older arrangement still works and is still
 * supported - the new type is additive, not a migration.
 */
export type MenuDestinationType =
  | 'home'
  | 'catalog'
  | 'all_products'
  | 'storefront_category'
  | 'storefront_page'
  | 'product'
  | 'external_url';

/**
 * One node of the published menu tree.
 *
 * `type` is either `group` or the destination's own type. A **group** is organisational
 * only: it has `destination: null` and exists to hold `children`. A leaf's `children` is
 * always `[]`, and the tree is **at most two levels** - the backend does not publish
 * deeper, and nothing here recurses in the hope that it might.
 *
 * The backend has already removed disabled items, disabled descendants, unresolvable
 * destinations and groups left empty by those removals. What arrives is what to render:
 * publication is not re-decided here, and the order is the merchant's.
 */
export interface MenuItemDto {
  readonly label: string;
  readonly type: string;
  readonly destination: MenuDestinationDto | null;
  readonly children: readonly MenuItemDto[];
}

/** The `data` payload of `cms.get_menu`. */
export interface MenuDto {
  readonly key: string;
  readonly label: string;
  readonly items: readonly MenuItemDto[];
}

/**
 * The route for a destination, or `null` when it is not navigable.
 *
 * Uses the backend's `href` wherever it exists, because it is authoritative. The single
 * exception is the contract's own: a `storefront_page` always arrives with `href: null`
 * because the dynamic page route belongs to the SPA, so `/pages/<target>` is built here
 * - and only here. Nothing writes that route back to the backend, which deliberately
 * stores no route at all.
 *
 * A `null` destination, or one with nothing to build from, is not clickable. That covers
 * both a group and a target that stopped being publishable, and the contract says to
 * render the two the same way.
 */
export function destinationRoute(destination: MenuDestinationDto | null): string | null {
  if (destination === null) {
    return null;
  }

  if (destination.type === 'storefront_page') {
    return destination.target === null ? null : `/pages/${destination.target}`;
  }

  return destination.href;
}

/** Whether this destination leaves the application. */
export function isExternalDestination(destination: MenuDestinationDto | null): boolean {
  return destination?.external === true;
}
