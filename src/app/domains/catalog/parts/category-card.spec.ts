import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { CategoryLink } from '../contracts/catalog.types';
import { CategoryCard } from './category-card';

@Component({
  imports: [CategoryCard],
  template: `<app-category-card [category]="value()" />`,
})
class Host {
  readonly value = signal<CategoryLink>({
    slug: 'fasteners',
    title: 'Fasteners',
    thumbnail: null,
  });
}

describe('CategoryCard', () => {
  async function render(link?: Partial<CategoryLink>) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    if (link) {
      fixture.componentInstance.value.update((current) => ({ ...current, ...link }));
    }
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, anchor: element.querySelector('a') as HTMLAnchorElement };
  }

  it('shows the category title', async () => {
    const { element } = await render();
    expect(element.textContent).toContain('Fasteners');
  });

  it('is a real link to the category route', async () => {
    const { anchor } = await render();

    // An anchor, not a div with a click handler: focusable, keyboard-activatable and
    // openable in a new tab for free.
    expect(anchor.tagName).toBe('A');
    expect(anchor.getAttribute('href')).toBe('/catalog/fasteners');
  });

  it('links to whichever slug it was given', async () => {
    const { anchor } = await render({ slug: 'safety-equipment', title: 'Safety Equipment' });
    expect(anchor.getAttribute('href')).toBe('/catalog/safety-equipment');
  });

  it('renders a decorative placeholder when there is no thumbnail', async () => {
    const { element } = await render({ thumbnail: null });

    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders the thumbnail path the backend supplied', async () => {
    const { element } = await render({ thumbnail: '/files/fasteners.png' });
    const img = element.querySelector('img');

    expect(img?.getAttribute('src')).toBe('/files/fasteners.png');
    // Empty alt: the title beside it already names the category, so announcing it
    // twice would just be noise.
    expect(img?.getAttribute('alt')).toBe('');
  });

  it('keeps a very long name inside the card', async () => {
    const longTitle = 'Industrial Fasteners, Fixings and Structural Connection Hardware';
    const { element } = await render({ title: longTitle });

    expect(element.textContent).toContain(longTitle);
    // Wrapping is what stops a long word widening the grid column; the class is the
    // mechanism, so this asserts the element that carries it exists rather than the
    // exact class string.
    expect(element.querySelector('span')?.textContent).toContain(longTitle);
  });
});
