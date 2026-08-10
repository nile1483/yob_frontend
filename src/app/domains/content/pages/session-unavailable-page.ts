import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import {
  DEFAULT_AUTHENTICATED_PATH,
  LOGIN_PATH,
  RETURN_URL_PARAM,
  sanitizeReturnUrl,
} from '../../../foundation/session/return-url';
import { SessionStore } from '../../../foundation/session/session.store';

/**
 * Shown when the session could not be established at all - a backend outage, a
 * timeout, or a proxy misconfiguration answering `application_access_denied`.
 *
 * Deliberately not the sign-in page. The user's credentials are not the problem, and
 * telling them to sign in again would be both untrue and useless, since the next
 * restore fails identically.
 *
 * Retrying calls the same `restore()` the app initializer used; there is no second
 * recovery path to keep in step. Whatever the user was trying to reach is carried in
 * `returnUrl` so a successful retry continues the journey instead of dumping them on
 * a landing page.
 */
@Component({
  selector: 'app-session-unavailable-page',
  template: `
    <h1 class="text-2xl font-semibold tracking-tight">We could not reach your account</h1>
    <p class="mt-2 text-slate-600">
      {{ session.restoreError()?.detail ?? 'The service is temporarily unavailable.' }}
    </p>
    <p class="mt-4">
      <button
        type="button"
        (click)="retry()"
        [disabled]="retrying()"
        class="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-50"
      >
        Try again
      </button>
    </p>
  `,
})
export class SessionUnavailablePage {
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  /**
   * Validated once, on arrival. The query parameter is attacker-supplied even here -
   * a link to `/session-unavailable?returnUrl=https://phish.example` is as easy to
   * send as one pointing at the sign-in page - so it goes through the same check.
   * `null` means no usable destination was requested.
   */
  private readonly returnUrl = sanitizeReturnUrl(
    inject(ActivatedRoute).snapshot.queryParamMap.get(RETURN_URL_PARAM),
  );

  protected readonly retrying = signal(false);

  protected retry(): void {
    this.retrying.set(true);

    this.session.restore().subscribe((status) => {
      this.retrying.set(false);

      if (status === 'authenticated') {
        void this.router.navigateByUrl(this.returnUrl ?? DEFAULT_AUTHENTICATED_PATH);
        return;
      }

      if (status === 'guest') {
        // The session resolved, just not to a signed-in one. Hand the destination on
        // so signing in still finishes the original journey.
        void this.router.navigate([LOGIN_PATH], {
          queryParams: this.returnUrl === null ? {} : { [RETURN_URL_PARAM]: this.returnUrl },
        });
        return;
      }

      // Still unresolved: stay here with the refreshed error rather than bouncing the
      // user somewhere that cannot work either.
    });
  }
}
