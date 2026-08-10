import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { sanitizeReturnUrl } from '../../../foundation/session/return-url';

/**
 * Placeholder for the sign-in page.
 *
 * Phase 5 only proves the route exists, is reachable without a session, and receives
 * the return URL. The real form, validation and submit flow arrive with the access
 * domain in Phase 7.
 *
 * It already validates the incoming return URL rather than displaying it raw, so the
 * value shown can never be an attacker-supplied external address.
 */
@Component({
  selector: 'app-login-page',
  template: `
    <h1 class="text-2xl font-semibold tracking-tight">Sign in</h1>
    <p class="mt-2 text-slate-600">The sign-in form arrives in a later phase.</p>

    @if (returnUrl) {
      <p class="mt-4 text-sm text-slate-600">
        After signing in you will return to
        <code class="rounded bg-slate-100 px-1 py-0.5">{{ returnUrl }}</code>
      </p>
    }
  `,
})
export class LoginPage {
  /** Validated: a hostile `returnUrl` is discarded rather than rendered or followed. */
  protected readonly returnUrl = sanitizeReturnUrl(
    inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl'),
  );
}
