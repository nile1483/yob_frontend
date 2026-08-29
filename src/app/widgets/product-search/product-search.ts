import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { Media } from '../../design/media/media';
import { CatalogApi } from '../../domains/catalog/data/catalog.api';
import {
  PRODUCT_SUGGESTION_MIN_CHARS,
  type ProductSuggestionDto,
} from '../../domains/catalog/contracts/catalog.types';
import { RecentProductsStore } from './recent-products.store';

/** Long enough that a typist is not queried per keystroke, short enough to feel instant. */
const DEBOUNCE_MS = 250;

/** What the panel is currently showing. */
type PanelMode = 'recent' | 'results' | 'empty' | 'failed';

/**
 * The header's product typeahead.
 *
 * ## Navigation, not search
 *
 * There is no results page, and **Enter does nothing** - deliberately, and tested. A
 * buyer reaches a product by choosing one, and the dropdown is the whole feature. The
 * input is therefore not inside a `<form>`, and the keydown handler stops the browser
 * from treating Enter as a submission in any host that later wraps one around it.
 *
 * ## Three characters, then a debounce
 *
 * One and two characters query nothing at all: the backend answers an empty list for
 * them anyway, so asking would be a request that can only return nothing. The floor and
 * the debounce together mean a buyer typing "bolt" costs one request, not four.
 *
 * ## The stale-response rule
 *
 * `switchMap` **cancels** the in-flight request when a newer term arrives, so a slow
 * answer for `bol` can never paint over a fast answer for `bolt`. That is the entire
 * protection, and it is why this is an observable pipeline rather than hand-rolled
 * promise state with a generation counter to get wrong.
 *
 * ## Failure is quiet
 *
 * A typeahead is supplemental. If the request fails the panel says so in one restrained
 * line, the input keeps working, and nothing retries - a header that broke because a
 * dropdown could not load would be a far worse outcome than the missing dropdown.
 */
@Component({
  selector: 'yob-product-search',
  imports: [Media, RouterLink],
  host: {
    class: 'relative block w-full',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'close()',
  },
  template: `
    <!-- Deliberately not a <form>: there is nothing to submit, and a form would give
         Enter a default action this feature must not have. -->
    <div class="relative">
      <input
        #input
        type="search"
        autocomplete="off"
        [value]="query()"
        (input)="onInput($event)"
        (focus)="open()"
        (keydown.enter)="onEnter($event)"
        class="min-h-11 w-full rounded-md border border-slate-300 bg-white py-2 ps-3 pe-9
               text-base text-slate-900 placeholder:text-slate-500 sm:text-sm"
        placeholder="Search products"
        i18n-placeholder="@@search.placeholder"
        aria-label="Search products"
        i18n-aria-label="@@search.label"
        role="combobox"
        aria-autocomplete="list"
        [attr.aria-expanded]="isOpen()"
        aria-controls="product-search-panel"
        data-testid="product-search-input"
      />

      @if (isLoading()) {
        <span
          class="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-slate-500"
          aria-hidden="true"
          data-testid="product-search-loading"
          >…</span
        >
      }
    </div>

    @if (isOpen() && mode(); as panel) {
      <div
        id="product-search-panel"
        class="yob-layer-popover absolute inset-x-0 top-full mt-1 max-h-80 overflow-y-auto
               rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        role="listbox"
        [attr.aria-label]="panelLabel"
        data-testid="product-search-panel"
        [attr.data-panel-mode]="panel"
      >
        @if (panel === 'recent') {
          <p class="px-3 py-1.5 text-xs font-medium text-slate-500" data-testid="recent-heading">
            <ng-container i18n="@@search.recent">Recently viewed</ng-container>
          </p>
        }

        @if (panel === 'empty') {
          <p class="px-3 py-2 text-sm text-slate-600" data-testid="product-search-empty">
            <ng-container i18n="@@search.empty">No products found</ng-container>
          </p>
        } @else if (panel === 'failed') {
          <!-- One restrained line. Nothing from the server reaches the buyer, and
               nothing retries. -->
          <p class="px-3 py-2 text-sm text-slate-600" data-testid="product-search-failed">
            <ng-container i18n="@@search.failed">Suggestions are unavailable</ng-container>
          </p>
        } @else {
          @for (product of shown(); track product.item_code) {
            <!-- The row and its remove control are SIBLINGS. A button inside an anchor is
                 invalid, and nesting one is how a "remove" ends up navigating: as
                 siblings there is no propagation path to suppress in the first place. -->
            <div class="flex items-center hover:bg-slate-50">
              <a
                [routerLink]="['/catalog', 'item', product.slug]"
                (click)="onChoose(product)"
                class="flex min-w-0 flex-1 items-center gap-3 px-3 py-2"
                role="option"
                [attr.aria-selected]="false"
                data-testid="product-suggestion"
                [attr.data-item-code]="product.item_code"
                [attr.data-is-template]="product.is_template"
              >
                <app-media
                  class="w-10 shrink-0 overflow-hidden rounded"
                  [src]="product.image"
                  alt=""
                  ratio="square"
                  testId="suggestion-media"
                />

                <span class="min-w-0">
                  <span class="block truncate text-sm text-slate-900" data-testid="suggestion-name">{{
                    product.item_name
                  }}</span>
                  <!-- A B2B buyer often searches by code, so the code they matched on is
                       visible - quietly, because the name is what identifies the product. -->
                  <span class="block truncate text-xs text-slate-500" data-testid="suggestion-code">{{
                    product.item_code
                  }}</span>
                </span>
              </a>

              @if (panel === 'recent') {
                <!-- Recent rows only. A server suggestion is not the buyer's list, so
                     there is nothing there to remove. -->
                <button
                  type="button"
                  class="me-1 flex size-9 shrink-0 items-center justify-center rounded-md
                         text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  [attr.aria-label]="removeLabel(product)"
                  (click)="onRemove(product, $event)"
                  data-testid="recent-remove"
                  [attr.data-item-code]="product.item_code"
                >
                  <span aria-hidden="true">&#10005;</span>
                </button>
              }
            </div>
          }
        }
      </div>
    }
  `,
})
export class ProductSearch {
  private readonly api = inject(CatalogApi);
  private readonly recent = inject(RecentProductsStore);
  private readonly router = inject(Router);
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly panelLabel = $localize`:@@search.panel:Product suggestions`;

  private readonly querySignal = signal('');
  protected readonly query = this.querySignal.asReadonly();

  private readonly openSignal = signal(false);
  protected readonly isOpen = this.openSignal.asReadonly();

  /** Trimmed and collapsed once, so "  hex  bolt " and "hex bolt" are one query. */
  private readonly term = computed(() => this.querySignal().trim().replace(/\s+/g, ' '));

  /** Whether the typed term has earned a request. */
  private readonly searchable = computed(() => this.term().length >= PRODUCT_SUGGESTION_MIN_CHARS);

  private readonly loadingSignal = signal(false);
  protected readonly isLoading = this.loadingSignal.asReadonly();

  /**
   * The server's answer for the current term.
   *
   * `switchMap` is the stale-response protection: a newer term unsubscribes the older
   * request, so its response can never arrive late and overwrite a fresher one.
   */
  private readonly response = toSignal(
    toObservable(this.term).pipe(
      distinctUntilChanged(),
      debounceTime(DEBOUNCE_MS),
      switchMap((term) => {
        if (term.length < PRODUCT_SUGGESTION_MIN_CHARS) {
          this.loadingSignal.set(false);
          return of({ items: [] as readonly ProductSuggestionDto[], failed: false });
        }

        this.loadingSignal.set(true);
        return this.api.getProductSuggestions(term).pipe(
          map((result) => ({ items: result.items, failed: false })),
          catchError(() => of({ items: [] as readonly ProductSuggestionDto[], failed: true })),
        );
      }),
      map((result) => {
        this.loadingSignal.set(false);
        return result;
      }),
    ),
    { initialValue: { items: [] as readonly ProductSuggestionDto[], failed: false } },
  );

  /**
   * What the panel shows, or `null` when it should not be there at all.
   *
   * Under the threshold a buyer sees what they were recently looking at; at or over it
   * they see the server's answer and **never** the recent list, because a recent product
   * shown under a live query reads as a match for it.
   */
  protected readonly mode = computed<PanelMode | null>(() => {
    if (this.searchable()) {
      if (this.response().failed) {
        return 'failed';
      }
      if (this.isLoading()) {
        return this.response().items.length > 0 ? 'results' : null;
      }
      return this.response().items.length > 0 ? 'results' : 'empty';
    }

    return this.recent.products().length > 0 ? 'recent' : null;
  });

  /** The rows themselves: the server's, or this buyer's recent products. */
  protected readonly shown = computed<readonly ProductSuggestionDto[]>(() =>
    this.searchable() ? this.response().items : this.recent.products(),
  );

  constructor() {
    // Selecting a suggestion navigates, and the next page must not inherit a dropdown or
    // a stale term. Closing on navigation covers every other way a route can change too.
    const subscription = this.router.events.subscribe(() => this.reset());
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  protected onInput(event: Event): void {
    this.querySignal.set((event.target as HTMLInputElement).value);
    this.openSignal.set(true);
  }

  protected open(): void {
    this.openSignal.set(true);
  }

  protected close(): void {
    this.openSignal.set(false);
  }

  /**
   * Enter does nothing. That is the requirement, not an oversight.
   *
   * There is no search-results page, no `/search` route and no "open the first result"
   * behaviour - a buyer chooses a product or they do not. The default is prevented so
   * that Enter cannot submit a form a future host might wrap around this input.
   */
  protected onEnter(event: Event): void {
    event.preventDefault();
  }

  /** A chosen product is remembered, then the header returns to rest. */
  protected onChoose(product: ProductSuggestionDto): void {
    this.recent.remember(product);
    this.reset();
  }

  /** An accessible name that says which product is being removed, not just "remove". */
  protected removeLabel(product: ProductSuggestionDto): string {
    return $localize`:@@search.recent.remove:Remove ${product.item_name}:product: from recent products`;
  }

  /**
   * Drop one product from this buyer's list.
   *
   * The panel deliberately stays open: removing an entry is housekeeping, and closing the
   * dropdown after each one would make clearing two products a four-gesture job. The
   * default is prevented because the control sits inside a listbox row - nothing should
   * treat it as choosing that row.
   */
  protected onRemove(product: ProductSuggestionDto, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.recent.forget(product.item_code);
  }

  private reset(): void {
    this.openSignal.set(false);
    this.querySignal.set('');
    const element = this.input()?.nativeElement;
    if (element) {
      element.value = '';
    }
  }

  /** A click anywhere else closes the panel - the ordinary expectation for a dropdown. */
  protected onDocumentClick(event: Event): void {
    if (!this.openSignal()) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && !this.host.nativeElement.contains(target)) {
      this.close();
    }
  }
}
