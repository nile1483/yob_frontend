import { Service, effect, inject, signal, type Signal } from '@angular/core';

import { normalizeYobFailure } from '../../../foundation/network/yob-api-error';
import { SessionStore } from '../../../foundation/session/session.store';
import type { AnyContentBlockDto } from '../contracts/page.types';
import type {
  ContentRouteKey,
  ContentSlotDto,
  ContentSlotKey,
} from '../contracts/route-content.types';
import { CmsApi } from '../data/cms.api';

/** What one route's request has produced so far. */
interface RouteEntry {
  readonly slots: Signal<readonly ContentSlotDto[]>;
  readonly isLoading: Signal<boolean>;
  readonly hasFailed: Signal<boolean>;
}

/** The writable half, held only by the store. */
interface MutableRouteEntry extends RouteEntry {
  readonly setSlots: (slots: readonly ContentSlotDto[]) => void;
  readonly setLoading: (loading: boolean) => void;
  readonly setFailed: () => void;
}

const NO_BLOCKS: readonly AnyContentBlockDto[] = Object.freeze([]);

/**
 * One request per route, shared by every slot on it.
 *
 * ## The rule this class exists to enforce
 *
 * The backend deliberately returns **all** slots of a route in one answer. A cart
 * renders two slots and Home renders three, and each is a separate component - so
 * without a coordinator, mounting them would issue two and three identical requests for
 * data that is already in the first response.
 *
 * So a slot never calls the API. It asks this store for a route, the first ask starts
 * the one request, and every later ask - from another slot, from a re-render, from a
 * return visit - reads what that request produced.
 *
 * ## Why the map is a signal
 *
 * A slot's `blocks` must recompute when its route's entry appears. Reading a plain `Map`
 * inside a `computed` would capture nothing reactive, so the first render's empty result
 * would stick even after the response arrived. Reading the map *signal* makes the
 * appearance of an entry a dependency, and the entry's own signals carry the update
 * after that.
 *
 * ## Routes do not leak into one another
 *
 * Entries are keyed by route, and `blocksFor` looks up the (route, slot) pair. That
 * matters more than it looks: `above_listing` is declared by **both** `catalog` and
 * `category`, so a lookup by slot key alone would show one route's merchandising on the
 * other.
 *
 * ## Failure is quiet, and never retried
 *
 * This content is supplemental. A cart whose banner failed to load is still a working
 * cart, and an error banner over it would be a worse outcome than the missing banner.
 * A failed route is recorded, its slots stay empty, and nothing asks again - a retry
 * loop behind a page the buyer is actually using is a request storm, not a recovery.
 *
 * ## Why this one clears on a session change, when {@link MenuStore} does not
 *
 * A menu is customer-independent by contract, so one copy is correct for everyone. Route
 * content is **not**: a slot may hold a Product Grid, and a Product Grid is priced
 * through the buyer's own context. The contract says never to cache it across customers,
 * so a sign-out or a switch of user empties the cache rather than showing one buyer the
 * prices quoted to another.
 */
@Service()
export class RouteContentStore {
  private readonly api = inject(CmsApi);
  private readonly session = inject(SessionStore);

  private readonly entries = signal<ReadonlyMap<ContentRouteKey, MutableRouteEntry>>(new Map());

  constructor() {
    // The identity the cached content was priced for. `null` while signed out, which is
    // itself a change worth clearing on.
    let seen: string | null | undefined;

    effect(() => {
      const identity = this.session.user()?.name ?? null;
      if (seen !== undefined && seen !== identity) {
        this.entries.set(new Map());
      }
      seen = identity;
    });
  }

  /**
   * Ensure this route's content is on its way, and hand back what is known.
   *
   * Idempotent: the second, third and hundredth call for a route return the first
   * call's entry. Safe to call from every slot, on every render.
   */
  load(routeKey: ContentRouteKey): RouteEntry {
    const existing = this.entries().get(routeKey);
    if (existing !== undefined) {
      return existing;
    }

    const entry = createEntry();
    this.entries.update((entries) => new Map(entries).set(routeKey, entry));

    entry.setLoading(true);
    this.api.getRouteContent(routeKey).subscribe({
      next: (content) => {
        entry.setSlots(content.slots);
        entry.setLoading(false);
      },
      error: (failure: unknown) => {
        // Normalised so nothing raw can reach a template, then reduced to a flag: what
        // went wrong changes nothing a host page would do about it.
        normalizeYobFailure(failure);
        entry.setFailed();
        entry.setLoading(false);
      },
    });

    return entry;
  }

  /**
   * The blocks in one position, or none.
   *
   * A pure read - it never starts a request. Missing route, missing slot, failed
   * request and a genuinely empty slot all answer the same way, because all four mean
   * the same thing to the caller: draw nothing.
   */
  blocksFor<R extends ContentRouteKey>(
    routeKey: R,
    slotKey: ContentSlotKey<R>,
  ): readonly AnyContentBlockDto[] {
    const entry = this.entries().get(routeKey);
    if (entry === undefined) {
      return NO_BLOCKS;
    }
    return entry.slots().find((slot) => slot.key === slotKey)?.blocks ?? NO_BLOCKS;
  }

  /** Whether this route's request is still in flight. Read by Home, which is mostly content. */
  isLoading(routeKey: ContentRouteKey): boolean {
    return this.entries().get(routeKey)?.isLoading() ?? false;
  }

  /** Whether this route's request failed. Exposed for tests and for Home's own messaging. */
  hasFailed(routeKey: ContentRouteKey): boolean {
    return this.entries().get(routeKey)?.hasFailed() ?? false;
  }
}

function createEntry(): MutableRouteEntry {
  const slots = signal<readonly ContentSlotDto[]>([]);
  const loading = signal(false);
  const failed = signal(false);

  return {
    slots: slots.asReadonly(),
    isLoading: loading.asReadonly(),
    hasFailed: failed.asReadonly(),
    setSlots: (value) => slots.set(value),
    setLoading: (value) => loading.set(value),
    setFailed: () => failed.set(true),
  };
}

/** Re-exported so callers can type an entry without reaching into this file's internals. */
export type { RouteEntry };
