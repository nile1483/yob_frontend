import { Component, inject } from '@angular/core';

import { Spinner } from '../../../design/spinner/spinner';
import { ContentSlot } from '../../content/parts/content-slot';
import { RouteContentStore } from '../../content/state/route-content.store';

/**
 * The storefront landing page.
 *
 * ## Application-owned, not a Storefront Page
 *
 * Home is a route this application declares, with three positions this source file
 * fixes. It is deliberately **not** a `YOB Storefront Page` record and does not route
 * through `/pages/home`: a merchant cannot rename it, cannot unpublish it, and cannot
 * reorder `hero` above `main`. What they can do is decide what goes in each region and
 * in what order - which is the same authority they have on the cart or a category, and
 * the reason this needed no new mechanism.
 *
 * ## Intentionally thin
 *
 * Three slots and nothing else. There is no home-specific block type, no hero component,
 * no featured-products query: a merchant who wants products on Home places a Product
 * Grid, which arrives already selected and priced with the route content. If Home ever
 * needs application behaviour of its own it gets a part like any other page, but an
 * empty store should not have to configure one to see a working page.
 *
 * ## One request for all three regions
 *
 * The three slots share a single `cms.get_route_content(home)` through
 * {@link RouteContentStore}. None of them issues a request.
 *
 * ## The one place a loading state is worth showing
 *
 * Everywhere else content is supplemental and its absence is invisible. Home is almost
 * entirely content, so an empty frame while the request is in flight reads as a broken
 * store rather than as a page still arriving. The existing `Spinner` covers it - this is
 * not a second loading framework, and a failure still just renders the empty page rather
 * than an error, because a store with nothing configured looks exactly the same.
 */
@Component({
  selector: 'app-home-page',
  imports: [ContentSlot, Spinner],
  template: `
    <div data-testid="home-page">
      @if (isLoading()) {
        <div class="yob-content-container mt-8 flex justify-center" data-testid="home-loading">
          <app-spinner label="Loading" i18n-label="@@home.loading" />
        </div>
      }

      <!-- Three fixed regions. The merchant orders blocks inside one; nothing can
           reorder the regions themselves.

           No column and no gap here: every block inside a region opens its own
           full-width band, and a wrapper would cap all of them at the content width.
           Spacing between bands belongs to the bands, or two adjacent surfaces would
           show a stripe of page background between them. -->
      <yob-content-slot routeKey="home" slotKey="hero" />
      <yob-content-slot routeKey="home" slotKey="main" />
      <yob-content-slot routeKey="home" slotKey="bottom" />
    </div>
  `,
})
export class HomePage {
  private readonly content = inject(RouteContentStore);

  protected isLoading(): boolean {
    return this.content.isLoading('home');
  }
}
