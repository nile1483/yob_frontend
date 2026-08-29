import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SessionStore } from '../../foundation/session/session.store';
import type { ProductSuggestionDto } from '../../domains/catalog/contracts/catalog.types';
import {
  RECENT_PRODUCTS_KEY_PREFIX,
  RECENT_PRODUCT_LIMIT,
  RecentProductsStore,
} from './recent-products.store';

const ALICE = 'alice@example.invalid';
const BOB = 'bob@example.invalid';

function product(code: string): ProductSuggestionDto {
  return {
    item_code: code,
    item_name: `Product ${code}`,
    slug: `product-${code.toLowerCase()}`,
    image: null,
    is_template: false,
  };
}

/**
 * Recent products, and who they belong to (Phase 26B).
 *
 * The store is driven against a stubbed session rather than a real one, because the
 * question these ask is entirely about identity: this is an authenticated storefront on
 * a shared browser, and one buyer must never see what another was looking at.
 */
describe('recent products', () => {
  /** Stands in for the signed-in user, so identity can change mid-test. */
  const user = signal<{ name: string; full_name: string | null } | null>(null);

  beforeEach(() => {
    localStorage.clear();
    user.set({ name: ALICE, full_name: 'Alice' });

    TestBed.configureTestingModule({
      providers: [{ provide: SessionStore, useValue: { user } }],
    });
  });

  afterEach(() => localStorage.clear());

  function store(): RecentProductsStore {
    return TestBed.inject(RecentProductsStore);
  }

  function stored(identity: string): unknown {
    const raw = localStorage.getItem(`${RECENT_PRODUCTS_KEY_PREFIX}${identity}`);
    return raw === null ? null : JSON.parse(raw);
  }

  describe('ordering', () => {
    it('keeps the newest first', () => {
      const recent = store();
      recent.remember(product('A'));
      recent.remember(product('B'));

      expect(recent.products().map((p) => p.item_code)).toEqual(['B', 'A']);
    });

    it('moves a repeated product back to the top instead of duplicating it', () => {
      const recent = store();
      recent.remember(product('A'));
      recent.remember(product('B'));
      recent.remember(product('A'));

      // The list answers "what was I just looking at". A repeat is one answer, not two.
      expect(recent.products().map((p) => p.item_code)).toEqual(['A', 'B']);
    });

    it(`keeps at most ${RECENT_PRODUCT_LIMIT}`, () => {
      const recent = store();
      for (const code of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
        recent.remember(product(code));
      }

      expect(recent.products()).toHaveLength(RECENT_PRODUCT_LIMIT);
      expect(recent.products()[0]?.item_code).toBe('G');
      expect(recent.products().map((p) => p.item_code)).not.toContain('A');
    });
  });

  describe('what it stores', () => {
    it('persists only the five published fields', () => {
      const recent = store();
      recent.remember({
        ...product('A'),
        // A future backend field, or anything monetary, must not be carried along.
        rate: 99.5,
        stock_qty: 4,
      } as ProductSuggestionDto & { rate: number; stock_qty: number });

      const rows = stored(ALICE) as Record<string, unknown>[];
      expect(Object.keys(rows[0]!).sort()).toEqual([
        'image',
        'is_template',
        'item_code',
        'item_name',
        'slug',
      ]);
      expect(JSON.stringify(rows)).not.toContain('99.5');
    });

    it('writes under the user id, not the display name', () => {
      store().remember(product('A'));

      // Display names are neither unique nor stable; two colleagues sharing one would
      // share a history.
      expect(stored(ALICE)).not.toBeNull();
      expect(localStorage.getItem(`${RECENT_PRODUCTS_KEY_PREFIX}Alice`)).toBeNull();
    });

    it('writes nothing at all when nobody is signed in', () => {
      user.set(null);
      const recent = store();
      recent.remember(product('A'));

      expect(recent.products()).toEqual([]);
      expect(localStorage.length).toBe(0);
    });
  });

  describe('one buyer never sees another', () => {
    it('keeps two users on a shared browser apart', () => {
      const recent = store();
      recent.remember(product('ALICE-ONLY'));

      user.set({ name: BOB, full_name: 'Bob' });

      // Switching identity switches the list - in storage and, just as importantly, in
      // memory. Bob must not inherit what Alice was looking at.
      expect(recent.products()).toEqual([]);

      recent.remember(product('BOB-ONLY'));
      expect(recent.products().map((p) => p.item_code)).toEqual(['BOB-ONLY']);

      user.set({ name: ALICE, full_name: 'Alice' });
      expect(recent.products().map((p) => p.item_code)).toEqual(['ALICE-ONLY']);
    });

    it('drops the previous list from memory on sign-out', () => {
      const recent = store();
      recent.remember(product('A'));
      expect(recent.products()).toHaveLength(1);

      user.set(null);

      // Not merely "not persisted": not readable either. A signed-out header showing the
      // last buyer's products would be the leak this namespace exists to prevent.
      expect(recent.products()).toEqual([]);
    });
  });

  describe('when storage misbehaves', () => {
    it('reads malformed JSON as no recent products', () => {
      localStorage.setItem(`${RECENT_PRODUCTS_KEY_PREFIX}${ALICE}`, 'not json at all');

      expect(store().products()).toEqual([]);
    });

    it('rejects rows of the wrong shape, keeping the valid ones', () => {
      localStorage.setItem(
        `${RECENT_PRODUCTS_KEY_PREFIX}${ALICE}`,
        JSON.stringify([{ item_code: 'X' }, 'nonsense', 42, product('GOOD')]),
      );

      // A value written by an older release parses perfectly and is still not this
      // shape. A half-valid row would render as a dropdown entry navigating nowhere.
      expect(store().products().map((p) => p.item_code)).toEqual(['GOOD']);
    });

    it('reads a non-array as no recent products', () => {
      localStorage.setItem(`${RECENT_PRODUCTS_KEY_PREFIX}${ALICE}`, JSON.stringify({ a: 1 }));

      expect(store().products()).toEqual([]);
    });
  });
});
