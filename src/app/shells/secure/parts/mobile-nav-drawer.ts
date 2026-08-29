import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import {
  destinationRoute,
  isExternalDestination,
  type MenuItemDto,
} from '../../../domains/content/contracts/cms.types';
import { MenuStore } from '../../../domains/content/state/menu.store';

/**
 * The merchant's navigation, on a phone.
 *
 * ## The same tree, not a second one
 *
 * It reads {@link MenuStore} - the identical dataset the desktop row renders. There is no
 * mobile menu key, no second request and no static Home/Catalog fallback: a merchant who
 * publishes a category publishes it once, and a drawer that could disagree with the
 * header would be a bug nobody would notice until a customer did.
 *
 * ## No hamburger when there is nothing behind it
 *
 * If the menu failed or is empty the trigger is not rendered at all. Opening an empty
 * panel tells a buyer the store is broken; a header without a hamburger simply looks like
 * a store with no published navigation, which is what it is.
 *
 * ## Groups expand, they do not navigate
 *
 * A group is organisational - `destination: null` - so it is a `<button>` that discloses
 * its children, never a link that goes nowhere. The tree is two levels because the
 * backend publishes no more, and nothing here recurses in the hope that it might.
 */
@Component({
  selector: 'yob-mobile-nav-drawer',
  imports: [RouterLink, RouterLinkActive],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    @if (hasMenu()) {
      <button
        type="button"
        class="flex min-h-11 items-center rounded-md px-2 text-slate-700 hover:bg-slate-50
               hover:text-slate-900"
        [attr.aria-expanded]="isOpen()"
        aria-haspopup="dialog"
        aria-controls="mobile-nav-drawer"
        [attr.aria-label]="triggerLabel"
        (click)="toggle()"
        data-testid="nav-hamburger"
      >
        <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
    }

    @if (isOpen()) {
      <!-- A backdrop rather than a document-click listener: the drawer is a dialog, and a
           tap outside it should close it without also activating whatever was under the
           finger. -->
      <div
        class="fixed inset-0 z-40 bg-slate-900/40"
        (click)="close()"
        data-testid="nav-drawer-backdrop"
        aria-hidden="true"
      ></div>

      <div
        id="mobile-nav-drawer"
        class="fixed inset-y-0 start-0 z-50 flex w-80 max-w-[85%] flex-col overflow-y-auto
               border-e border-slate-200 bg-white"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="drawerLabel"
        data-testid="nav-drawer"
      >
        <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <span class="text-sm font-semibold text-slate-900">{{ drawerLabel }}</span>
          <button
            type="button"
            class="min-h-11 rounded-md px-2 text-sm text-slate-600 hover:bg-slate-50"
            [attr.aria-label]="closeLabel"
            (click)="close()"
            data-testid="nav-drawer-close"
          >
            &#10005;
          </button>
        </div>

        <nav class="flex flex-col py-2" [attr.aria-label]="drawerLabel">
          @for (item of items(); track $index) {
            @if (item.type === 'group') {
              <button
                type="button"
                class="flex min-h-11 items-center justify-between px-4 text-start text-sm
                       text-slate-700 hover:bg-slate-50"
                [attr.aria-expanded]="expanded() === $index"
                (click)="toggleGroup($index)"
                data-testid="drawer-group"
                [attr.data-label]="item.label"
              >
                {{ item.label }}
                <span aria-hidden="true" class="text-xs">{{
                  expanded() === $index ? '&#9652;' : '&#9662;'
                }}</span>
              </button>

              @if (expanded() === $index) {
                @for (child of item.children; track $index) {
                  @if (routeOf(child); as route) {
                    @if (isExternal(child)) {
                      <a
                        [href]="route"
                        [attr.target]="child.destination?.open_in_new_tab ? '_blank' : null"
                        [attr.rel]="child.destination?.open_in_new_tab ? 'noopener noreferrer' : null"
                        class="min-h-11 px-8 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        (click)="close()"
                        data-testid="drawer-link"
                        [attr.data-label]="child.label"
                        >{{ child.label }}</a
                      >
                    } @else {
                      <a
                        [routerLink]="route"
                        routerLinkActive="font-semibold text-slate-900"
                        ariaCurrentWhenActive="page"
                        class="min-h-11 px-8 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        (click)="close()"
                        data-testid="drawer-link"
                        [attr.data-label]="child.label"
                        >{{ child.label }}</a
                      >
                    }
                  } @else {
                    <span
                      class="min-h-11 px-8 py-2 text-sm text-slate-400"
                      data-testid="drawer-inert"
                      [attr.data-label]="child.label"
                      >{{ child.label }}</span
                    >
                  }
                }
              }
            } @else if (routeOf(item); as route) {
              @if (isExternal(item)) {
                <a
                  [href]="route"
                  [attr.target]="item.destination?.open_in_new_tab ? '_blank' : null"
                  [attr.rel]="item.destination?.open_in_new_tab ? 'noopener noreferrer' : null"
                  class="min-h-11 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  (click)="close()"
                  data-testid="drawer-link"
                  [attr.data-label]="item.label"
                  >{{ item.label }}</a
                >
              } @else {
                <a
                  [routerLink]="route"
                  routerLinkActive="font-semibold text-slate-900"
                  ariaCurrentWhenActive="page"
                  class="min-h-11 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  (click)="close()"
                  data-testid="drawer-link"
                  [attr.data-label]="item.label"
                  >{{ item.label }}</a
                >
              }
            } @else {
              <span
                class="min-h-11 px-4 py-2 text-sm text-slate-400"
                data-testid="drawer-inert"
                [attr.data-label]="item.label"
                >{{ item.label }}</span
              >
            }
          }
        </nav>
      </div>
    }
  `,
})
export class MobileNavDrawer {
  private readonly menu = inject(MenuStore);

  protected readonly triggerLabel = $localize`:@@nav.menu.open:Open navigation`;
  protected readonly closeLabel = $localize`:@@nav.menu.close:Close navigation`;
  protected readonly drawerLabel = $localize`:@@nav.menu:Menu`;

  protected readonly items = this.menu.items;
  protected readonly hasMenu = computed(() => this.items().length > 0);

  private readonly openSignal = signal(false);
  protected readonly isOpen = this.openSignal.asReadonly();

  private readonly expandedSignal = signal<number | null>(null);
  protected readonly expanded = this.expandedSignal.asReadonly();

  constructor() {
    // Idempotent: the store answers the first caller and ignores the rest, so the drawer
    // and the desktop row share one request.
    this.menu.load();
  }

  protected toggle(): void {
    this.openSignal.update((open) => !open);
  }

  protected close(): void {
    this.openSignal.set(false);
    this.expandedSignal.set(null);
  }

  protected toggleGroup(index: number): void {
    this.expandedSignal.update((open) => (open === index ? null : index));
  }

  /** The same helper the header and every content block use. */
  protected routeOf(item: MenuItemDto): string | null {
    return destinationRoute(item.destination);
  }

  protected isExternal(item: MenuItemDto): boolean {
    return isExternalDestination(item.destination);
  }
}
