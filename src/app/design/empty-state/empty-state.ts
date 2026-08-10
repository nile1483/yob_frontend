import { Component } from '@angular/core';

/**
 * Structure for "there is nothing here yet".
 *
 * Layout only - every word comes from the caller. A design primitive that knew what an
 * empty cart or an empty order list should say would be a business decision hiding in
 * `design/`, and would need editing for every copied client.
 *
 * ```html
 * <app-empty-state>
 *   <h2 emptyTitle>No orders yet</h2>
 *   <p emptyBody>Orders you place will appear here.</p>
 *   <button yob-button emptyAction>Browse the catalog</button>
 * </app-empty-state>
 * ```
 *
 * The caller supplies the heading element too, so the page keeps a correct heading
 * level instead of this component guessing one.
 */
@Component({
  selector: 'app-empty-state',
  template: `
    <div class="flex flex-col items-center gap-2 rounded-md border border-dashed border-slate-300 px-6 py-10 text-center">
      <div class="text-base font-semibold text-slate-900">
        <ng-content select="[emptyTitle]" />
      </div>

      <div class="max-w-prose text-sm text-slate-600">
        <ng-content select="[emptyBody]" />
      </div>

      <div class="mt-2 empty:hidden">
        <ng-content select="[emptyAction]" />
      </div>
    </div>
  `,
})
export class EmptyState {}
