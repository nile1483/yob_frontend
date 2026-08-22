import { Component, DestroyRef, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { Alert } from '../../../design/alert/alert';
import { EmptyState } from '../../../design/empty-state/empty-state';
import { Spinner } from '../../../design/spinner/spinner';
import { YobApiError } from '../../../foundation/network/yob-api-error';
import { CmsApi } from '../data/cms.api';
import { isRenderableBlock, type AnyContentBlockDto } from '../contracts/page.types';
import { BannerCarouselBlock } from '../parts/banner-carousel-block';
import { ImageBannerBlock } from '../parts/image-banner-block';
import { ProductGridBlock } from '../parts/product-grid-block';
import { PromoGridBlock } from '../parts/promo-grid-block';
import { RichTextBlock } from '../parts/rich-text-block';

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
 * ## Blocks are rendered in the backend's order
 *
 * Order is a merchandising decision that has already been made. Nothing sorts, groups or
 * re-ranks; the renderer walks the array.
 *
 * ## An unknown block type is skipped, not fatal
 *
 * A backend that adds a sixth block type must not take a page down. Anything this release
 * cannot draw is left out and everything else still renders, so an old client degrades by
 * omission. That is also why the dispatch switches on `type` after an explicit narrowing
 * rather than trusting whichever fields happen to be present.
 */
@Component({
  selector: 'app-storefront-page',
  imports: [
    Alert,
    BannerCarouselBlock,
    EmptyState,
    ImageBannerBlock,
    ProductGridBlock,
    PromoGridBlock,
    RichTextBlock,
    RouterLink,
    Spinner,
  ],
  template: `
    @if (page.isLoading() && payload() === undefined) {
      <div class="mt-8 flex justify-center" data-testid="page-loading">
        <app-spinner label="Loading page" i18n-label="@@content.page.loading" />
      </div>
    } @else if (notFound()) {
      <div class="mt-6" data-testid="page-not-found">
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
      <div class="mt-6" data-testid="page-error">
        <app-alert tone="error">
          <span i18n="@@content.page.error">We could not load this page. Please try again.</span>
        </app-alert>
      </div>
    } @else if (payload(); as page) {
      <article data-testid="storefront-page" [attr.data-slug]="page.slug">
        <h1 class="text-2xl font-semibold tracking-tight break-words sm:text-3xl" data-testid="page-title">
          {{ page.title }}
        </h1>

        <div class="mt-6 flex flex-col gap-10">
          @for (block of renderableBlocks(); track $index) {
            <div data-testid="page-block" [attr.data-block-type]="block.type">
              @switch (block.type) {
                @case ('image_banner') {
                  <app-image-banner-block [block]="block" />
                }
                @case ('rich_text') {
                  <app-rich-text-block [block]="block" />
                }
                @case ('banner_carousel') {
                  <app-banner-carousel-block [block]="block" />
                }
                @case ('product_grid') {
                  <app-product-grid-block [block]="block" />
                }
                @case ('promo_grid') {
                  <app-promo-grid-block [block]="block" />
                }
              }
            </div>
          }
        </div>
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

  /** Only what this release can draw, in the order it arrived. */
  protected readonly renderableBlocks = computed(() =>
    (this.payload()?.blocks ?? []).filter(isRenderableBlock),
  );

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
