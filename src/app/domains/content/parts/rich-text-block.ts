import { Component, computed, input } from '@angular/core';

import type { RichTextBlockDto } from '../contracts/page.types';

/**
 * Merchant prose.
 *
 * ## Sanitised twice, on purpose
 *
 * The backend sanitises on save - its own comment calls that "the first boundary, not a
 * licence to bypass the second". So this renders through Angular's ordinary
 * `[innerHTML]`, which runs the DOM sanitiser: scripts are stripped, inline event
 * handlers are removed, and `javascript:` URLs are neutralised.
 *
 * **There is deliberately no `bypassSecurityTrustHtml` here.** Content originating in
 * Frappe is still content someone typed, and a stored-XSS in an admin field would
 * otherwise execute in every buyer's session. The one place trust could be granted is
 * this file, and it does not grant it.
 *
 * ## Alignment is a mapping, not a class name
 *
 * `text_alignment` arrives as a two-value enum and is looked up in a fixed table. The
 * backend cannot name a Tailwind class, because nothing here concatenates its value into
 * one - an unknown value falls back to left rather than reaching the DOM.
 */
@Component({
  selector: 'app-rich-text-block',
  imports: [],
  template: `
    <section
      class="prose-content"
      [class]="alignmentClass()"
      data-testid="block-rich-text"
      [attr.data-block-name]="block().block_name"
      [attr.data-alignment]="block().text_alignment"
    >
      @if (block().title; as title) {
        <h2 class="text-xl font-semibold tracking-tight text-slate-900" data-testid="rich-text-title">
          {{ title }}
        </h2>
      }

      <!-- Angular's sanitiser runs on this binding. Nothing marks it trusted. -->
      <div class="mt-2 text-slate-700 [&_a]:underline [&_p]:my-2" [innerHTML]="block().html" data-testid="rich-text-body"></div>
    </section>
  `,
})
export class RichTextBlock {
  readonly block = input.required<RichTextBlockDto>();

  protected readonly alignmentClass = computed(
    () => ALIGNMENT[this.block().text_alignment] ?? ALIGNMENT['left'] ?? '',
  );
}

/** The documented enum, and nothing else, mapped to classes this repository owns. */
const ALIGNMENT: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
};
