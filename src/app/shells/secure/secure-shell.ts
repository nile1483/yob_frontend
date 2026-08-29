import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SessionStore } from '../../foundation/session/session.store';
import { SHELL_CONTAINER } from '../shell.layout';
import { SecureHeader } from './parts/secure-header';

/**
 * Structure for the authenticated storefront.
 *
 * Header, routed content, footer - and since Phase 26B the header is its own component.
 * The shell keeps what a shell owns: the page frame, the full-width `main` Phase 25J
 * established, and the footer's profile line. Composition inside the header, the merchant
 * tree, the typeahead and the account actions all belong to `SecureHeader` and its parts.
 *
 * It reads `SessionStore` only to name the business profile in the footer. Access control
 * still belongs to the route guard; a shell that also checked would be a second place to
 * get it wrong, and signing out belongs with the account actions in `UserMenu`.
 */
@Component({
  selector: 'app-secure-shell',
  imports: [RouterOutlet, SecureHeader],
  template: `
    <div data-testid="secure-shell" class="flex min-h-dvh flex-col bg-white text-slate-900">
      <yob-secure-header />

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


  /**
   * **Full width, and that is the change Phase 25J is about.**
   *
   * `main` used to carry the content container, so every routed page - and therefore
   * every content block inside one - was confined to the column and no block could
   * paint a background past it. The column moved down: each page and each content
   * section now opens its own `.yob-content-container`, so a band can span the whole
   * width while its content still lines up with the brand above it.
   *
   * The vertical padding stays here. It is the gap between the header and whatever the
   * route draws first, it is the same on every route, and pushing it into eight pages
   * would be eight chances for one of them to disagree.
   */
  protected readonly mainClass = 'w-full flex-1 py-8 sm:py-10';
  protected readonly footerClass = `${SHELL_CONTAINER} py-6 text-sm text-slate-600`;
}
