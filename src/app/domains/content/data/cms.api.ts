import { Service, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';

import { YobApiClient } from '../../../foundation/network/yob-api-client';
import type { MenuDto } from '../contracts/cms.types';

const GET_MENU = 'yob_storefront.api.cms.get_menu';

/**
 * The CMS endpoints the storefront reads.
 *
 * Navigation only in Phase 25D. `cms.get_page` exists on the wire and is deliberately
 * not wrapped yet: the page renderer is the next phase, and an unused method is a
 * promise this layer has not been asked to keep.
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
}
