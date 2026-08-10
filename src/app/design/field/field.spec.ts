import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Field } from './field';

@Component({
  imports: [Field],
  template: `
    <app-field [label]="label()" [hint]="hint()" [error]="error()" [required]="required()">
      <input type="email" [required]="required()" />
    </app-field>
  `,
})
class Host {
  readonly label = signal('Email address');
  readonly hint = signal('');
  readonly error = signal('');
  readonly required = signal(false);
}

describe('Field', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      host: fixture.componentInstance,
      element,
      input: element.querySelector('input') as HTMLInputElement,
      label: element.querySelector('label') as HTMLLabelElement,
    };
  }

  describe('label association', () => {
    it('renders the label text', async () => {
      const { label } = await render();
      expect(label.textContent).toContain('Email address');
    });

    it('associates the label with the projected control', async () => {
      const { input, label } = await render();
      // Implicit association: the control sits inside the label, so there is no
      // id/for pair for a caller to get wrong.
      expect(label.control).toBe(input);
      expect(input.labels?.[0]).toBe(label);
    });

    it('leaves the projected control native', async () => {
      const { input } = await render();
      expect(input.tagName).toBe('INPUT');
      expect(input.type).toBe('email');
    });
  });

  describe('required', () => {
    it('shows no marker by default', async () => {
      const { label } = await render();
      expect(label.textContent).not.toContain('*');
    });

    it('shows a marker that screen readers ignore', async () => {
      const { fixture, host, label } = await render();
      host.required.set(true);
      await fixture.whenStable();

      const marker = label.querySelector('[aria-hidden="true"]');
      expect(marker?.textContent?.trim()).toBe('*');
      // The control's own `required` attribute carries the semantics, so the marker
      // must not be read out as "star".
      expect(label.querySelector('input')?.required).toBe(true);
    });
  });

  describe('hint', () => {
    it('is not rendered when empty', async () => {
      const { element } = await render();
      expect(element.textContent).not.toContain('We only use this');
    });

    it('renders and is linked to the control', async () => {
      const { fixture, host, element, input } = await render();
      host.hint.set('We only use this to contact you');
      await fixture.whenStable();

      const hint = element.querySelector('p');
      expect(hint?.textContent).toContain('We only use this to contact you');
      expect(input.getAttribute('aria-describedby')).toBe(hint?.id);
    });
  });

  describe('error', () => {
    it('renders the message', async () => {
      const { fixture, host, element } = await render();
      host.error.set('Enter a valid email address');
      await fixture.whenStable();

      expect(element.textContent).toContain('Enter a valid email address');
    });

    it('is announced without waiting for focus', async () => {
      const { fixture, host, element } = await render();
      host.error.set('Enter a valid email address');
      await fixture.whenStable();

      expect(element.querySelector('[role="alert"]')).not.toBeNull();
    });

    it('marks the control invalid and links the message', async () => {
      const { fixture, host, element, input } = await render();
      host.error.set('Enter a valid email address');
      await fixture.whenStable();

      const message = element.querySelector('[role="alert"]');
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe(message?.id);
    });

    it('links both hint and error when each is present', async () => {
      const { fixture, host, input } = await render();
      host.hint.set('Use your work address');
      host.error.set('That address is not recognised');
      await fixture.whenStable();

      const describedBy = input.getAttribute('aria-describedby')?.split(' ') ?? [];
      expect(describedBy).toHaveLength(2);
    });

    it('clears the invalid state when the error goes away', async () => {
      const { fixture, host, input } = await render();
      host.error.set('Enter a valid email address');
      await fixture.whenStable();
      expect(input.getAttribute('aria-invalid')).toBe('true');

      host.error.set('');
      await fixture.whenStable();

      expect(input.getAttribute('aria-invalid')).toBe('false');
      expect(input.getAttribute('aria-describedby')).toBeNull();
    });
  });

  it('gives each field instance distinct message ids', async () => {
    const first = await render();
    first.host.hint.set('one');
    await first.fixture.whenStable();

    const second = await render();
    second.host.hint.set('two');
    await second.fixture.whenStable();

    const a = first.input.getAttribute('aria-describedby');
    const b = second.input.getAttribute('aria-describedby');
    expect(a).not.toBe(b);
  });
});
