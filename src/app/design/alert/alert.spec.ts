import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Alert, type AlertTone } from './alert';

@Component({
  imports: [Alert],
  template: `<app-alert [tone]="tone()">Could not save your changes</app-alert>`,
})
class Host {
  readonly tone = signal<AlertTone>('info');
}

describe('Alert', () => {
  async function render(tone?: AlertTone) {
    const fixture = TestBed.createComponent(Host);
    if (tone) {
      fixture.componentInstance.tone.set(tone);
    }
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, host: fixture.componentInstance, element };
  }

  it('renders projected content', async () => {
    const { element } = await render();
    expect(element.textContent).toContain('Could not save your changes');
  });

  it('interrupts for an error', async () => {
    const { element } = await render('error');
    // `alert` is assertive: a failed submission should not wait its turn.
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('announces success politely', async () => {
    const { element } = await render('success');
    expect(element.querySelector('[role="status"]')).not.toBeNull();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('announces info politely', async () => {
    const { element } = await render('info');
    expect(element.querySelector('[role="status"]')).not.toBeNull();
  });

  it('updates the role when the tone changes', async () => {
    const { fixture, host, element } = await render('info');
    expect(element.querySelector('[role="status"]')).not.toBeNull();

    host.tone.set('error');
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.querySelector('[role="status"]')).toBeNull();
  });
});
