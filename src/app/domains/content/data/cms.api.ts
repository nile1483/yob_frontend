import { Service, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';

import { YobApiClient } from '../../../foundation/network/yob-api-client';
import type { MenuDto } from '../contracts/cms.types';
import type { StorefrontPageDto } from '../contracts/page.types';
import type { ContentRouteKey, RouteContentDto } from '../contracts/route-content.types';

const GET_MENU = 'yob_storefront.api.cms.get_menu';
const GET_PAGE = 'yob_storefront.api.cms.get_page';
const GET_ROUTE_CONTENT = 'yob_storefront.api.cms.get_route_content';

/**
 * The CMS endpoints the storefront reads.
 *
 * Navigation (Phase 25D), merchant pages (Phase 25E) and system route content
 * (Phase 25H).
 */
@Service()
export class CmsApi {
  private readonly api = inject(YobApiClient);

  /**
   * One published menu tree, by its merchant-facing key.
   *
   * Customer-independent, per the contract - the same tree for every signed-in buyer,
   * which is what makes it safe for a single shared store to hold one copy.
   *
   * Wire-documented failure: `menu_not_found` (404) for an unknown **or disabled** menu.
   * The two are deliberately indistinguishable, so nothing here tries to tell them
   * apart or to report which it was.
   */
  getMenu(menuKey: string): Observable<MenuDto> {
    return this.api
      .get<MenuDto>(GET_MENU, { menu_key: menuKey })
      .pipe(map((response) => response.data));
  }

  /**
   * One published page, with its ordered blocks.
   *
   * **This is the whole page.** A Product Grid's rows arrive already selected and priced
   * by the catalogue service under the buyer's own pricing context, so nothing that
   * renders a page needs a second request to interpret a block.
   *
   * Customer-priced, therefore never cacheable across buyers - which is also why it needs
   * a session, unlike a menu.
   *
   * Wire-documented failure: `page_not_found` (404) for an unknown **or unpublished**
   * page, deliberately indistinguishable.
   */
  getPage(slug: string): Observable<StorefrontPageDto> {
    return this.api
      .get<StorefrontPageDto>(GET_PAGE, { slug })
      .pipe(map((response) => response.data));
  }

  /**
   * Every content slot of **one application route**, in a single request.
   *
   * One call per route, never per slot: the backend deliberately answers with all of a
   * route's slots - empty ones included - so a cart that asked twice for `above_cart`
   * and `below_cart` would be throwing away half of each response.
   *
   * `slots[].blocks` is the identical `ContentBlock` union `get_page` returns, produced
   * by the same projector, which is what lets one renderer serve both.
   *
   * Customer-specific, for the same reason a page is: a slot may hold a Product Grid,
   * priced through the buyer's own context. Never shared across buyers.
   *
   * Wire-documented failure: `content_route_unknown` (422) for a route that cannot hold
   * content - login, checkout and payment are excluded by decision. Normal Angular code
   * cannot reach it, because {@link ContentRouteKey} makes those keys unspellable.
   */
  getRouteContent(routeKey: ContentRouteKey): Observable<RouteContentDto> {
    return this.api
      .get<RouteContentDto>(GET_ROUTE_CONTENT, { route_key: routeKey })
      .pipe(map((response) => response.data));
  }
}
