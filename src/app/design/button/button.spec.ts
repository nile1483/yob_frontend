import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Button } from './button';

/**
 * Behaviour only. Nothing here asserts a Tailwind class - the whole point of the
 * primitive is that a designer can restyle it without touching tests.
 */
@Component({
  imports: [Button],
  template: `
    <button
      yob-button
      [disabled]="disabled()"
      [loading]="loading()"
      [type]="type()"
      (click)="clicks.set(clicks() + 1)"
    >
      Place order
    </button>
  `,
})
class Host {
  readonly disabled = signal(false);
  readonly loading = signal(false);
  readonly type = signal<'button' | 'submit' | 'reset'>('button');
  readonly clicks = signal(0);
}

describe('Button', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button',
    ) as HTMLButtonElement;
    return { fixture, host: fixture.componentInstance, button };
  }

  describe('native element', () => {
    it('applies to a real button rather than wrapping one', async () => {
      const { fixture, button } = await render();
      const root = fixture.nativeElement as HTMLElement;

      expect(button.tagName).toBe('BUTTON');
      // No wrapper element, so nothing needs display:contents and there is no
      // invisible strip around the control.
      expect(root.querySelector('app-button')).toBeNull();
      expect(root.firstElementChild).toBe(button);
    });

    it('renders projected content', async () => {
      const { button } = await render();
      expect(button.textContent?.trim()).toBe('Place order');
    });

    it('lets clicks reach the caller', async () => {
      const { host, button } = await render();
      button.click();
      expect(host.clicks()).toBe(1);
    });

    it('honours the native type attribute', async () => {
      const { fixture, host, button } = await render();
      expect(button.type).toBe('button');

      host.type.set('submit');
      await fixture.whenStable();
      expect(button.type).toBe('submit');
    });

    it('keeps arbitrary standard button attributes usable', async () => {
      @Component({
        imports: [Button],
        template: `
          <form id="checkout"></form>
          <button
            yob-button
            form="checkout"
            name="action"
            value="confirm"
            aria-label="Confirm the order"
          >
            Go
          </button>
        `,
      })
      class AttrHost {}

      const fixture = TestBed.createComponent(AttrHost);
      await fixture.whenStable();
      const button = (fixture.nativeElement as HTMLElement).querySelector(
        'button',
      ) as HTMLButtonElement;

      // Nothing in the component filters or re-declares native attributes.
      expect(button.getAttribute('form')).toBe('checkout');
      expect(button.name).toBe('action');
      expect(button.value).toBe('confirm');
      expect(button.getAttribute('aria-label')).toBe('Confirm the order');
    });

    it('submits its form by default, exactly as plain HTML does', async () => {
      @Component({
        imports: [Button],
        template: `
          <form (submit)="submitted.set(true); $event.preventDefault()">
            <button yob-button>Send</button>
          </form>
        `,
      })
      class FormHost {
        readonly submitted = signal(false);
      }

      const fixture = TestBed.createComponent(FormHost);
      await fixture.whenStable();
      (fixture.nativeElement as HTMLElement).querySelector('button')?.click();

      // `type` is not shadowed by an input, so the native default survives.
      expect(fixture.componentInstance.submitted()).toBe(true);
    });
  });

  describe('disabled', () => {
    it('marks the native button disabled', async () => {
      const { fixture, host, button } = await render();
      host.disabled.set(true);
      await fixture.whenStable();
      expect(button.disabled).toBe(true);
    });

    it('prevents interaction', async () => {
      const { fixture, host, button } = await render();
      host.disabled.set(true);
      await fixture.whenStable();

      button.click();
      expect(host.clicks()).toBe(0);
    });

    it('accepts the bare HTML attribute form', async () => {
      @Component({
        imports: [Button],
        template: `<button yob-button disabled>Nope</button>`,
      })
      class BareHost {}

      const fixture = TestBed.createComponent(BareHost);
      await fixture.whenStable();
      const button = (fixture.nativeElement as HTMLElement).querySelector(
        'button',
      ) as HTMLButtonElement;

      expect(button.disabled).toBe(true);
    });
  });

  describe('loading', () => {
    it('disables the button so it cannot fire twice', async () => {
      const { fixture, host, button } = await render();
      host.loading.set(true);
      await fixture.whenStable();

      expect(button.disabled).toBe(true);
      button.click();
      expect(host.clicks()).toBe(0);
    });

    it('announces itself as busy', async () => {
      const { fixture, host, button } = await render();
      host.loading.set(true);
      await fixture.whenStable();

      expect(button.getAttribute('aria-busy')).toBe('true');
    });

    it('keeps the label visible so the button does not resize mid-click', async () => {
      const { fixture, host, button } = await render();
      host.loading.set(true);
      await fixture.whenStable();

      expect(button.textContent).toContain('Place order');
    });

    it('shows a spinner that does not double-announce the wait', async () => {
      const { fixture, host, button } = await render();
      host.loading.set(true);
      await fixture.whenStable();

      const spinner = button.querySelector('app-spinner span');
      expect(spinner).not.toBeNull();
      expect(spinner?.getAttribute('aria-hidden')).toBe('true');
      expect(spinner?.getAttribute('role')).toBeNull();
    });

    it('carries no aria-busy when idle', async () => {
      const { button } = await render();
      expect(button.getAttribute('aria-busy')).toBeNull();
    });

    it('re-enables once loading finishes', async () => {
      const { fixture, host, button } = await render();
      host.loading.set(true);
      await fixture.whenStable();
      expect(button.disabled).toBe(true);

      host.loading.set(false);
      await fixture.whenStable();

      expect(button.disabled).toBe(false);
      button.click();
      expect(host.clicks()).toBe(1);
    });
  });
});
