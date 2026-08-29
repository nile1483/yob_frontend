import { Component, computed, input } from '@angular/core';

import { mediaUrl } from '../../../../foundation/media/media-url';
import type {
  ProductDownloadBlockDto,
  ProductImageBlockDto,
  ProductKeyValueBlockDto,
  ProductRichTextBlockDto,
  ProductTableBlockDto,
  ProductVideoBlockDto,
} from '../../contracts/catalog.types';
import { videoPresentation } from './product-video-url';

/**
 * The six product-content block renderers (Phase 27D).
 *
 * One file because they are one family: six small, closed presentations of one union,
 * each read only by the dispatcher next door. Splitting them into six files would spread
 * a single decision - "how product information looks on a product page" - across a
 * directory, and none of them is reused anywhere else.
 *
 * ## None of these is a CMS block
 *
 * `rich_text` and `image` exist in the Phase 25 union too, with different shapes and a
 * placement's `section_style`/`content_width` attached. These carry no presentation
 * metadata at all, because the backend sends none and Angular owns product-page layout.
 * Nothing here imports a CMS renderer, and a contract guard fails if it starts to.
 */

/**
 * Merchant prose about the product.
 *
 * ## Sanitised on the way in, and again here
 *
 * The backend sanitises on save **and** on read, and its own contract still says to
 * render through a trusted-HTML policy. Angular's is the DOM sanitiser, which
 * ordinary `[innerHTML]` runs: `<script>` is dropped, inline handlers such as `onerror`
 * are stripped, and `javascript:` hrefs are neutralised.
 *
 * **There is no `bypassSecurityTrustHtml` here, and there must never be.** Content typed
 * into an admin field is still content someone typed; a stored XSS would otherwise
 * execute in every buyer's session, and this file is the only place that could grant it.
 * Two independent sanitisers is the point - defence in depth means neither trusts the
 * other to have run.
 */
@Component({
  selector: 'app-product-rich-text',
  imports: [],
  template: `
    <div
      class="product-prose text-slate-700 [&_a]:underline [&_a]:underline-offset-2 [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
      [innerHTML]="block().content"
      data-testid="product-block-rich-text"
    ></div>
  `,
})
export class ProductRichText {
  readonly block = input.required<ProductRichTextBlockDto>();
}

/**
 * A specification list: label on the left, value on the right.
 *
 * A real `<dl>`, so a screen reader announces "Material, Stainless Steel" as a pair
 * rather than as two unrelated runs of text. The two-column grid is a desktop
 * presentation of that structure and collapses to stacked rows on a phone, where a
 * 14rem label column would leave nothing for the value.
 *
 * Order is the merchant's. Nothing sorts, and nothing alphabetises: a specification
 * table reads top-down in the order an engineer wrote it, and "Material" before
 * "Weight" is a decision rather than an accident.
 */
@Component({
  selector: 'app-product-key-value',
  imports: [],
  template: `
    <dl class="divide-y divide-slate-200 border-y border-slate-200" data-testid="product-block-key-value">
      @for (entry of block().items; track $index) {
        <div
          class="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-4"
          data-testid="product-spec-row"
        >
          <dt class="text-sm font-medium break-words text-slate-900">{{ entry.key }}</dt>
          <dd class="text-sm break-words text-slate-700">{{ entry.value }}</dd>
        </div>
      }
    </dl>
  `,
})
export class ProductKeyValue {
  readonly block = input.required<ProductKeyValueBlockDto>();
}

/**
 * A real table of real data.
 *
 * ## It scrolls inside its own box
 *
 * A six-column specification table does not fit a 390px phone, and the two ways to
 * handle that are shrinking the text to illegibility or letting the table scroll. It
 * scrolls: `overflow-x-auto` on the wrapper means the *table* moves sideways and the
 * page never does, which is what keeps the document free of a horizontal scrollbar.
 *
 * ## No sorting, no transposing, no cleverness
 *
 * Columns render left to right as sent, rows top to bottom as sent. There is no client
 * sort, because sorting is a claim about which order is meaningful and the merchant has
 * already made it. A table is also not a key/value list turned sideways - they are
 * separate block types answering separate questions, and neither is derived from the
 * other.
 *
 * The contract guarantees every row carries exactly `columns.length` cells, padded with
 * empty strings. The template still indexes defensively rather than relying on it: a
 * short row should leave a blank cell, not throw inside a product page.
 */
@Component({
  selector: 'app-product-table',
  imports: [],
  template: `
    <div
      class="overflow-x-auto rounded-md border border-slate-200"
      data-testid="product-block-table"
    >
      <table class="w-full min-w-max border-collapse text-left text-sm">
        <thead class="bg-slate-50">
          <tr>
            @for (column of block().columns; track $index) {
              <th
                scope="col"
                class="border-b border-slate-200 px-3 py-2 font-semibold text-slate-900"
                data-testid="product-table-header"
              >
                {{ column }}
              </th>
            }
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          @for (row of block().rows; track $index) {
            <tr data-testid="product-table-row">
              @for (column of block().columns; track $index; let cell = $index) {
                <td class="px-3 py-2 align-top text-slate-700" data-testid="product-table-cell">
                  {{ row[cell] ?? '' }}
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class ProductTable {
  readonly block = input.required<ProductTableBlockDto>();
}

/**
 * A content image: a diagram, a dimensioned drawing, an installation step.
 *
 * ## Why this is not `app-media`
 *
 * `Media` exists to make a grid of product photographs line up, so it fixes the box and
 * fits the picture into it. That is right for a catalogue card and wrong for a dimension
 * drawing: cropping or letterboxing a technical diagram into a 3:4 frame either cuts off
 * the measurements or shrinks them to nothing. Content imagery keeps its **own** aspect
 * ratio, at whatever width the column gives it.
 *
 * What is not re-implemented is URL resolution: `mediaUrl()` is the one place a stored
 * path becomes a URL, and it is used here exactly as everywhere else.
 *
 * ## Alt text is not invented
 *
 * Unlike the gallery, a blank `alt_text` does **not** fall back to the product's name.
 * "Hex Bolt M10" is a truthful description of a photograph of the bolt and a misleading
 * one for a torque chart. An unlabelled content image is marked decorative with `alt=""`,
 * which tells a screen reader to skip it rather than to announce something wrong - and
 * the caption below, when there is one, is real content it will reach anyway.
 */
@Component({
  selector: 'app-product-image',
  imports: [],
  template: `
    @if (src(); as url) {
      <figure class="flex flex-col gap-2" data-testid="product-block-image">
        <img
          [src]="url"
          [alt]="alt()"
          loading="lazy"
          decoding="async"
          class="h-auto max-w-full rounded-md border border-slate-200"
          data-testid="product-content-image"
        />
        @if (caption(); as text) {
          <figcaption class="text-sm text-slate-600" data-testid="product-image-caption">
            {{ text }}
          </figcaption>
        }
      </figure>
    }
  `,
})
export class ProductImage {
  readonly block = input.required<ProductImageBlockDto>();

  protected readonly src = computed(() => mediaUrl(this.block().image));
  protected readonly alt = computed(() => nonBlank(this.block().alt_text) ?? '');
  protected readonly caption = computed(() => nonBlank(this.block().caption));
}

/**
 * A document the buyer can open: a datasheet, a manual, a certificate.
 *
 * A real `<a>` to the stored Frappe file URL, and nothing more. Nothing here fetches the
 * file to learn its size or type, builds a blob, calls an endpoint, or exposes anything
 * about the File doctype behind it - all of which would be work the buyer's browser can
 * do for itself by following a link.
 *
 * Opened in a new tab, because a datasheet is a reference consulted *while* looking at
 * the product: navigating the page away to show a PDF loses the buy box the buyer was
 * reading. `rel="noopener noreferrer"` accordingly.
 *
 * The label falls back in three steps - the merchant's own words, then the file's name
 * from the URL, then a generic phrase - so a link is never rendered with nothing to read.
 */
@Component({
  selector: 'app-product-download',
  imports: [],
  template: `
    @if (href(); as url) {
      <a
        [href]="url"
        target="_blank"
        rel="noopener noreferrer"
        class="flex flex-col gap-1 rounded-md border border-slate-200 bg-slate-50/60 p-4 transition-colors hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2"
        data-testid="product-block-download"
      >
        <span class="text-sm font-medium text-slate-900 underline underline-offset-4">
          {{ label() }}
        </span>
        @if (description(); as text) {
          <span class="text-sm text-slate-600" data-testid="product-download-description">
            {{ text }}
          </span>
        }
      </a>
    }
  `,
})
export class ProductDownload {
  readonly block = input.required<ProductDownloadBlockDto>();

  protected readonly fallbackLabel = $localize`:@@product.content.download:Download file`;

  protected readonly href = computed(() => mediaUrl(this.block().file));

  protected readonly description = computed(() => nonBlank(this.block().description));

  protected readonly label = computed(
    () => nonBlank(this.block().label) ?? fileName(this.href()) ?? this.fallbackLabel,
  );
}

/**
 * A video: played here when the browser can, linked when it cannot.
 *
 * ## No iframe, and no provider integration
 *
 * A direct `.mp4`/`.webm`/`.ogg` gets a native `<video>` with controls. **Everything
 * else - YouTube, Vimeo, a manufacturer's page - gets a link.** Nothing parses a video
 * id, builds an embed URL, calls oEmbed or loads a provider script, and there is no
 * `bypassSecurityTrustResourceUrl` anywhere: an iframe pointed at a merchant-controlled
 * address runs third-party code beside the storefront, and a link does not.
 *
 * `preload="metadata"` so opening a product page does not download a video nobody
 * pressed play on; `playsinline` so a phone does not hijack the screen; no `autoplay`
 * and no loop. See `videoPresentation()` for how the two cases are told apart, and for
 * why a malformed or non-http(s) URL renders nothing at all.
 */
@Component({
  selector: 'app-product-video',
  imports: [],
  template: `
    @switch (presentation().kind) {
      @case ('file') {
        <video
          [src]="videoSrc()"
          controls
          preload="metadata"
          playsinline
          class="h-auto max-w-full rounded-md border border-slate-200"
          data-testid="product-block-video"
        ></video>
      }
      @case ('link') {
        <a
          [href]="videoSrc()"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm font-medium text-slate-900 underline underline-offset-4 transition-colors hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2"
          data-testid="product-block-video-link"
          i18n="@@product.content.watchVideo"
        >
          Watch video
        </a>
      }
    }
  `,
})
export class ProductVideo {
  readonly block = input.required<ProductVideoBlockDto>();

  protected readonly presentation = computed(() => videoPresentation(this.block().url));

  /** Empty for the `none` case, which renders neither branch. */
  protected readonly videoSrc = computed(() => {
    const presentation = this.presentation();
    return presentation.kind === 'none' ? '' : presentation.url;
  });
}

/**
 * A nullable merchant string, or `null` when there is nothing in it.
 *
 * Whitespace counts as nothing: a caption of `"  "` must not reserve a row, and a label
 * of `" "` must not win over the file's own name.
 */
function nonBlank(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The file's own name, read from the end of its URL.
 *
 * The middle rung of the download label's fallback: better than "Download file" when the
 * merchant left the label blank, and read from the path rather than requested from the
 * server. Anything that does not yield a plain name - a directory URL, an undecodable
 * segment - answers `null` and the generic phrase is used instead.
 */
function fileName(url: string | null): string | null {
  if (url === null) {
    return null;
  }

  const path = url.split(/[?#]/)[0] ?? '';
  const last = path.split('/').pop() ?? '';

  try {
    return nonBlank(decodeURIComponent(last));
  } catch {
    return nonBlank(last);
  }
}
