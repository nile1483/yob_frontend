import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { changedFields, hasChanges } from '../../account/account.changed-fields';
import { AddressLocationService } from '../../../foundation/locations/address-location.service';
import type { AddressFormConfig, AddressFormValues } from '../contracts/checkout.types';
import { AddressForm } from './address-form';

const STORED: AddressFormValues = {
  address_title: 'Head Office',
  address_line1: 'Plot 19, Sanand Industrial Estate',
  address_line2: 'Phase II',
  city: 'Ahmedabad',
  state: 'Gujarat',
  pincode: '382110',
  country: 'India',
};

@Component({
  imports: [AddressForm],
  template: `
    <app-address-form
      [initial]="initial()"
      [config]="config()"
      (submitted)="emitted.set($event)"
      (cancelled)="cancelled.set(cancelled() + 1)"
    />
  `,
})
class Host {
  readonly initial = signal<AddressFormValues | null>(null);
  readonly config = signal<AddressFormConfig>({});
  readonly emitted = signal<AddressFormValues | null>(null);
  readonly cancelled = signal(0);
}

describe('AddressForm', () => {
  async function render(setup: (h: Host) => void = () => {}) {
    const fixture = TestBed.createComponent(Host);
    setup(fixture.componentInstance);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();

    const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    return {
      instance: fixture.componentInstance,
      settle,
      q,
      fill: async (id: string, value: string) => {
        const input = q(id) as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        await settle();
      },
      /** Drive the combobox the way a person does. */
      pick: async (id: string, label: string) => {
        (q(id) as HTMLButtonElement).click();
        await settle();
        const search = q(`${id}-search`) as HTMLInputElement;
        search.value = label;
        search.dispatchEvent(new Event('input', { bubbles: true }));
        await settle();
        const option = Array.from(
          el.querySelectorAll<HTMLElement>(`[data-testid="${id}-option"]`),
        ).find((o) => o.querySelector('span')?.textContent?.trim() === label);
        option?.click();
        await settle();
      },
      submit: async () => {
        (q('address-form') as HTMLFormElement).dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
        await settle();
        await settle();
      },
    };
  }

  describe('defaults for a new address', () => {
    it('starts on India', async () => {
      const view = await render();
      expect(view.q('address-country')?.textContent).toContain('India');
    });

    it('does not preselect a state', async () => {
      const view = await render();
      // Pre-selecting a state a buyer never chose is how addresses get filed wrongly.
      expect(view.q('address-state')?.textContent).toContain('Select a state');
    });

    it('honours a configured default country', async () => {
      const view = await render((h) => h.config.set({ defaultCountry: 'Kenya' }));
      expect(view.q('address-country')?.textContent).toContain('Kenya');
    });

    it('honours a configured default state', async () => {
      const view = await render((h) =>
        h.config.set({ defaultCountry: 'India', defaultState: 'Kerala' }),
      );
      expect(view.q('address-state')?.textContent).toContain('Kerala');
    });

    it('uses the configured wording', async () => {
      const view = await render((h) =>
        h.config.set({ heading: 'Edit address', submitLabel: 'Save changes' }),
      );
      expect(view.q('address-form')?.textContent).toContain('Edit address');
      expect(view.q('address-form-submit')?.textContent).toContain('Save changes');
    });
  });

  describe('editing an existing address', () => {
    it('shows the stored country and state, never the default', async () => {
      const abroad: AddressFormValues = { ...STORED, country: 'Kenya', state: 'Nairobi' };
      const view = await render((h) => h.initial.set(abroad));

      // The single most damaging possible bug here: silently relocating a stored address.
      expect(view.q('address-country')?.textContent).toContain('Kenya');
      expect(view.q('address-country')?.textContent).not.toContain('India');
    });

    it('preselects an Indian state from the controlled list', async () => {
      const view = await render((h) => h.initial.set(STORED));
      expect(view.q('address-state')?.textContent).toContain('Gujarat');
    });

    it('falls back to a text field for a country with no bundled subdivisions', async () => {
      const view = await render((h) =>
        h.initial.set({ ...STORED, country: 'Kenya', state: 'Nairobi' }),
      );

      // A picker offering nothing would be a broken control; a text box is a working one.
      const state = view.q('address-state') as HTMLInputElement;
      expect(state.tagName).toBe('INPUT');
      expect(state.value).toBe('Nairobi');
    });
  });

  describe('changing country', () => {
    it('clears a state that does not belong to the new country', async () => {
      const view = await render((h) => h.initial.set(STORED));
      expect(view.q('address-state')?.textContent).toContain('Gujarat');

      await view.pick('address-country', 'Kenya');

      // Gujarat is not a subdivision of Kenya; keeping it would submit a value the
      // backend rejects, or worse, stores.
      const state = view.q('address-state') as HTMLInputElement;
      expect(state.value).toBe('');
    });

    it('leaves a still-valid state alone', async () => {
      const view = await render((h) => h.initial.set(STORED));

      await view.pick('address-country', 'India');

      expect(view.q('address-state')?.textContent).toContain('Gujarat');
    });

    it('does not disturb the other fields', async () => {
      const view = await render((h) => h.initial.set(STORED));
      await view.pick('address-country', 'Kenya');

      expect((view.q('address-line1') as HTMLInputElement).value).toBe(STORED.address_line1);
      expect((view.q('address-city') as HTMLInputElement).value).toBe(STORED.city);
      expect((view.q('address-pincode') as HTMLInputElement).value).toBe(STORED.pincode);
    });
  });

  describe('validation', () => {
    it('blocks submission and emits nothing while required fields are empty', async () => {
      const view = await render();
      await view.submit();

      expect(view.instance.emitted()).toBeNull();
      expect(view.q('address-form')?.textContent).toContain('Enter the street address');
      expect(view.q('address-form')?.textContent).toContain('Enter the city');
    });

    it('emits once every required field is present', async () => {
      const view = await render();
      await view.fill('address-line1', '12 Dock Road');
      await view.fill('address-city', 'Kochi');
      await view.submit();

      expect(view.instance.emitted()).toEqual({
        address_title: '',
        address_line1: '12 Dock Road',
        address_line2: '',
        city: 'Kochi',
        state: '',
        pincode: '',
        // Country was never typed: the default supplied it.
        country: 'India',
      });
    });
  });

  it('cancels without emitting a value', async () => {
    const view = await render((h) => h.initial.set(STORED));
    (view.q('address-form-cancel') as HTMLButtonElement).click();
    await view.settle();

    expect(view.instance.cancelled()).toBe(1);
    expect(view.instance.emitted()).toBeNull();
  });

  /**
   * The release-critical guarantee.
   *
   * `update_address` applies a field **because the key is present**. The form emits the
   * whole set of values it holds - which is correct and simple - and the *page* diffs
   * them against the record it opened with. These prove the diff, because getting it
   * wrong silently destroys stored data.
   */
  describe('partial updates built from what the form emits', () => {
    it('omits fields the buyer never touched', async () => {
      const view = await render((h) => h.initial.set(STORED));
      await view.fill('address-city', 'Surat');
      await view.submit();

      const patch = changedFields(STORED, view.instance.emitted()!);

      expect(patch).toEqual({ city: 'Surat' });
      expect('address_line1' in patch).toBe(false);
      expect('address_line2' in patch).toBe(false);
      expect('state' in patch).toBe(false);
    });

    it('sends an empty string when the buyer deliberately clears a field', async () => {
      const view = await render((h) => h.initial.set(STORED));
      await view.fill('address-line2', '');
      await view.submit();

      const patch = changedFields(STORED, view.instance.emitted()!);

      // Present and empty, which is the backend's instruction to clear - not omitted,
      // which would silently keep the old value the buyer just deleted.
      expect(patch).toEqual({ address_line2: '' });
      expect(patch.address_line2).toBe('');
    });

    it('does not mistake a falsy-but-present value for an omission', async () => {
      // The address contract is all strings, so "0" is the falsy value that can actually
      // occur - a postal code of "0" must survive a truthiness check that would drop it.
      const stored: AddressFormValues = { ...STORED, pincode: '0' };
      const view = await render((h) => h.initial.set(stored));
      await view.fill('address-pincode', '380009');
      await view.submit();
      expect(changedFields(stored, view.instance.emitted()!)).toEqual({ pincode: '380009' });

      const back = await render((h) => h.initial.set(STORED));
      await back.fill('address-pincode', '0');
      await back.submit();
      expect(changedFields(STORED, back.instance.emitted()!)).toEqual({ pincode: '0' });
    });

    it('produces no patch at all when nothing changed', async () => {
      const view = await render((h) => h.initial.set(STORED));
      await view.submit();

      const patch = changedFields(STORED, view.instance.emitted()!);
      expect(hasChanges(patch)).toBe(false);
    });

    it('carries a country change through as a real update', async () => {
      const view = await render((h) => h.initial.set(STORED));
      await view.pick('address-country', 'Kenya');
      await view.submit();

      const patch = changedFields(STORED, view.instance.emitted()!);
      // Country changed, and the now-invalid state is cleared explicitly rather than
      // left pointing at an Indian subdivision.
      expect(patch.country).toBe('Kenya');
      expect(patch.state).toBe('');
    });
  });
});

describe('AddressLocationService', () => {
  function service() {
    return TestBed.inject(AddressLocationService);
  }

  it('offers every country the backend knows, spelled its way', () => {
    const s = service();
    expect(s.countries.length).toBeGreaterThan(200);
    expect(s.countries.some((c) => c.name === 'India')).toBe(true);
    // Frappe's own spelling, not an ISO or colloquial variant.
    expect(s.countries.some((c) => c.name === 'IN')).toBe(false);
  });

  it('defaults to India', () => {
    expect(service().defaultCountry).toBe('India');
  });

  it('returns canonical Indian subdivisions, including the post-2020 ones', () => {
    const names = service()
      .subdivisionsFor('India')
      .map((s) => s.name);

    expect(names).toContain('Gujarat');
    // The cases a generic dataset usually gets wrong.
    expect(names).toContain('Dadra and Nagar Haveli and Daman and Diu');
    expect(names).toContain('Ladakh');
    // GST filing artefacts are not places a buyer has an address in.
    expect(names).not.toContain('Other Territory');
    expect(names).not.toContain('Other Countries');
  });

  it('carries the GST state number as metadata only', () => {
    expect(service().subdivisionsFor('India').find((s) => s.name === 'Gujarat')?.code).toBe('24');
  });

  it('has no subdivisions for other countries, and says so', () => {
    const s = service();
    expect(s.subdivisionsFor('Kenya')).toHaveLength(0);
    expect(s.hasSubdivisions('Kenya')).toBe(false);
    expect(s.hasSubdivisions('India')).toBe(true);
  });

  it('matches country names case-insensitively without rewriting them', () => {
    const s = service();
    expect(s.subdivisionsFor('india').length).toBeGreaterThan(0);
    expect(s.canonicalCountry('india')).toBe('India');
    expect(s.canonicalCountry('Nowhere')).toBeNull();
  });

  it('judges a subdivision only where it has a list to judge against', () => {
    const s = service();
    expect(s.isValidSubdivision('India', 'Gujarat')).toBe(true);
    expect(s.isValidSubdivision('India', 'Nairobi')).toBe(false);
    // Nothing here is in a position to judge a Kenyan county - the backend is.
    expect(s.isValidSubdivision('Kenya', 'Nairobi')).toBe(true);
  });
});
