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

/** The destination types API 3.4.0 publishes. */
export type MenuDestinationType =
  | 'home'
  | 'catalog'
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
