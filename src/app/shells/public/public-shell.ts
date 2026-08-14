import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

import { SHELL_CONTAINER } from '../shell.layout';

/**
 * Structure for pages reachable without a session: sign-in, legal/static content,
 * not-found, and the public token-based payment flow.
 *
 * Intentionally plain. This markup is meant to be edited directly in a copied client
 * project - change the brand, rearrange the header, restyle it - rather than driven by
 * settings. There is no `headerVariant` and there never should be.
 *
 * It shares `SHELL_CONTAINER` with the secure shell so the brand, the page title and
 * the footer line up. Before Phase 17 this shell centred its own narrower container
 * while the pages inside centred theirs, and sign-in and payment visibly did not align
 * with the brand above them.
 *
 * No navigation and no account controls: everything here is reachable without a
 * session, and the payment route in particular must not grow a session dependency.
 */
@Component({
  selector: 'app-public-shell',
  imports: [RouterLink, RouterOutlet],
  template: `
    <div data-testid="public-shell" class="flex min-h-dvh flex-col bg-white text-slate-900">
      <header class="border-b border-slate-200">
        <div [class]="headerClass">
          <a routerLink="/" class="text-lg font-semibold tracking-tight">Your Order Book</a>
        </div>
      </header>

      <main [class]="mainClass" data-testid="page-main">
        <router-outlet />
      </main>

      <footer class="mt-auto border-t border-slate-200">
        <div [class]="footerClass">
          <a routerLink="/terms" class="underline underline-offset-4">Terms</a>
        </div>
      </footer>
    </div>
  `,
})
export class PublicShell {
  protected readonly headerClass = `${SHELL_CONTAINER} flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 py-2`;
  protected readonly mainClass = `${SHELL_CONTAINER} flex-1 py-8 sm:py-10`;
  protected readonly footerClass = `${SHELL_CONTAINER} flex flex-wrap items-center gap-x-4 gap-y-1 py-6 text-sm text-slate-600`;
}
