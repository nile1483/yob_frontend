import { Component, input } from '@angular/core';

/**
 * The title block every routed page opens with.
 *
 * ```html
 * <app-page-header heading="Your orders" lead="Everything you have ordered so far.">
 *   <button yob-button pageAction type="button">Add address</button>
 * </app-page-header>
 * ```
 *
 * ## Why this is a primitive and the card containers are not
 *
 * Eleven pages had hand-written `text-2xl font-semibold tracking-tight`, most followed
 * by `mt-2 text-slate-600`, each with its own top margin. That is not eleven design
 * decisions, it is one decision copied eleven times - and it had already drifted, so
 * pages did not start at the same height or share a type scale.
 *
 * The rule this follows: extract what is genuinely identical everywhere, and leave what
 * legitimately differs in the page. Page openings are identical. Card containers,
 * summary panels and list rows are not, and wrapping them in primitives would only
 * force pages to fight the abstraction.
 *
 * The `<h1>` lives here, so every page has exactly one and the document outline is
 * right by construction rather than by review.
 *
 * Optional actions project into the header row via the `pageAction` attribute, so
 * "Add address" sits beside the title instead of every page inventing its own
 * title-plus-button flex row.
 */
@Component({
  selector: 'app-page-header',
  // Block rather than the default inline: an inline host makes the page's first element
  // participate in text layout, which is never what a title block wants.
  host: { class: 'block' },
  template: `
    <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight break-words sm:text-3xl">
          {{ heading() }}
        </h1>

        @if (lead()) {
          <p class="mt-2 max-w-prose text-slate-600">{{ lead() }}</p>
        }
      </div>

      <div class="flex shrink-0 flex-wrap gap-2">
        <ng-content select="[pageAction]" />
      </div>
    </div>

    <ng-content />
  `,
})
export class PageHeader {
  readonly heading = input.required<string>();

  /** One sentence of context. Omit it rather than writing filler. */
  readonly lead = input('');
}
