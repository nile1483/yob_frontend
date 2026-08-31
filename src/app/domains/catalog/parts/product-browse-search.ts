import { Component, input, output, signal } from '@angular/core';

import { Button } from '../../../design/button/button';

/**
 * The `/products` search box: type, then submit.
 *
 * ```html
 * <app-product-browse-search [active]="search()" (submitted)="applySearch($event)" />
 * ```
 *
 * ## Deliberately not the header typeahead
 *
 * The Phase 26 header search suggests products as you type: three characters, a 250ms
 * debounce, a cancelled request per keystroke, a dropdown. This one does none of that,
 * and the difference is the point rather than an omission.
 *
 * The header search is **navigation** - it finds one product and opens it, so it has to
 * answer while the buyer is still typing. This is a **listing filter**: it narrows a
 * catalogue browse that already has a category, a facet selection, a sort and a cursor
 * bound to it. Re-running that per keystroke would issue a paged, priced listing request
 * for every letter, and each one would reset the buyer's pagination.
 *
 * So typing mutates local state only. Nothing leaves this component until the buyer
 * presses Search or Enter, and there is no suggestion request from this page at all.
 *
 * ## Draft and active are different things
 *
 * The text in the box is a draft. The listing's search is what was last submitted. They
 * are allowed to disagree - that is what "unsubmitted typing" means - and only
 * {@link submitted} moves one to the other.
 *
 * Submitting an empty box emits `''`, which clears the active search rather than doing
 * nothing: erasing the text and pressing Search is how a buyer removes it.
 */
@Component({
  selector: 'app-product-browse-search',
  imports: [Button],
  template: `
    <!-- A real form, so Enter submits without a keydown handler: the browser's own
         submit behaviour is the one buyers already expect, and it costs no JavaScript. -->
    <form class="flex items-end gap-2" (submit)="onSubmit($event)" data-testid="browse-search">
      <div class="flex-1">
        <label class="block text-sm font-medium text-slate-900" [attr.for]="inputId">
          {{ label }}
        </label>
        <input
          [id]="inputId"
          type="search"
          autocomplete="off"
          [value]="draft()"
          (input)="onInput($event)"
          [placeholder]="label"
          class="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-500 sm:text-sm"
          data-testid="browse-search-input"
        />
      </div>

      <button yob-button variant="secondary" type="submit" data-testid="browse-search-submit">
        {{ submitLabel }}
      </button>
    </form>
  `,
})
export class ProductBrowseSearch {
  /**
   * The search currently applied to the listing.
   *
   * Used to seed the box, not to drive it: once the buyer starts typing, the draft is
   * theirs until they submit.
   */
  readonly active = input('');

  /** The trimmed text the buyer submitted. `''` means "clear the search". */
  readonly submitted = output<string>();

  protected readonly label = $localize`:@@products.search.label:Search item name or item code`;
  protected readonly submitLabel = $localize`:@@products.search.submit:Search`;
  protected readonly inputId = 'products-browse-search';

  /** What is in the box. Local until submitted, and never a request of its own. */
  protected readonly draft = signal('');

  constructor() {
    // Seeded once from whatever search the page starts with. Not a `linkedSignal` on
    // `active`: the page sets `active` FROM this component's own submission, so tracking
    // it would overwrite the buyer's draft with the value they just sent.
    this.draft.set(this.active());
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    // Trimmed here so " bolt " and "bolt" are one search rather than two cursors. An
    // all-whitespace box submits as empty, which clears.
    this.submitted.emit(this.draft().trim());
  }
}
