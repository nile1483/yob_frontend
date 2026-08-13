import { Component, signal } from '@angular/core';

import { Alert } from '../app/design/alert/alert';
import { Button } from '../app/design/button/button';
import { EmptyState } from '../app/design/empty-state/empty-state';
import { Field } from '../app/design/field/field';
import { Spinner } from '../app/design/spinner/spinner';

/**
 * Development-only gallery of the design primitives.
 *
 * Exists so the primitives can be exercised in a real browser - focus rings, click
 * behaviour, wrapping at narrow widths - before any screen uses them. Lives in
 * `src/dev/` rather than `src/app/` because it is not part of the application
 * architecture, and is routed from the development and mock environment files only,
 * so production never imports it.
 *
 * Delete it, or let it grow alongside `design/`. Nothing depends on it.
 */
@Component({
  selector: 'app-design-gallery',
  imports: [Alert, Button, EmptyState, Field, Spinner],
  template: `
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-10 p-4">
      <h1 class="text-2xl font-semibold tracking-tight">Design gallery</h1>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Button</h2>

        <div class="flex flex-wrap items-center gap-3">
          <button yob-button data-testid="button-default" (click)="clicks.set(clicks() + 1)">
            Place order
          </button>

          <button
            yob-button
            data-testid="button-disabled"
            disabled
            (click)="clicks.set(clicks() + 1)"
          >
            Disabled
          </button>

          <button
            yob-button
            data-testid="button-loading"
            [loading]="true"
            (click)="clicks.set(clicks() + 1)"
          >
            Saving
          </button>

          <button yob-button data-testid="button-submit" type="submit">Submit type</button>
        </div>

        <p class="text-sm text-slate-600">
          Clicks: <span data-testid="click-count">{{ clicks() }}</span>
        </p>
      </section>

      <section class="flex flex-col gap-4">
        <h2 class="text-lg font-semibold">Field</h2>

        <app-field label="Email address" hint="We only use this to contact you">
          <input
            data-testid="field-plain-input"
            type="email"
            class="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </app-field>

        <app-field label="Password" [required]="true" error="Enter your password">
          <input
            data-testid="field-error-input"
            type="password"
            required
            class="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </app-field>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Alert</h2>
        <app-alert tone="error">We could not sign you in.</app-alert>
        <app-alert tone="success">Your changes were saved.</app-alert>
        <app-alert tone="info">Prices include tax.</app-alert>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Spinner</h2>
        <app-spinner />
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Empty state</h2>
        <app-empty-state>
          <h3 emptyTitle>No orders yet</h3>
          <p emptyBody>Orders you place will appear here.</p>
          <button yob-button emptyAction>Browse the catalog</button>
        </app-empty-state>
      </section>
    </div>
  `,
})
export class DesignGallery {
  protected readonly clicks = signal(0);
}
