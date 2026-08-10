import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Spinner } from './spinner';

@Component({
  imports: [Spinner],
  template: `<app-spinner [label]="label()" />`,
})
class Host {
  readonly label = signal('Loading');
}

describe('Spinner', () => {
  async function render(label?: string) {
    const fixture = TestBed.createComponent(Host);
    if (label !== undefined) {
      fixture.componentInstance.label.set(label);
    }
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, host: fixture.componentInstance, element };
  }

  it('announces the wait politely by default', async () => {
    const { element } = await render();
    const status = element.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.textContent).toContain('Loading');
  });

  it('accepts a caller-supplied description', async () => {
    const { element } = await render('Checking your session');
    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      'Checking your session',
    );
  });

  it('keeps its description out of the visual layout', async () => {
    const { element } = await render();
    // Visible spinner, screen-reader-only text.
    expect(element.querySelector('.sr-only')?.textContent).toContain('Loading');
  });

  it('becomes decorative when the label is empty', async () => {
    const { element } = await render('');
    // For use inside something that already announces the wait, such as a busy button.
    expect(element.querySelector('[role="status"]')).toBeNull();
    expect(element.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('hides its artwork from assistive technology either way', async () => {
    const { element } = await render();
    expect(element.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
