import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Rendered inside the public shell so an unknown URL still has page structure. */
@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  template: `
    <h1 class="text-2xl font-semibold tracking-tight">Page not found</h1>
    <p class="mt-2 text-slate-600">That address does not exist.</p>
    <p class="mt-4">
      <a routerLink="/catalog" class="underline underline-offset-4">Go to the catalog</a>
    </p>
  `,
})
export class NotFoundPage {}
