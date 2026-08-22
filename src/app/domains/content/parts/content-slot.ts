import { Component, computed, effect, inject, input } from '@angular/core';

import type { ContentRouteKey, ContentSlotKey } from '../contracts/route-content.types';
import { RouteContentStore } from '../state/route-content.store';
import { ContentBlocks } from './content-blocks';

/**
 * One application-owned position where merchant content may appear.
 *
 * ```html
 * <yob-content-slot routeKey="cart" slotKey="above_cart" />
 * ```
 *
 * ## What a host page gives up by using this
 *
 * Everything. A cart page declares a position and learns nothing else: not what a block
 * is, not that carousels exist, not whether anything was placed there at all. That is
 * the whole point of the abstraction - `ContentBlocks` owns the block types, this owns
 * "which position", and the host owns only "there may be content here".
 *
 * ## The pair is checked at compile time
 *
 * `routeKey` fixes the generic parameter, and `slotKey` is then the slots **that route**
 * declares. `routeKey="cart" slotKey="hero"` does not compile: `hero` is Home's. This
 * matters because slot keys are not unique on their own - `above_listing` belongs to
 * both `catalog` and `category` - so only the pair identifies a position.
 *
 * ## It issues no request of its own
 *
 * The store is asked for the route, not for the slot. Three slots on Home and two on the
 * cart share one response each, because the backend returns every slot of a route in one
 * answer and asking per slot would throw most of it away.
 *
 * The ask happens in an `effect` rather than a `computed`: starting a request is a write,
 * and a computed that wrote signals would be both illegal and a lie about being pure.
 *
 * ## Empty renders nothing at all
 *
 * No wrapper, no spacing, no placeholder. A slot with nothing in it must be invisible in
 * the layout, otherwise every page would carry the gaps of content nobody wrote. Missing
 * route, empty slot and failed request are deliberately indistinguishable here - all
 * three mean "draw nothing", and the host page keeps working in every one of them.
 */
@Component({
  selector: 'yob-content-slot',
  imports: [ContentBlocks],
  template: `
    @if (blocks().length > 0) {
      <app-content-blocks
        [blocks]="blocks()"
        data-testid="content-slot"
        [attr.data-route]="routeKey()"
        [attr.data-slot]="slotKey()"
      />
    }
  `,
  host: { class: 'contents' },
})
export class ContentSlot<R extends ContentRouteKey = ContentRouteKey> {
  readonly routeKey = input.required<R>();
  readonly slotKey = input.required<ContentSlotKey<R>>();

  private readonly store = inject(RouteContentStore);

  constructor() {
    // Idempotent per route: the store ignores every call after the first, so mounting
    // several slots is still one request.
    effect(() => this.store.load(this.routeKey()));
  }

  /** Whatever the merchant placed here, or nothing. Never a request. */
  protected readonly blocks = computed(() =>
    this.store.blocksFor(this.routeKey(), this.slotKey()),
  );
}
