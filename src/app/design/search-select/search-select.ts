import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

/** One selectable option. Deliberately not an address, a country or anything else. */
export interface SearchSelectOption {
  /** The value written to the model, verbatim. */
  readonly value: string;
  /** What a person reads and searches. Defaults to the value. */
  readonly label?: string;
  /** Optional secondary text - a code, a hint - shown beside the label. */
  readonly hint?: string;
}

let nextId = 0;

/**
 * A searchable single-select, usable with Signal Forms.
 *
 * ```html
 * <app-search-select [formField]="form.state" [options]="states()" placeholder="Select a state" />
 * ```
 *
 * ## Why `FormValueControl` and not `ControlValueAccessor`
 *
 * `ControlValueAccessor` is the integration point for **Reactive Forms**, which this
 * project does not use: every form in the storefront is a Signal Form, bound with
 * `[formField]`. Angular's equivalent contract for that world is `FormValueControl` - a
 * component exposing a `model()` named `value`, plus optional `disabled`, `invalid`,
 * `required` and `name` inputs the `Field` directive fills in automatically.
 *
 * Implementing it means this component binds exactly like the native `<input>`s beside
 * it, with no adapter and no second forms API in the bundle. It still works standalone
 * via plain `[(value)]` for callers with no form at all.
 *
 * ## Generic on purpose
 *
 * It knows nothing about addresses. Options are `{value, label?, hint?}`, so the same
 * component can later serve item pickers, currency selectors or anything else with a
 * list too long to scroll comfortably.
 *
 * ## Behaviour
 *
 * A button that opens a filtered listbox. Native `<select>` cannot be searched and
 * cannot show a hint column; a text input with a datalist cannot constrain the value.
 * So this is a real combobox, wired to the ARIA pattern: `role="combobox"` with
 * `aria-expanded` and `aria-controls` on the trigger, `role="listbox"` on the panel,
 * `aria-selected` on options, and `aria-activedescendant` pointing at the highlighted
 * option so a screen reader follows arrow keys without focus leaving the search box.
 *
 * Keyboard: Up/Down move, Enter selects, Escape closes and returns focus to the trigger,
 * Home/End jump. Pointer: click to select, click outside to close. Nothing is selected
 * by merely highlighting - only Enter or a click commits, so arrowing past an option
 * never changes the stored value.
 */
@Component({
  selector: 'app-search-select',
  host: {
    class: 'relative block',
    '(keydown.escape)': 'close(true)',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      role="combobox"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? panelId : null"
      aria-haspopup="listbox"
      [attr.aria-label]="ariaLabel() || null"
      [disabled]="disabled()"
      [class]="triggerClass()"
      (click)="toggle()"
      (keydown)="onTriggerKeydown($event)"
      [attr.data-testid]="testId()"
    >
      <span [class]="selectedLabel() ? 'truncate' : 'truncate text-slate-500'">
        {{ selectedLabel() || placeholder() }}
      </span>
      <!-- Decorative: the combobox role already announces what this control is. -->
      <svg
        class="size-4 shrink-0 text-slate-500"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path d="m6 8 4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    @if (open()) {
      <!-- z-20 keeps the panel above the bordered cards and summary panels it opens
           inside; absolute positioning keeps it out of the form's flow so opening it
           never reflows the fields below. -->
      <div
        class="absolute z-20 mt-1 flex w-full flex-col rounded-md border border-slate-300
               bg-white shadow-lg"
      >
        <div class="border-b border-slate-200 p-2">
          <input
            #search
            type="text"
            role="searchbox"
            [value]="query()"
            (input)="onQuery($event)"
            (keydown)="onSearchKeydown($event)"
            [attr.aria-controls]="panelId"
            [attr.aria-activedescendant]="activeId()"
            [placeholder]="searchPlaceholder()"
            class="w-full rounded-md border border-slate-300 px-3 py-2 text-base sm:text-sm"
            autocomplete="off"
            spellcheck="false"
            [attr.data-testid]="testId() ? testId() + '-search' : null"
          />
        </div>

        <ul
          [id]="panelId"
          role="listbox"
          [attr.aria-label]="ariaLabel() || null"
          class="max-h-60 overflow-y-auto overscroll-contain py-1"
          [attr.data-testid]="testId() ? testId() + '-listbox' : null"
        >
          @for (option of filtered(); track option.value; let i = $index) {
            <li
              [id]="optionId(i)"
              role="option"
              [attr.aria-selected]="option.value === value()"
              class="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm"
              [class.bg-slate-100]="i === active()"
              [class.font-medium]="option.value === value()"
              (pointerdown)="$event.preventDefault()"
              (click)="choose(option)"
              (pointerenter)="active.set(i)"
              [attr.data-testid]="testId() ? testId() + '-option' : null"
            >
              <span class="truncate">{{ option.label ?? option.value }}</span>
              @if (option.hint) {
                <span class="shrink-0 text-xs text-slate-500">{{ option.hint }}</span>
              }
            </li>
          } @empty {
            <li
              class="px-3 py-3 text-sm text-slate-600"
              [attr.data-testid]="testId() ? testId() + '-empty' : null"
            >
              {{ emptyText() }}
            </li>
          }
        </ul>
      </div>
    }
  `,
})
export class SearchSelect implements FormValueControl<string> {
  /** The selected value. Kept in sync by the `Field` directive when bound. */
  readonly value = model<string>('');

  readonly options = input.required<readonly SearchSelectOption[]>();

  /** Filled in automatically by `[formField]`; settable directly when unbound. */
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly required = input(false);
  readonly name = input('');

  readonly placeholder = input($localize`:@@searchSelect.placeholder:Select an option`);
  readonly searchPlaceholder = input($localize`:@@searchSelect.search:Search`);
  readonly emptyText = input($localize`:@@searchSelect.empty:No matches`);
  /** Names the control for assistive technology when no visible label is associated. */
  readonly ariaLabel = input('');
  readonly testId = input('');

  protected readonly panelId = `yob-select-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);

  private readonly triggerRef = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly searchRef = viewChild<ElementRef<HTMLInputElement>>('search');

  constructor() {
    // Focus follows the panel: opening moves focus into the search box so typing filters
    // immediately, which is the whole reason for a searchable select.
    effect(() => {
      if (this.open()) {
        this.searchRef()?.nativeElement.focus();
      }
    });
  }

  protected readonly selectedLabel = computed(() => {
    const current = this.value();
    const match = this.options().find((o) => o.value === current);
    return match ? (match.label ?? match.value) : (current ?? '');
  });

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (q === '') {
      return this.options();
    }
    // Case-insensitive on both label and hint, so a state can be found by its GST code
    // as readily as by its name.
    return this.options().filter((o) =>
      `${o.label ?? o.value} ${o.hint ?? ''}`.toLowerCase().includes(q),
    );
  });

  protected readonly activeId = computed(() =>
    this.open() && this.filtered().length > 0 ? this.optionId(this.active()) : null,
  );

  protected readonly triggerClass = computed(() => {
    const border = this.invalid() ? 'border-red-500' : 'border-slate-300';
    return `flex w-full items-center justify-between gap-2 rounded-md border ${border}
            bg-white px-3 py-2 text-left text-base sm:text-sm
            disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`;
  });

  protected optionId(index: number): string {
    return `${this.panelId}-option-${index}`;
  }

  protected toggle(): void {
    this.open() ? this.close(true) : this.openPanel();
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key) && !this.open()) {
      event.preventDefault();
      this.openPanel();
    }
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    const last = this.filtered().length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.active.update((i) => (i >= last ? 0 : i + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.update((i) => (i <= 0 ? last : i - 1));
        break;
      case 'Home':
        event.preventDefault();
        this.active.set(0);
        break;
      case 'End':
        event.preventDefault();
        this.active.set(Math.max(last, 0));
        break;
      case 'Enter': {
        event.preventDefault();
        // Only Enter commits. Highlighting alone never changes the stored value, so
        // arrowing past an option cannot silently rewrite the address.
        const option = this.filtered()[this.active()];
        if (option) {
          this.choose(option);
        }
        break;
      }
      case 'Tab':
        this.close(false);
        break;
      default:
        break;
    }
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }

  protected choose(option: SearchSelectOption): void {
    this.value.set(option.value);
    this.close(true);
  }

  protected close(restoreFocus: boolean): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.query.set('');
    if (restoreFocus) {
      this.triggerRef().nativeElement.focus();
    }
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    if (!this.open()) {
      return;
    }
    const host = this.triggerRef().nativeElement.closest('app-search-select');
    if (host && !host.contains(event.target as Node)) {
      this.close(false);
    }
  }

  private openPanel(): void {
    if (this.disabled()) {
      return;
    }
    this.query.set('');
    const current = this.options().findIndex((o) => o.value === this.value());
    this.active.set(current >= 0 ? current : 0);
    this.open.set(true);
  }
}
