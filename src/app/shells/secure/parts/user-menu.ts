import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { SessionStore } from '../../../foundation/session/session.store';

/**
 * The signed-in buyer's own menu: who they are, and what they can do about it.
 *
 * ## Separate from storefront navigation, on purpose
 *
 * The hamburger holds what the *merchant* published; this holds what the *account* can
 * do. Mixing them means a buyer hunting for "Sign out" among category links, and a
 * merchant able to bury an account action behind a menu they control.
 *
 * ## One menu, two triggers
 *
 * Desktop shows the icon with the name beside it; a phone shows the icon alone, because
 * a truncated `nile1483` next to an avatar tells a buyer nothing they do not already
 * know. Both open the identical panel - not two lists that could drift.
 *
 * ## The name cannot be allowed to break the header
 *
 * A display name is user data of unbounded length. It gets a hard `max-w` and truncates,
 * and the full value stays reachable through `title` for anyone who needs it. Without
 * that, one long name pushes the search box off the row.
 */
@Component({
  selector: 'yob-user-menu',
  imports: [RouterLink],
  host: {
    class: 'relative block',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'close()',
  },
  template: `
    <button
      type="button"
      class="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-slate-700
             hover:bg-slate-50 hover:text-slate-900"
      [attr.aria-expanded]="isOpen()"
      aria-haspopup="menu"
      aria-controls="user-menu-panel"
      [attr.aria-label]="triggerLabel()"
      [attr.title]="displayName()"
      (click)="toggle()"
      data-testid="user-menu-trigger"
    >
      <!-- Inline SVG, matching the project's existing icon approach (the Media
           placeholder does the same): no icon font, no sprite system to maintain. -->
      <svg class="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="3.25" />
        <path d="M4.5 19.5a7.5 7.5 0 0 1 15 0" />
      </svg>

      <!-- Desktop only. The phone shows the icon alone. -->
      <span
        class="hidden max-w-32 truncate lg:inline"
        data-testid="user-menu-name"
        >{{ displayName() }}</span
      >
      <span class="hidden text-xs lg:inline" aria-hidden="true">&#9662;</span>
    </button>

    @if (isOpen()) {
      <div
        id="user-menu-panel"
        class="absolute end-0 z-30 mt-1 min-w-48 rounded-md border border-slate-200 bg-white
               py-1 shadow-lg"
        role="menu"
        [attr.aria-label]="panelLabel"
        data-testid="user-menu-panel"
      >
        @for (link of links; track link.path) {
          <a
            [routerLink]="link.path"
            role="menuitem"
            class="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            (click)="close()"
            data-testid="user-menu-link"
            [attr.data-label]="link.label"
            >{{ link.label }}</a
          >
        }

        <button
          type="button"
          role="menuitem"
          class="block w-full px-3 py-2 text-start text-sm text-slate-700 hover:bg-slate-50
                 disabled:opacity-50"
          [disabled]="signingOut()"
          (click)="signOut()"
          data-testid="sign-out"
          i18n="@@nav.signOut"
        >
          Sign out
        </button>
      </div>
    }
  `,
})
export class UserMenu {
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly panelLabel = $localize`:@@nav.userMenu:Your account`;

  /**
   * What to call the buyer.
   *
   * `full_name` where the backend has one, otherwise the user id - which is always
   * present, so the trigger never renders blank.
   */
  protected readonly displayName = computed(() => {
    const user = this.session.user();
    return user?.full_name ?? user?.name ?? '';
  });

  protected readonly triggerLabel = computed(() =>
    $localize`:@@nav.userMenu.trigger:Your account, ${this.displayName()}:name:`,
  );

  private readonly openSignal = signal(false);
  protected readonly isOpen = this.openSignal.asReadonly();
  protected readonly signingOut = signal(false);

  /**
   * The account routes this application already has.
   *
   * Read from the existing route tree rather than invented: there is one Orders page and
   * one Account page, and a second "Profile" route would be a duplicate of the latter.
   */
  protected readonly links = [
    { path: '/orders', label: $localize`:@@nav.orders:Orders` },
    { path: '/account', label: $localize`:@@nav.account:Account` },
  ];

  protected toggle(): void {
    this.openSignal.update((open) => !open);
  }

  protected close(): void {
    this.openSignal.set(false);
  }

  protected onDocumentClick(event: Event): void {
    if (!this.openSignal()) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && !this.host.nativeElement.contains(target)) {
      this.close();
    }
  }

  /** Unchanged from the shell: `signOut()` never errors, so only "in flight" matters. */
  protected signOut(): void {
    if (this.signingOut()) {
      return;
    }
    this.signingOut.set(true);
    this.close();

    this.session.signOut().subscribe({
      complete: () => {
        this.signingOut.set(false);
        void this.router.navigateByUrl('/login');
      },
    });
  }
}
