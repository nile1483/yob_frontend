import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Alert } from '../../../design/alert/alert';
import { Button } from '../../../design/button/button';
import { Field } from '../../../design/field/field';
import { normalizeYobFailure, type YobApiError } from '../../../foundation/network/yob-api-error';
import {
  DEFAULT_AUTHENTICATED_PATH,
  RETURN_URL_PARAM,
  sanitizeReturnUrl,
} from '../../../foundation/session/return-url';
import { SessionStore } from '../../../foundation/session/session.store';
import { loginErrorMessage } from '../login-error-message';

interface Credentials {
  username: string;
  password: string;
}

/**
 * Password sign-in.
 *
 * The page owns presentation and the user's journey; it owns no authentication
 * mechanics. It calls `SessionStore.signInWithPassword` and nothing else - no
 * `HttpClient`, no `AuthApi`, no `YobApiClient`, no knowledge of Frappe, CSRF or the
 * `application` code. Whether the response came from the real edge or the in-browser
 * mock is equally invisible here.
 *
 * Built on Signal Forms (`@angular/forms/signals`, `@publicApi 22.0`) with plain
 * native inputs inside the existing `app-field` structure, so the controls stay
 * ordinary HTML.
 */
@Component({
  selector: 'app-login-page',
  imports: [Alert, Button, Field, FormField],
  template: `
    <div class="mx-auto w-full max-w-sm">
      <h1 class="text-2xl font-semibold tracking-tight" i18n="@@login.heading">Sign in</h1>
      <p class="mt-2 text-slate-600" i18n="@@login.intro">
        Enter your details to continue to your account.
      </p>

      @if (errorMessage(); as message) {
        <div class="mt-6">
          <app-alert tone="error">{{ message }}</app-alert>
        </div>
      }

      <form class="mt-6 flex flex-col gap-5" (submit)="onSubmit($event)" novalidate>
        <app-field
          label="Username"
          i18n-label="@@login.username.label"
          [required]="true"
          [error]="usernameError()"
        >
          <input
            [formField]="loginForm.username"
            type="text"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            data-testid="login-username"
            class="w-full rounded-md border border-slate-300 px-3 py-2 text-base
                   sm:text-sm"
          />
        </app-field>

        <app-field
          label="Password"
          i18n-label="@@login.password.label"
          [required]="true"
          [error]="passwordError()"
        >
          <input
            [formField]="loginForm.password"
            type="password"
            autocomplete="current-password"
            data-testid="login-password"
            class="w-full rounded-md border border-slate-300 px-3 py-2 text-base
                   sm:text-sm"
          />
        </app-field>

        <button
          yob-button
          type="submit"
          [loading]="submitting()"
          data-testid="login-submit"
          class="w-full"
          i18n="@@login.submit"
        >
          Sign in
        </button>
      </form>
    </div>
  `,
})
export class LoginPage {
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  /**
   * Where to go after signing in.
   *
   * Read once and validated immediately: the parameter is attacker-supplied, so a
   * link to `…/login?returnUrl=https://phish.example` must never become a
   * destination. `null` means none was requested and the default applies.
   */
  private readonly returnUrl = sanitizeReturnUrl(
    inject(ActivatedRoute).snapshot.queryParamMap.get(RETURN_URL_PARAM),
  );

  private readonly credentials = signal<Credentials>({ username: '', password: '' });

  protected readonly loginForm = form(this.credentials, (path) => {
    // Both fields are required and nothing more. The backend takes a username or
    // other identifier, not a guaranteed email, so an email-shaped rule here would
    // reject valid accounts. Password rules belong to whatever issues the password.
    required(path.username, {
      message: $localize`:@@login.username.required:Enter your username.`,
    });
    required(path.password, {
      message: $localize`:@@login.password.required:Enter your password.`,
    });
  });

  /** Driven by Signal Forms, so a second submit cannot start while one is running. */
  protected readonly submitting = this.loginForm().submitting;

  protected readonly errorMessage = signal<string | null>(null);

  /**
   * The normalized failure behind {@link errorMessage}.
   *
   * Kept for diagnosis and tests. Never rendered - its `detail` is the backend's
   * wording, which is not always right for this screen.
   */
  protected readonly lastError = signal<YobApiError | null>(null);

  protected readonly usernameError = computed(() => this.firstError(this.loginForm.username()));
  protected readonly passwordError = computed(() => this.firstError(this.loginForm.password()));

  constructor() {
    // A signed-in visitor has no business seeing a sign-in form. `/login` is public
    // and unguarded, so leaving cannot bounce back here.
    if (this.session.isAuthenticated()) {
      void this.goToDestination();
    }
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();

    this.errorMessage.set(null);
    this.lastError.set(null);

    // `submit()` validates, marks fields touched, and holds `submitting` for the
    // duration - so duplicate-submit prevention is the framework's job, not a flag
    // of ours that could drift out of step with the request.
    await submit(this.loginForm, {
      action: async () => {
        try {
          await firstValueFrom(this.session.signInWithPassword(this.credentials()));
        } catch (failure: unknown) {
          const error = normalizeYobFailure(failure);
          this.lastError.set(error);
          this.errorMessage.set(loginErrorMessage(error));
          return undefined;
        }

        // Drop the password as soon as it is no longer needed. It was never written
        // anywhere else - no localStorage, no sessionStorage, no cookie.
        this.credentials.set({ username: '', password: '' });

        await this.goToDestination();
        return undefined;
      },
    });
  }

  /** The validated return URL, or the application's normal landing page. */
  private goToDestination(): Promise<boolean> {
    return this.router.navigateByUrl(this.returnUrl ?? DEFAULT_AUTHENTICATED_PATH);
  }

  /** Only show a validation message once the user has actually touched the field. */
  private firstError(state: {
    touched: () => boolean;
    errors: () => readonly { message?: string }[];
  }): string {
    if (!state.touched()) {
      return '';
    }
    return state.errors()[0]?.message ?? '';
  }
}
