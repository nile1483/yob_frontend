import { Service, computed, inject, signal } from '@angular/core';

import { SessionStore } from '../../foundation/session/session.store';
import type { ProductSuggestionDto } from '../../domains/catalog/contracts/catalog.types';

/** How many products a buyer sees under an empty search box. */
export const RECENT_PRODUCT_LIMIT = 5;

/** The namespace every user's list lives under. The identity is appended. */
export const RECENT_PRODUCTS_KEY_PREFIX = 'yob.product-search.recent.';

/**
 * The products this buyer actually opened from the header search.
 *
 * ## What it is not
 *
 * **Not search-term history.** Nothing a buyer types is ever stored - only products they
 * *clicked*, from a live suggestion or from this list itself. A typed string is a guess;
 * a click is a decision, and re-offering a guess ("bolr") helps nobody.
 *
 * ## Per user, on purpose
 *
 * This is an authenticated storefront and browsers are shared. The key is namespaced by
 * the Frappe user id from session state - a stable identity - and never by the display
 * name, which is neither unique nor stable. When the signed-in identity changes the list
 * is re-read for the new user, so one buyer never sees what another was looking at, in
 * storage **or** in memory.
 *
 * ## Deliberately small, and never sensitive
 *
 * Five rows of exactly what a dropdown row needs to draw itself and open a page. No rate,
 * no stock, no UOM, no address, no token: this is browser convenience data, and anything
 * monetary would be a stale copy of something the product page owns.
 *
 * ## Storage may simply not work
 *
 * Private modes, blocked cookies and full quotas all make `localStorage` throw on access,
 * and a value written by an older release may not parse or may not match this shape.
 * Every one of those degrades to "no recent products" - a header that throws because a
 * convenience list was malformed would be a far worse bug than the missing list.
 */
@Service()
export class RecentProductsStore {
  private readonly session = inject(SessionStore);

  /**
   * The identity the list belongs to, or `null` when nobody is signed in.
   *
   * `user.name` is the Frappe user id. Deliberately not `full_name`: display names are
   * neither unique nor stable, and two colleagues sharing one would share a history.
   */
  private readonly identity = computed(() => this.session.user()?.name ?? null);

  private readonly loaded = signal<{ identity: string | null; items: readonly ProductSuggestionDto[] }>(
    { identity: null, items: [] },
  );

  /**
   * This user's recent products, newest first.
   *
   * Re-reads whenever the signed-in identity changes, which is what makes a sign-out
   * drop the previous buyer's list from memory rather than merely from storage.
   */
  readonly products = computed<readonly ProductSuggestionDto[]>(() => {
    const identity = this.identity();
    const cached = this.loaded();
    if (cached.identity === identity) {
      return cached.items;
    }
    return read(identity);
  });

  /**
   * Record a product the buyer opened.
   *
   * Newest first, no duplicates: opening something already in the list moves it back to
   * the top rather than adding a second row, because the list answers "what was I just
   * looking at", and a repeated product is one answer, not two.
   */
  remember(product: ProductSuggestionDto): void {
    const identity = this.identity();
    if (identity === null) {
      // No signed-in identity means no namespace to write under. Dropping the entry is
      // better than writing it somewhere a later user could read.
      return;
    }

    const kept = this.products().filter((item) => item.item_code !== product.item_code);
    const next = [minimal(product), ...kept].slice(0, RECENT_PRODUCT_LIMIT);

    this.loaded.set({ identity, items: next });
    write(identity, next);
  }

  /** Forget this user's list, in storage and in memory. */
  clear(): void {
    const identity = this.identity();
    this.loaded.set({ identity, items: [] });
    if (identity !== null) {
      safely(() => localStorage.removeItem(keyFor(identity)));
    }
  }
}

function keyFor(identity: string): string {
  return `${RECENT_PRODUCTS_KEY_PREFIX}${identity}`;
}

/**
 * Only the five published fields, copied deliberately.
 *
 * Spreading the suggestion would persist whatever a future backend adds to it - which is
 * how a price or a stock figure ends up in `localStorage` without anyone deciding to put
 * it there.
 */
function minimal(product: ProductSuggestionDto): ProductSuggestionDto {
  return {
    item_code: product.item_code,
    item_name: product.item_name,
    slug: product.slug,
    image: product.image,
    is_template: product.is_template,
  };
}

/** Read one user's list, or an empty one for every possible failure. */
function read(identity: string | null): readonly ProductSuggestionDto[] {
  if (identity === null) {
    return [];
  }

  const raw = safely(() => localStorage.getItem(keyFor(identity)));
  if (raw === undefined || raw === null || raw === '') {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  // Every row is checked, not just the array: a value written by an older release may
  // parse perfectly and still be the wrong shape, and a half-valid row would render as
  // a dropdown entry that navigates nowhere.
  return parsed.filter(isSuggestion).slice(0, RECENT_PRODUCT_LIMIT).map(minimal);
}

function write(identity: string, items: readonly ProductSuggestionDto[]): void {
  safely(() => localStorage.setItem(keyFor(identity), JSON.stringify(items)));
}

function isSuggestion(value: unknown): value is ProductSuggestionDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row['item_code'] === 'string' &&
    typeof row['item_name'] === 'string' &&
    typeof row['slug'] === 'string' &&
    row['slug'] !== '' &&
    (row['image'] === null || typeof row['image'] === 'string') &&
    typeof row['is_template'] === 'boolean'
  );
}

/**
 * Touch storage without letting it take the header down.
 *
 * `localStorage` is a property access that **throws** where the browser blocks it, so
 * even reading it needs the guard - not just writing.
 */
function safely<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}
