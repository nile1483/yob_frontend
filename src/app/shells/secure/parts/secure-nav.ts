import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * Primary navigation for the authenticated storefront.
 *
 * A separate piece so the secure shell can move it - beside the brand, under the
 * header, into a sidebar - by relocating one element instead of rewriting markup.
 * That is the whole of the "layout flexibility" story: composition, not configuration.
 *
 * Links are listed literally. When a copied client does not need one, delete the
 * anchor; there is deliberately no enable/disable setting.
 *
 * `flex-wrap` is what keeps this usable on a narrow phone: the links wrap onto a
 * second line instead of overflowing the viewport.
 */
@Component({
  selector: 'app-secure-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav aria-label="Primary">
      <ul class="flex flex-wrap items-center gap-x-5 gap-y-1">
        <li>
          <a
            routerLink="/catalog"
            routerLinkActive="font-semibold text-slate-900"
            class="text-slate-600 underline-offset-4 hover:underline focus-visible:underline"
            >Catalog</a
          >
        </li>
        <li>
          <a
            routerLink="/account"
            routerLinkActive="font-semibold text-slate-900"
            class="text-slate-600 underline-offset-4 hover:underline focus-visible:underline"
            >Account</a
          >
        </li>
      </ul>
    </nav>
  `,
})
export class SecureNav {}
