import { signal, computed } from '@angular/core';
import { Subscription } from 'rxjs';

import { normalizeYobFailure } from '../../../foundation/network/yob-api-error';
import type { CatalogApi } from '../data/catalog.api';
import { NO_FILTERS, type StorefrontFilterSelection } from '../storefront-filters';
import {
  categoryListingQuery,
  type CatalogItemDto,
  type ItemListingQuery,
  type ItemListingSort,
} from '../contracts/catalog.types';

/**
 * One category's item listing: the rows, the cursor, and the two kinds of failure.
 *
 * ## Why a class, and why not a store
 *
 * Exactly one page consumes this, so it is **not** a `@Service()` and not injectable -
 * the page constructs one with `new`. That keeps it page-local, as a single-consumer
 * piece of state should be, while still being a plain object a test can drive directly
 * without rendering anything.
 *
 * It is a class rather than a handful of signals inside the component because the rules
 * below are the substance of this phase, and they are easier to state - and to test -
 * in one place than scattered through a template's backing fields.
 *
 * ## The rule that matters most
 *
 * The backend scanner has a per-request scan budget. So this is a **valid** response:
 *
 * ```json
 * { "items": [], "pagination": { "has_more": true, "next_cursor": "..." } }
 * ```
 *
 * It means *this request ran out of scan budget*, not *the catalogue ran out of items*.
 * Exhaustion is therefore read from `has_more` and from nothing else. Deriving it from
 * `items.length` or `returned_count` would silently truncate a category at whatever
 * point the scanner happened to stop - the failure mode this class exists to prevent.
 *
 * A budget-exhausted page is not auto-retried either: the buyer presses Load More again.
 * Chasing continuations in a loop would turn one click into an unbounded request storm.
 *
 * ## Two failures, two consequences
 *
 * A first page that fails leaves nothing on screen, so it is a page-level error state.
 * A Load More that fails must **keep every row already loaded** and offer a retry beside
 * the button - replacing a screen of products with an error because page three failed
 * would be a worse outcome than the failure.
 */
export class ItemListing {
  constructor(private readonly api: CatalogApi) {}

  private readonly rows = signal<readonly CatalogItemDto[]>([]);
  private readonly cursorSignal = signal<string | null>(null);
  private readonly hasMoreSignal = signal(false);
  private readonly initialLoadingSignal = signal(false);
  private readonly loadingMoreSignal = signal(false);
  private readonly initialErrorSignal = signal(false);
  private readonly loadMoreErrorSignal = signal(false);
  /** True once a first page has landed, which distinguishes "empty" from "not asked". */
  private readonly loadedSignal = signal(false);

  readonly items = this.rows.asReadonly();
  readonly cursor = this.cursorSignal.asReadonly();
  readonly hasMore = this.hasMoreSignal.asReadonly();
  readonly initialLoading = this.initialLoadingSignal.asReadonly();
  readonly loadingMore = this.loadingMoreSignal.asReadonly();
  readonly initialError = this.initialErrorSignal.asReadonly();
  readonly loadMoreError = this.loadMoreErrorSignal.asReadonly();
  readonly isLoaded = this.loadedSignal.asReadonly();

  /** True catalogue exhaustion: a page arrived, nothing in it, and no more to come. */
  readonly isEmpty = computed(
    () => this.loadedSignal() && this.rows().length === 0 && !this.hasMoreSignal(),
  );

  /** The query the next request will use; also what a retry repeats verbatim. */
  private query: ItemListingQuery | null = null;

  /**
   * Guards against a slower earlier response overwriting a newer one.
   *
   * Every request captures the generation it started in; a response whose generation is
   * stale is dropped. Incremented by `load()`, so switching category or sort - and a
   * burst of either - can never be overtaken by the request it replaced. Cheaper and
   * clearer here than a `switchMap` pipeline, because the loads are imperative.
   */
  private generation = 0;
  private inFlight: Subscription | null = null;

  /**
   * Start a listing over: new category, new sort, or a new filter selection.
   *
   * Everything resets, **including the cursor**. A cursor is bound to the query that
   * issued it - the merchandising selection is part of its fingerprint - so replaying one
   * under a different selection answers `cursor_invalid`. Even if it were accepted,
   * appending a page drawn under one selection to rows drawn under another would produce
   * a listing that matches neither.
   *
   * So there is no "apply filters" path that keeps the cursor: changing the selection is
   * starting over, and that is this one method.
   */
  load(
    slug: string,
    sort: ItemListingSort,
    storefrontFilters: StorefrontFilterSelection = NO_FILTERS,
  ): void {
    this.generation++;
    this.inFlight?.unsubscribe();
    this.inFlight = null;

    this.query = categoryListingQuery(slug, sort, storefrontFilters);
    this.rows.set([]);
    this.cursorSignal.set(null);
    this.hasMoreSignal.set(false);
    this.loadedSignal.set(false);
    this.loadMoreErrorSignal.set(false);
    this.initialErrorSignal.set(false);
    this.initialErrorCodeSignal.set(null);
    this.loadingMoreSignal.set(false);
    this.initialLoadingSignal.set(true);

    this.request(this.query, this.generation, 'replace');
  }

  /**
   * Fetch the next page and append it.
   *
   * Ignored when there is nothing more to fetch or a request is already running, so a
   * double click cannot issue two requests or append a page twice.
   */
  loadMore(): void {
    if (!this.hasMoreSignal() || this.loadingMoreSignal() || this.query === null) {
      return;
    }

    this.loadMoreErrorSignal.set(false);
    this.loadingMoreSignal.set(true);

    // The cursor is the one from the last successful page: a failure never advanced it,
    // so a retry repeats exactly the same request.
    const next: ItemListingQuery = { ...this.query, cursor: this.cursorSignal() };
    this.request(next, this.generation, 'append');
  }

  /**
   * The code of a first-page failure, when the backend named one.
   *
   * Kept because the merchandising failures are the one class the page can act on: a
   * stale selection is fixable by clearing it, where a transport failure is fixable by
   * retrying. Everything else stays a generic error, as before.
   */
  private readonly initialErrorCodeSignal = signal<string | null>(null);
  readonly initialErrorCode = this.initialErrorCodeSignal.asReadonly();

  /** Cancel anything outstanding. Called when the page goes away. */
  destroy(): void {
    this.generation++;
    this.inFlight?.unsubscribe();
    this.inFlight = null;
  }

  private request(query: ItemListingQuery, generation: number, mode: 'replace' | 'append'): void {
    this.inFlight = this.api.getItems(query).subscribe({
      next: (page) => {
        if (generation !== this.generation) {
          return;
        }

        this.rows.update((current) =>
          mode === 'replace' ? [...page.items] : append(current, page.items),
        );

        // Straight from the backend. Never inferred from how many rows came back: an
        // empty page with `has_more: true` is a budget-exhausted continuation, not the
        // end of the catalogue.
        this.hasMoreSignal.set(page.pagination.has_more);
        this.cursorSignal.set(page.pagination.next_cursor);

        this.loadedSignal.set(true);
        this.initialLoadingSignal.set(false);
        this.loadingMoreSignal.set(false);
      },
      error: (failure: unknown) => {
        if (generation !== this.generation) {
          return;
        }
        // Normalized so nothing raw can reach a template. The code is carried, not acted
        // on: this class does not decide what a merchandising refusal means for the UI,
        // and it never re-requests - a rejected selection re-sent unchanged is refused
        // again, which is a retry loop rather than a recovery.
        const error = normalizeYobFailure(failure);

        if (mode === 'replace') {
          this.initialLoadingSignal.set(false);
          this.initialErrorCodeSignal.set(error.code);
          this.initialErrorSignal.set(true);
        } else {
          // Rows, cursor and hasMore are all left exactly as they were, so the products
          // already on screen stay and the retry repeats the same request.
          this.loadingMoreSignal.set(false);
          this.loadMoreErrorSignal.set(true);
        }
      },
    });
  }
}

/**
 * Append a page, skipping anything already listed.
 *
 * The cursor contract has no-overlap guarantees, so this is belt and braces rather than
 * compensation for a broken contract. It preserves the order of what is already there:
 * a duplicate is dropped, never moved, because reordering loaded rows under a buyer who
 * is reading them is worse than showing one twice.
 */
function append(
  current: readonly CatalogItemDto[],
  incoming: readonly CatalogItemDto[],
): readonly CatalogItemDto[] {
  const seen = new Set(current.map((item) => item.name));
  return [...current, ...incoming.filter((item) => !seen.has(item.name))];
}
