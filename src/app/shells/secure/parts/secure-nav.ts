import { Component, ElementRef, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import {
  destinationRoute,
  isExternalDestination,
  type MenuItemDto,
} from '../../../domains/content/contracts/cms.types';
import { MenuStore } from '../../../domains/content/state/menu.store';

/** Panel ids must be unique across the two instances the shell renders. */
let nextNavInstance = 0;

/**
 * Primary navigation for the authenticated storefront.
 *
 * A separate piece so the secure shell can move it - beside the brand, under the
 * header, into a sidebar - by relocating one element instead of rewriting markup.
 * That is the whole of the "layout flexibility" story: composition, not configuration.
 *
 * ## Merchant navigation, and only merchant navigation
 *
 * Since Phase 26B this renders the published tree and nothing else. The cart, the orders
 * list and the account page used to sit at the end of this row; they are application
 * controls rather than merchandising, and each now has its own place in the header -
 * `CartAction` and `UserMenu`. The argument below is unchanged, only acted on: what a
 * merchant publishes and what the application owns are different things, and they no
 * longer share a list.
 *
 * ## Two kinds of navigation, and only one is configurable
 *
 * **Merchant navigation** comes from `cms.get_menu` and is whatever the merchant
 * published - categories, pages, external links, and groups holding them. It is rendered
 * from {@link MenuStore}, so the desktop header and the mobile row are two renderings of
 * **one dataset** rather than two lists that could drift apart.
 *
 * **Application controls** - Cart, Orders, Account - stay listed literally in source.
 * They are not merchandising: they are how the application works, they must exist for a
 * signed-in buyer whatever a merchant configures, and a merchant who deleted the cart
 * link from a menu should not lose the cart. When a copied client does not need one,
 * delete the anchor; there is deliberately no enable/disable setting.
 *
 * ## Storefront navigation, not application navigation
 *
 * The active link is marked with weight *and* a bottom rule, not weight alone. A bold
 * word among four other words is easy to miss mid-scan, and this is the only thing
 * telling a buyer where they are.
 *
 * It also carries `aria-current="page"`, which is the same information for someone who
 * cannot see either cue. `routerLinkActive` does not set it on its own - it only swaps
 * classes - so without `ariaCurrentWhenActive` the active state was purely visual.
 *
 * Each link is a 44px-tall target with its own padding, so the row is usable with a
 * thumb at 390px. It scrolls horizontally there rather than wrapping onto a second
 * line, which keeps the header one predictable height on every page.
 *
 * ## The cart count never triggers a request
 *
 * It reads whatever `CartStore` already holds. The shell renders on every secure page,
 * and fetching a cart from here would put a request on every navigation - including
 * pages that have nothing to do with the cart - purely to decorate a link. So the count
 * appears once something has genuinely loaded the cart, and is simply absent before
 * that. A wrong number would be worse than no number.
 */
@Component({
  selector: 'app-secure-nav',
  imports: [RouterLink, RouterLinkActive],
  host: { '(document:click)': 'onDocumentClick($event)', '(document:keydown.escape)': 'closeGroup()' },
  template: `
    <nav aria-label="Primary" class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
      <ul class="flex items-center gap-x-1 sm:gap-x-2">
        <!-- Merchant navigation first: it is what the store is selling. The application's
             own controls follow, so their position never depends on how much the merchant
             configured. -->
        @for (item of menuItems(); track $index) {
          <li class="relative">
            @if (item.type === 'group') {
              <!-- A group is organisational and goes nowhere, so it is a button, not a
                   link. aria-expanded carries the state that the chevron shows, and
                   aria-controls ties the button to the panel it opens. -->
              <button
                type="button"
                [attr.aria-expanded]="openGroup() === $index"
                [attr.aria-controls]="groupPanelId($index)"
                (click)="toggleGroup($index)"
                class="flex min-h-11 items-center gap-1 border-b-2 border-transparent px-2 text-sm
                       whitespace-nowrap text-slate-600 hover:text-slate-900"
                data-testid="nav-group"
                [attr.data-label]="item.label"
              >
                {{ item.label }}
                <span aria-hidden="true" class="text-xs">{{ openGroup() === $index ? '&#9652;' : '&#9662;' }}</span>
              </button>

              @if (openGroup() === $index) {
                <ul
                  [id]="groupPanelId($index)"
                  class="absolute left-0 z-30 mt-1 min-w-48 rounded-md border border-slate-200
                         bg-white py-1 shadow-lg"
                  data-testid="nav-group-panel"
                >
                  @for (child of item.children; track $index) {
                    <li>
                      @if (routeOf(child); as route) {
                        @if (isExternal(child)) {
                          <a
                            [href]="route"
                            [attr.target]="child.destination?.open_in_new_tab ? '_blank' : null"
                            [attr.rel]="child.destination?.open_in_new_tab ? 'noopener noreferrer' : null"
                            class="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            data-testid="nav-link"
                            [attr.data-label]="child.label"
                            (click)="closeGroup()"
                            >{{ child.label }}</a
                          >
                        } @else {
                          <a
                            [routerLink]="route"
                            class="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            data-testid="nav-link"
                            [attr.data-label]="child.label"
                            (click)="closeGroup()"
                            >{{ child.label }}</a
                          >
                        }
                      } @else {
                        <!-- No destination: rendered, not clickable. The backend says a
                             group and an unpublishable target look the same. -->
                        <span
                          class="block px-3 py-2 text-sm text-slate-400"
                          data-testid="nav-inert"
                          [attr.data-label]="child.label"
                          >{{ child.label }}</span
                        >
                      }
                    </li>
                  }
                </ul>
              }
            } @else if (routeOf(item); as route) {
              @if (isExternal(item)) {
                <!-- rel is not decoration: a new tab opened with target=_blank keeps a
                     handle on this window without it. -->
                <a
                  [href]="route"
                  [attr.target]="item.destination?.open_in_new_tab ? '_blank' : null"
                  [attr.rel]="item.destination?.open_in_new_tab ? 'noopener noreferrer' : null"
                  class="flex min-h-11 items-center border-b-2 border-transparent px-2 text-sm
                         whitespace-nowrap text-slate-600 hover:text-slate-900"
                  data-testid="nav-link"
                  [attr.data-label]="item.label"
                  >{{ item.label }}</a
                >
              } @else {
                <a
                  [routerLink]="route"
                  routerLinkActive="border-slate-900 font-semibold text-slate-900"
                  ariaCurrentWhenActive="page"
                  class="flex min-h-11 items-center border-b-2 border-transparent px-2 text-sm
                         whitespace-nowrap text-slate-600 hover:text-slate-900"
                  data-testid="nav-link"
                  [attr.data-label]="item.label"
                  >{{ item.label }}</a
                >
              }
            } @else {
              <span
                class="flex min-h-11 items-center px-2 text-sm whitespace-nowrap text-slate-400"
                data-testid="nav-inert"
                [attr.data-label]="item.label"
                >{{ item.label }}</span
              >
            }
          </li>
        }

      </ul>
    </nav>
  `,
})
export class SecureNav {
  private readonly menu = inject(MenuStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The merchant's published tree. Empty until it loads, and empty if it never does. */
  protected readonly menuItems = this.menu.items;

  /**
   * Which group is open, by index, or `null`.
   *
   * One at a time: two open dropdowns in a header overlap each other, and the buyer only
   * asked about the one they clicked.
   */
  private readonly openGroupSignal = signal<number | null>(null);
  protected readonly openGroup = this.openGroupSignal.asReadonly();

  /** Distinct per instance, because this component renders twice - desktop and mobile. */
  private readonly instance = nextNavInstance++;

  constructor() {
    // Idempotent: the store ignores everything after the first call, so both instances
    // and every navigation share one request.
    this.menu.load();
  }

  protected groupPanelId(index: number): string {
    return `yob-nav-group-${this.instance}-${index}`;
  }

  protected toggleGroup(index: number): void {
    this.openGroupSignal.update((open) => (open === index ? null : index));
  }

  protected closeGroup(): void {
    this.openGroupSignal.set(null);
  }

  /** A click anywhere else closes the panel - the ordinary expectation for a dropdown. */
  protected onDocumentClick(event: Event): void {
    if (this.openGroupSignal() === null) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && !this.host.nativeElement.contains(target)) {
      this.closeGroup();
    }
  }

  /**
   * Where a menu item goes, or `null` when it goes nowhere.
   *
   * Delegates to the contract helper, which uses the backend's `href` for every type
   * except `storefront_page` - the one route the SPA owns and builds from `target`.
   */
  protected routeOf(item: MenuItemDto): string | null {
    return destinationRoute(item.destination);
  }

  protected isExternal(item: MenuItemDto): boolean {
    return isExternalDestination(item.destination);
  }

}
