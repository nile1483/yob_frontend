import { Component, DestroyRef, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { Alert } from '../../../design/alert/alert';
import { EmptyState } from '../../../design/empty-state/empty-state';
import { Spinner } from '../../../design/spinner/spinner';
import { YobApiError } from '../../../foundation/network/yob-api-error';
import { CmsApi } from '../data/cms.api';
import type { AnyContentBlockDto } from '../contracts/page.types';
import { ContentBlocks } from '../parts/content-blocks';

/**
 * A merchant-authored page: `/pages/:slug`.
 *
 * The route Phase 25D's navigation already generates for `storefront_page` destinations,
 * now with something behind it.
 *
 * ## One request per page
 *
 * `cms.get_page(slug)` and nothing else. The Product Grid's rows arrive **already
 * selected and priced** by the same catalogue service the listing uses, under this
 * buyer's own pricing context - so there is no per-card `get_item`, no pricing call, no
 * stock lookup and no variant resolution. A page with four grids is still one request.
 *
 * Page-local `rxResource` keyed on the slug: one page reads this, it is entirely
 * route-derived, and a slug change replaces it rather than merging into it.
 *
 * ## Blocks are somebody else's problem
 *
 * Since Phase 25H the block list is drawn by {@link ContentBlocks}, the same renderer a
 * system route slot uses. Ordering, the `type` dispatch and the skipping of block types
 * this release cannot draw all live there, once - so adding a sixth block type is a
 * change to that component and to nothing else, here or on any application page.
 *
 * What remains this page's own: the URL, the heading, the SEO tags and the not-found
 * state. Those are what makes it a *page* rather than a position inside one.
 */
@Component({
  selector: 'app-storefront-page',
  imports: [Alert, ContentBlocks, EmptyState, RouterLink, Spinner],
  template: `
    @if (page.isLoading() && payload() === undefined) {
      <div class="yob-content-container mt-8 flex justify-center" data-testid="page-loading">
        <app-spinner label="Loading page" i18n-label="@@content.page.loading" />
      </div>
    } @else if (notFound()) {
      <div class="yob-content-container mt-6" data-testid="page-not-found">
        <app-empty-state>
          <h1 emptyTitle i18n="@@content.page.notFound.title">Page not found</h1>
          <p emptyBody i18n="@@content.page.notFound.body">
            This page may have been renamed or is no longer published.
          </p>
          <a emptyAction routerLink="/catalog" class="underline underline-offset-4" i18n="@@content.page.notFound.action"
            >Browse the catalog</a
          >
        </app-empty-state>
      </div>
    } @else if (page.error()) {
      <div class="yob-content-container mt-6" data-testid="page-error">
        <app-alert tone="error">
          <span i18n="@@content.page.error">We could not load this page. Please try again.</span>
        </app-alert>
      </div>
    } @else if (payload(); as page) {
      <article data-testid="storefront-page" [attr.data-slug]="page.slug">
        <!-- The page's own heading is application chrome, so it sits in the column like
             every other page title and lines up with the brand above it. -->
        <section class="yob-page-section storefront-page-section">
          <div class="yob-content-container">
            <h1
              class="text-2xl font-semibold tracking-tight break-words sm:text-3xl"
              data-testid="page-title"
            >
              {{ page.title }}
            </h1>
          </div>
        </section>

        <!-- Deliberately **not** inside a container. Each block opens its own band and
             its own column, so a merchant can put a dark section across the full width
             of one page and a plain one under it. A wrapper here would cap all of them. -->
        <app-content-blocks class="mt-6" [blocks]="page.blocks" />
      </article>
    }
  `,
})
export class StorefrontPage {
  /** Bound from the `:slug` route parameter. */
  readonly slug = input.required<string>();

  private readonly api = inject(CmsApi);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  protected readonly page = rxResource({
    params: () => ({ slug: this.slug() }),
    stream: ({ params }) => this.api.getPage(params.slug),
  });

  /**
   * The loaded page, or `undefined`.
   *
   * Guarded with `hasValue()`: `resource.value()` throws while the resource is in an
   * error state, and this is read from an effect as well as from the template.
   */
  protected readonly payload = computed(() => (this.page.hasValue() ? this.page.value() : undefined));

  /**
   * A page that is not there is a destination, not a fault.
   *
   * Branching on the stable `page_not_found` code - which covers unknown **and**
   * unpublished, deliberately indistinguishably - rather than on a bare 404 that other
   * failures also use.
   */
  protected readonly notFound = computed(() => {
    const error = this.page.error();
    return error instanceof YobApiError && error.code === 'page_not_found';
  });

  constructor() {
    // Document title and description, from the page's own SEO fields where it has them.
    // Deliberately small and local: there is no SEO abstraction in this project yet, and
    // one route needing two tags is not the case that should invent one.
    effect(() => {
      const page = this.payload();
      if (page === undefined) {
        return;
      }

      this.title.setTitle(page.meta_title ?? page.title);

      // Navigating page to page must not leave the previous description behind, so an
      // absent one is removed rather than left standing.
      const description = page.meta_description ?? null;
      if (description === null) {
        this.meta.removeTag("name='description'");
      } else {
        this.meta.updateTag({ name: 'description', content: description });
      }
    });

    // The same rule on the way out: the next route sets its own title, and a stale
    // description belonging to a page the buyer has left is worse than none.
    inject(DestroyRef).onDestroy(() => this.meta.removeTag("name='description'"));
  }
}

/** Re-exported for the tests that assert what a page skips. */
export type { AnyContentBlockDto };
