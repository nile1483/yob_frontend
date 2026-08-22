import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import { SessionStore } from '../../foundation/session/session.store';
import { SHELL_CONTAINER } from '../shell.layout';
import { SecureNav } from './parts/secure-nav';

/**
 * Structure for the authenticated storefront.
 *
 * The composition is the layout: brand, navigation, account area, routed content,
 * footer, in that order. Moving navigation below the header or into a sidebar is a
 * change to this template, not to a setting - which is precisely why there is no
 * `navigationPosition`.
 *
 * It reads `SessionStore` to show who is signed in and to sign them out. Access control
 * still belongs to the route guard; a shell that also checked would be a second place
 * to get it wrong.
 *
 * ## Header shape (Phase 17)
 *
 * Three zones - brand, navigation, account - because that is what a buyer expects from
 * a storefront and where they look for each one. On a phone the account cluster stays
 * on the brand row and navigation takes a full-width scrollable row beneath it, so the
 * header is two predictable rows rather than three ragged wrapped ones.
 *
 * ## Sticky from `sm` up only (Phase 19)
 *
 * Those two rows are about 110px, which is 13% of a 390x844 phone - permanently, on
 * every page, including the ones where a buyer is reading a long address list or a
 * total. On a phone the header scrolls away and the browser's own back gesture is the
 * navigation; on wider screens there is room to spare and persistent navigation is
 * worth more than the pixels.
 *
 * ## Sign out
 *
 * `SessionStore.signOut()` existed and was tested from Phase 3 but had no way in from
 * the UI until Phase 17, so a buyer could not actually leave. It is a real `<button>`
 * because it performs an action; it never became a link.
 *
 * `signOut()` does not error - a refused logout still ends the local session - so the
 * only state worth holding is "in flight", to stop a second press.
 */
@Component({
  selector: 'app-secure-shell',
  imports: [RouterLink, RouterOutlet, SecureNav],
  template: `
    <div data-testid="secure-shell" class="flex min-h-dvh flex-col bg-white text-slate-900">
      <header class="z-20 border-b border-slate-200 bg-white/95 backdrop-blur sm:sticky sm:top-0">
        <div [class]="container">
          <div class="flex min-h-16 flex-wrap items-center gap-x-8 gap-y-2 py-2">
            <!-- The brand goes home, and home is application-owned - so it works in a
                 store with no menu and no content configured at all. -->
            <a routerLink="/home" class="text-lg font-semibold tracking-tight">Your Order Book</a>

            <!-- Desktop: navigation sits beside the brand. -->
            <div class="hidden sm:block">
              <app-secure-nav />
            </div>

            <div class="ms-auto flex items-center gap-x-3">
              @if (session.user(); as user) {
                <span class="hidden text-sm text-slate-600 sm:inline">{{
                  user.full_name ?? user.name
                }}</span>
              }

              <button
                type="button"
                class="min-h-11 px-1 text-sm text-slate-600 underline underline-offset-4
                       hover:text-slate-900 disabled:opacity-50"
                [disabled]="signingOut()"
                (click)="signOut()"
                data-testid="sign-out"
                i18n="@@nav.signOut"
              >
                Sign out
              </button>
            </div>
          </div>

          <!-- Phone: its own full-width row, so the links get real tap targets. -->
          <div class="pb-1 sm:hidden">
            <app-secure-nav />
          </div>
        </div>
      </header>

      <main [class]="mainClass" data-testid="page-main">
        <router-outlet />
      </main>

      <footer class="mt-auto border-t border-slate-200">
        <div [class]="footerClass">
          @if (session.profileName(); as profile) {
            <span>Ordering for {{ profile }}</span>
          }
        </div>
      </footer>
    </div>
  `,
})
export class SecureShell {
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  protected readonly container = SHELL_CONTAINER;
  protected readonly mainClass = `${SHELL_CONTAINER} flex-1 py-8 sm:py-10`;
  protected readonly footerClass = `${SHELL_CONTAINER} py-6 text-sm text-slate-600`;
  protected readonly signingOut = signal(false);

  protected signOut(): void {
    if (this.signingOut()) {
      return;
    }
    this.signingOut.set(true);

    this.session.signOut().subscribe({
      complete: () => {
        this.signingOut.set(false);
        void this.router.navigateByUrl('/login');
      },
    });
  }
}
