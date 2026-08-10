import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

/**
 * Structure for pages reachable without a session: sign-in, legal/static content,
 * not-found, and the public token-based payment flow later on.
 *
 * Intentionally plain. This markup is meant to be edited directly in a copied client
 * project - change the brand, rearrange the header, restyle it - rather than driven by
 * settings. There is no `headerVariant` and there never should be.
 */
@Component({
  selector: 'app-public-shell',
  imports: [RouterLink, RouterOutlet],
  template: `
    <div data-testid="public-shell" class="flex min-h-dvh flex-col bg-white text-slate-900">
      <header class="border-b border-slate-200">
        <div class="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4">
          <a routerLink="/" class="text-lg font-semibold tracking-tight">Your Order Book</a>
        </div>
      </header>

      <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <router-outlet />
      </main>

      <footer class="border-t border-slate-200">
        <div
          class="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 text-sm text-slate-600"
        >
          <a routerLink="/terms" class="underline underline-offset-4">Terms</a>
        </div>
      </footer>
    </div>
  `,
})
export class PublicShell {}
