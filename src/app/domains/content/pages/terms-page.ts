import { Component } from '@angular/core';

/**
 * Static legal content.
 *
 * The API exposes no page-content endpoints, so per the build plan this stays local
 * Angular content until a backend contract exists for it.
 */
@Component({
  selector: 'app-terms-page',
  template: `
    <h1 class="text-2xl font-semibold tracking-tight">Terms</h1>
    <p class="mt-2 text-slate-600">Placeholder for terms and conditions.</p>
  `,
})
export class TermsPage {}
