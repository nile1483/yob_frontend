import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  destinationRoute,
  isExternalDestination,
  type MenuDestinationDto,
} from '../contracts/cms.types';

/**
 * Wraps content in the link its destination describes - or in nothing at all.
 *
 * ## Why this exists rather than four copies of the same `@if`
 *
 * Menu items, image banners, carousel slides and promo cards all carry the identical
 * `Destination` shape, and all four need the same three decisions: is it clickable, is it
 * internal or external, and does it open a new tab. Written out per block that is four
 * chances to forget `rel="noopener"` or to invent a route for a `storefront_page`.
 *
 * The rules live in `destinationRoute()`; this is the rendering half of the same idea.
 *
 * ## A null destination is not a broken link, it is not a link
 *
 * The published contract says `null` means "not clickable **or** the target is no longer
 * publishable - render both the same way". So the content is projected bare: no anchor,
 * no cursor change, no click handler that does nothing. A banner nobody configured a
 * destination for should not look pressable.
 */
@Component({
  selector: 'app-destination-link',
  imports: [NgTemplateOutlet, RouterLink],
  template: `
    <!-- Projected content is declared **once**.
         Angular projects a given <ng-content /> slot a single time, so repeating it in
         each branch left every branch after the first rendering an empty element - a
         banner with no image inside its own link. Capturing it in a template and
         stamping that per branch is the supported way to reuse it. -->
    <ng-template #content><ng-content /></ng-template>

    @if (route(); as target) {
      @if (external()) {
        <!-- rel is not decoration: without it the opened page keeps a handle on this
             one through window.opener. -->
        <a
          [href]="target"
          [attr.target]="destination()?.open_in_new_tab ? '_blank' : null"
          [attr.rel]="destination()?.open_in_new_tab ? 'noopener noreferrer' : null"
          [class]="linkClass()"
          data-testid="destination-link"
          [attr.data-destination-type]="destination()?.type"
          [attr.aria-label]="label() || null"
        >
          <ng-container [ngTemplateOutlet]="content" />
        </a>
      } @else {
        <a
          [routerLink]="target"
          [class]="linkClass()"
          data-testid="destination-link"
          [attr.data-destination-type]="destination()?.type"
          [attr.aria-label]="label() || null"
        >
          <ng-container [ngTemplateOutlet]="content" />
        </a>
      }
    } @else {
      <div [class]="linkClass()" data-testid="destination-inert">
        <ng-container [ngTemplateOutlet]="content" />
      </div>
    }
  `,
})
export class DestinationLink {
  readonly destination = input.required<MenuDestinationDto | null>();
  /** Layout classes from the calling block. Never merchant-supplied. */
  readonly linkClass = input('block');
  /**
   * An accessible name for the link.
   *
   * Needed when the only content is an image whose alt text is empty, which is the
   * ordinary case for a decorative banner that happens to be clickable.
   */
  readonly label = input('');

  /**
   * The route, or `null`.
   *
   * The same helper the navigation uses, so `/pages/:slug` is built in exactly one place
   * and every other type uses the backend's own `href`.
   */
  protected readonly route = computed(() => destinationRoute(this.destination()));
  protected readonly external = computed(() => isExternalDestination(this.destination()));
}
