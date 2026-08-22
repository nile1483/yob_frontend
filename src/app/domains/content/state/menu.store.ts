import { Service, computed, inject, signal } from '@angular/core';

import { normalizeYobFailure } from '../../../foundation/network/yob-api-error';
import type { MenuDto } from '../contracts/cms.types';
import { CmsApi } from '../data/cms.api';

/** The merchant menu the storefront shell renders. One key, wired in source. */
export const MAIN_MENU_KEY = 'main';

/**
 * The merchant-configured navigation tree.
 *
 * ## Why this is a store
 *
 * The same tree is rendered twice - once for the desktop header and once for the mobile
 * row - and the phase requires **one dataset**, not two navigation models that could
 * disagree. Two consumers of one truth is the project's stated trigger for a store, and
 * it is also what keeps the menu to a single request: fetching per instance would ask
 * the backend for the same customer-independent tree twice on every page.
 *
 * ## Loaded once, deliberately
 *
 * `load()` is idempotent - a second call while one is in flight, or after a tree has
 * arrived, does nothing. The shell renders on every navigation, so a store that refetched
 * on construction would put a request on every page transition to redraw a menu that had
 * not changed. Menus are customer-independent per the contract, so one copy is correct.
 *
 * ## Failure is quiet on purpose
 *
 * If the menu cannot be loaded the shell shows its own code-owned controls and no
 * merchant navigation. An error banner across the top of every page - for a *decoration*
 * the buyer may not have been about to use - would be worse than the absence, and the
 * `menu_not_found` case is indistinguishable from "this store has no menu configured"
 * by design. Nothing here retries.
 */
@Service()
export class MenuStore {
  private readonly api = inject(CmsApi);

  private readonly menuSignal = signal<MenuDto | null>(null);
  private readonly loadingSignal = signal(false);
  private readonly failedSignal = signal(false);
  private readonly attemptedSignal = signal(false);

  /** The published tree, or `null` before one has arrived. */
  readonly menu = this.menuSignal.asReadonly();
  readonly isLoading = this.loadingSignal.asReadonly();
  /** True when the menu could not be loaded. The shell renders nothing extra for it. */
  readonly hasFailed = this.failedSignal.asReadonly();

  /** Top-level nodes, in the merchant's order. Empty until something has loaded. */
  readonly items = computed(() => this.menuSignal()?.items ?? []);

  /** Load the menu once. Safe to call from every shell instance, on every render. */
  load(menuKey: string = MAIN_MENU_KEY): void {
    if (this.attemptedSignal() || this.loadingSignal()) {
      return;
    }

    this.attemptedSignal.set(true);
    this.loadingSignal.set(true);

    this.api.getMenu(menuKey).subscribe({
      next: (menu) => {
        this.menuSignal.set(menu);
        this.loadingSignal.set(false);
      },
      error: (failure: unknown) => {
        // Normalised so nothing raw can reach a template, then reduced to a flag: what
        // went wrong changes nothing the shell would do about it.
        normalizeYobFailure(failure);
        this.failedSignal.set(true);
        this.loadingSignal.set(false);
      },
    });
  }
}
