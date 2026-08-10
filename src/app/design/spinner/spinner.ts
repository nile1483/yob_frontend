import { Component, input } from '@angular/core';

/**
 * A small loading indicator.
 *
 * Announces itself by default. Pass an empty `label` when something else already
 * describes the wait - a button that sets `aria-busy`, for instance - so a screen
 * reader is not told about the same pause twice.
 */
@Component({
  selector: 'app-spinner',
  host: { class: 'contents' },
  template: `
    <span
      [attr.role]="label() ? 'status' : null"
      [attr.aria-hidden]="label() ? null : 'true'"
      class="inline-flex items-center"
    >
      <svg
        class="size-4 animate-spin text-current"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" opacity="0.25" />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          stroke-width="4"
          stroke-linecap="round"
        />
      </svg>
      @if (label()) {
        <span class="sr-only">{{ label() }}</span>
      }
    </span>
  `,
})
export class Spinner {
  /** Accessible description of the wait. Empty makes the spinner decorative. */
  readonly label = input('Loading');
}
