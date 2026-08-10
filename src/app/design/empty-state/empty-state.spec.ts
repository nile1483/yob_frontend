import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { EmptyState } from './empty-state';

@Component({
  imports: [EmptyState],
  template: `
    <app-empty-state>
      <h2 emptyTitle>Nothing here yet</h2>
      <p emptyBody>Items you add will show up in this list.</p>
      <button emptyAction type="button">Start browsing</button>
    </app-empty-state>
  `,
})
class FullHost {}

@Component({
  imports: [EmptyState],
  template: `
    <app-empty-state>
      <h2 emptyTitle>Nothing here yet</h2>
    </app-empty-state>
  `,
})
class TitleOnlyHost {}

describe('EmptyState', () => {
  it('renders projected title, body and action', async () => {
    const fixture = TestBed.createComponent(FullHost);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h2')?.textContent).toContain('Nothing here yet');
    expect(element.querySelector('p')?.textContent).toContain('Items you add');
    expect(element.querySelector('button')?.textContent).toContain('Start browsing');
  });

  it('keeps the caller heading element, rather than choosing a level itself', async () => {
    const fixture = TestBed.createComponent(FullHost);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    // The page owns its heading outline; a primitive guessing h2 vs h3 would break it.
    expect(element.querySelector('h2')).not.toBeNull();
    expect(element.querySelector('h1')).toBeNull();
  });

  it('works with only a title', async () => {
    const fixture = TestBed.createComponent(TitleOnlyHost);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h2')?.textContent).toContain('Nothing here yet');
    expect(element.querySelector('button')).toBeNull();
  });

  it('contains no wording of its own', async () => {
    const fixture = TestBed.createComponent(TitleOnlyHost);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    // Everything visible came from the caller. A primitive that knew what an empty
    // cart should say would be a business decision hiding in design/.
    expect(text.trim()).toBe('Nothing here yet');
  });
});
