import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProductSearch } from '../../../widgets/product-search/product-search';
import { SHELL_CONTAINER } from '../../shell.layout';
import { CartAction } from './cart-action';
import { MobileNavDrawer } from './mobile-nav-drawer';
import { SecureNav } from './secure-nav';
import { UserMenu } from './user-menu';

/**
 * The authenticated storefront header.
 *
 * ```text
 * desktop  [ brand ] [ merchant nav ] [ ——— search ——— ] [ cart ] [ user ▾ ]
 *
 * mobile   [ ☰ ] [ brand ]                               [ cart ] [ user ]
 *          [ ————————————— search ————————————— ]
 * ```
 *
 * ## Composition only
 *
 * This owns where things sit and nothing else. The merchant tree belongs to `SecureNav`
 * and `MobileNavDrawer`, the typeahead to `ProductSearch`, the account actions to
 * `UserMenu`, the count to `CartAction`. That is what keeps the shell from becoming a
 * header controller with four unrelated pieces of state in it.
 *
 * ## Why `lg`, not `sm`
 *
 * The full row is brand, navigation, a usable search box, the cart and a name. At the
 * 768px tablet width those do not fit - measured, not guessed - and the casualty would be
 * the search box, squeezed to something unusable before the layout ever switched. So the
 * single row starts at `lg` (1024px) and everything below it gets the two-row phone
 * layout, hamburger included. A tablet is a small screen for this header, and treating it
 * as one is the honest answer.
 *
 * ## The search row is not a second header
 *
 * On a phone the search input takes its own full-width row rather than competing with the
 * brand. Both rows sit in the same `.yob-content-container` the footer and every page
 * column use, so the brand still starts exactly where a page heading does.
 */
@Component({
  selector: 'yob-secure-header',
  imports: [CartAction, MobileNavDrawer, ProductSearch, RouterLink, SecureNav, UserMenu],
  template: `
    <header
      class="z-20 border-b border-slate-200 bg-white/95 backdrop-blur sm:sticky sm:top-0"
      data-testid="secure-header"
    >
      <div [class]="container">
        <div class="flex min-h-16 items-center gap-x-3 py-2 lg:gap-x-6">
          <!-- Phones and tablets reach the merchant tree through the drawer. The trigger
               renders nothing at all when no menu was published. -->
          <div class="lg:hidden">
            <yob-mobile-nav-drawer />
          </div>

          <!-- The brand goes home, and home is application-owned - so it works in a
               store with no menu and no content configured at all. -->
          <a
            routerLink="/home"
            class="shrink-0 text-lg font-semibold tracking-tight"
            data-testid="brand-link"
            >Your Order Book</a
          >

          <!-- Desktop: the merchant's own navigation, immediately after the brand. -->
          <div class="hidden lg:block" data-testid="desktop-nav">
            <app-secure-nav />
          </div>

          <!-- Desktop search takes the flexible middle. The min-width-0 utility is what
               actually lets it shrink inside a flex row instead of forcing the row wider
               than the page. -->
          <div class="hidden min-w-0 flex-1 lg:block" data-testid="desktop-search">
            <yob-product-search />
          </div>

          <div class="ms-auto flex shrink-0 items-center gap-x-1 lg:ms-0">
            <yob-cart-action />
            <yob-user-menu />
          </div>
        </div>

        <!-- Phone and tablet: search gets a row of its own, full width. -->
        <div class="pb-2 lg:hidden" data-testid="mobile-search">
          <yob-product-search />
        </div>
      </div>
    </header>
  `,
})
export class SecureHeader {
  protected readonly container = SHELL_CONTAINER;
}
