import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

import { SessionStore } from '../../foundation/session/session.store';
import { SecureNav } from './parts/secure-nav';

/**
 * Structure for the authenticated storefront.
 *
 * The composition is the layout: brand, navigation, account area, routed content,
 * footer, in that order. Moving navigation below the header or into a sidebar is a
 * change to this template, not to a setting - which is precisely why there is no
 * `navigationPosition`.
 *
 * It reads `SessionStore` only to show who is signed in. Access control belongs to the
 * route guard; a shell that also checked would be a second place to get it wrong.
 */
@Component({
  selector: 'app-secure-shell',
  imports: [RouterLink, RouterOutlet, SecureNav],
  template: `
    <div data-testid="secure-shell" class="flex min-h-dvh flex-col bg-white text-slate-900">
      <header class="border-b border-slate-200">
        <div class="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4">
          <a routerLink="/catalog" class="text-lg font-semibold tracking-tight">Your Order Book</a>

          <app-secure-nav />

          <!-- Pushed to the end on wide screens; wraps underneath on a phone. -->
          <div class="ms-auto text-sm text-slate-600">
            @if (session.user(); as user) {
              <span>{{ user.full_name ?? user.name }}</span>
            }
          </div>
        </div>
      </header>

      <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <router-outlet />
      </main>

      <footer class="border-t border-slate-200">
        <div class="mx-auto w-full max-w-6xl px-4 py-4 text-sm text-slate-600">
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
}
