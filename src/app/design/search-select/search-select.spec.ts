import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';

import { SearchSelect, type SearchSelectOption } from './search-select';

const OPTIONS: readonly SearchSelectOption[] = [
  { value: 'Gujarat', label: 'Gujarat', hint: '24' },
  { value: 'Goa', label: 'Goa', hint: '30' },
  { value: 'Kerala', label: 'Kerala', hint: '32' },
  { value: 'Ladakh', label: 'Ladakh', hint: '38' },
];

@Component({
  imports: [SearchSelect],
  template: `
    <app-search-select
      [(value)]="picked"
      [options]="options()"
      [disabled]="disabled()"
      testId="sel"
    />
  `,
})
class StandaloneHost {
  readonly picked = signal('');
  readonly options = signal<readonly SearchSelectOption[]>(OPTIONS);
  readonly disabled = signal(false);
}

/** Bound through Signal Forms, which is how the address form uses it. */
@Component({
  imports: [SearchSelect, FormField],
  template: `<app-search-select [formField]="f.state" [options]="options" testId="sel" />`,
})
class FormHost {
  readonly options = OPTIONS;
  readonly model = signal({ state: '' });
  readonly f = form(this.model, (path) => {
    required(path.state, { message: 'Pick a state.' });
  });
}

describe('SearchSelect', () => {
  async function render<T>(host: new () => T) {
    const fixture = TestBed.createComponent(host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    return {
      fixture,
      instance: fixture.componentInstance,
      settle,
      trigger: () => q('sel') as HTMLButtonElement,
      search: () => q('sel-search') as HTMLInputElement | null,
      listbox: () => q('sel-listbox'),
      options: () => Array.from(el.querySelectorAll<HTMLElement>('[data-testid="sel-option"]')),
      empty: () => q('sel-empty'),
      open: async () => {
        (q('sel') as HTMLButtonElement).click();
        await settle();
      },
      type: async (text: string) => {
        const input = q('sel-search') as HTMLInputElement;
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await settle();
      },
      key: async (key: string) => {
        q('sel-search')?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        await settle();
      },
    };
  }

  it('shows the placeholder until something is chosen', async () => {
    const view = await render(StandaloneHost);
    expect(view.trigger().textContent).toContain('Select an option');
  });

  it('opens, lists every option, and closes on selection', async () => {
    const view = await render(StandaloneHost);
    expect(view.listbox()).toBeNull();

    await view.open();
    expect(view.options()).toHaveLength(OPTIONS.length);

    view.options()[0].click();
    await view.settle();

    expect(view.instance.picked()).toBe('Gujarat');
    expect(view.listbox()).toBeNull();
    expect(view.trigger().textContent).toContain('Gujarat');
  });

  it('filters case-insensitively, by label and by hint', async () => {
    const view = await render(StandaloneHost);
    await view.open();

    await view.type('gu');
    // The label and the hint are adjacent spans, so read the label span directly.
    expect(view.options().map((o) => o.querySelector('span')?.textContent?.trim())).toEqual([
      'Gujarat',
    ]);

    await view.type('GOA');
    expect(view.options()).toHaveLength(1);

    // A state is findable by its GST code, which is why the hint is searched too.
    await view.type('38');
    expect(view.options()[0].textContent).toContain('Ladakh');
  });

  it('says so when nothing matches, rather than showing an empty box', async () => {
    const view = await render(StandaloneHost);
    await view.open();
    await view.type('zzzz');

    expect(view.options()).toHaveLength(0);
    expect(view.empty()?.textContent).toContain('No matches');
  });

  describe('keyboard', () => {
    it('moves with the arrows and commits on Enter', async () => {
      const view = await render(StandaloneHost);
      await view.open();

      await view.key('ArrowDown');
      await view.key('ArrowDown');
      await view.key('Enter');

      expect(view.instance.picked()).toBe(OPTIONS[2].value);
    });

    it('wraps at both ends', async () => {
      const view = await render(StandaloneHost);
      await view.open();

      await view.key('ArrowUp'); // from the first option, wrap to the last
      await view.key('Enter');

      expect(view.instance.picked()).toBe(OPTIONS[OPTIONS.length - 1].value);
    });

    it('does not select merely by highlighting', async () => {
      const view = await render(StandaloneHost);
      await view.open();

      await view.key('ArrowDown');
      await view.key('ArrowDown');

      // Arrowing past an option must never rewrite the stored value; only Enter commits.
      expect(view.instance.picked()).toBe('');
    });

    it('closes on Escape without changing the value', async () => {
      const view = await render(StandaloneHost);
      view.instance.picked.set('Goa');
      await view.settle();
      await view.open();
      await view.key('ArrowDown');

      view.trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await view.settle();

      expect(view.listbox()).toBeNull();
      expect(view.instance.picked()).toBe('Goa');
    });
  });

  describe('accessibility', () => {
    it('is a combobox that reports its expanded state', async () => {
      const view = await render(StandaloneHost);
      expect(view.trigger().getAttribute('role')).toBe('combobox');
      expect(view.trigger().getAttribute('aria-expanded')).toBe('false');

      await view.open();
      expect(view.trigger().getAttribute('aria-expanded')).toBe('true');
      expect(view.listbox()?.getAttribute('role')).toBe('listbox');
    });

    it('points aria-activedescendant at the highlighted option', async () => {
      const view = await render(StandaloneHost);
      await view.open();
      await view.key('ArrowDown');

      // Focus stays in the search box, so the active option must be announced this way.
      const active = view.search()?.getAttribute('aria-activedescendant');
      expect(active).toBe(view.options()[1].id);
    });

    it('marks the chosen option selected', async () => {
      const view = await render(StandaloneHost);
      view.instance.picked.set('Kerala');
      await view.settle();
      await view.open();

      const selected = view.options().filter((o) => o.getAttribute('aria-selected') === 'true');
      expect(selected).toHaveLength(1);
      expect(selected[0].textContent).toContain('Kerala');
    });

    it('cannot be opened when disabled', async () => {
      const view = await render(StandaloneHost);
      view.instance.disabled.set(true);
      await view.settle();

      expect(view.trigger().disabled).toBe(true);
      view.trigger().click();
      await view.settle();
      expect(view.listbox()).toBeNull();
    });
  });

  describe('Signal Forms integration', () => {
    it('writes the chosen value into the bound field', async () => {
      const view = await render(FormHost);
      await view.open();
      view.options()[0].click();
      await view.settle();

      expect(view.instance.model().state).toBe('Gujarat');
    });

    it('reflects a value set on the form', async () => {
      const view = await render(FormHost);
      view.instance.model.set({ state: 'Kerala' });
      await view.settle();

      expect(view.trigger().textContent).toContain('Kerala');
    });

    it('participates in validation', async () => {
      const view = await render(FormHost);

      await submit(view.instance.f, { action: async () => undefined });
      await view.settle();

      expect(view.instance.f.state().errors()[0]?.message).toBe('Pick a state.');
    });
  });
});
