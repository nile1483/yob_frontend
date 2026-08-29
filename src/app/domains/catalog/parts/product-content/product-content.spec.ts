import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { ProductContent } from './product-content';
import type { ProductContentSectionDto } from '../../contracts/catalog.types';

/**
 * The product content orchestrator (Phase 27D).
 *
 * Its job is ordering and admission: which sections appear, in what order, with which
 * blocks - and what happens when something arrives that this release cannot draw.
 * The blocks' own rendering is `product-content-blocks.spec.ts`.
 *
 * No HTTP provider is configured, deliberately: content arrives with `get_item`, so a
 * renderer that fetched would fail to construct rather than quietly issue a request.
 */
describe('ProductContent', () => {
  let fixture: ComponentFixture<ProductContent>;

  function open(sections: readonly ProductContentSectionDto[]): void {
    fixture = TestBed.createComponent(ProductContent);
    fixture.componentRef.setInput('sections', sections);
    fixture.detectChanges();
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function all(testId: string): HTMLElement[] {
    return Array.from(host().querySelectorAll(`[data-testid="${testId}"]`));
  }

  function sectionTitles(): (string | null)[] {
    return all('product-content-section').map((node) => node.getAttribute('data-section-title'));
  }

  function blockTypes(): (string | null)[] {
    return all('product-content-block').map((node) => node.getAttribute('data-block-type'));
  }

  const RICH = { type: 'rich_text', content: '<p>Prose</p>' } as const;
  const IMAGE = {
    type: 'image',
    image: '/files/d.png',
    alt_text: null,
    caption: null,
  } as const;
  const DOWNLOAD = {
    type: 'download',
    file: '/files/m.pdf',
    label: 'Manual',
    description: null,
  } as const;

  it('renders nothing at all for no sections', () => {
    open([]);

    expect(all('product-content-section')).toHaveLength(0);
    // No wrapper, no heading, no spacing: an absent region must be absent from the
    // layout, not an empty box every product carries.
    expect(host().textContent?.trim()).toBe('');
  });

  it('renders one section with its title as a heading', () => {
    open([{ title: 'Description', blocks: [RICH] }]);

    const heading = host().querySelector('h2');
    expect(heading?.textContent?.trim()).toBe('Description');
    expect(all('product-content-block')).toHaveLength(1);
  });

  it('renders several sections in the backend order', () => {
    open([
      { title: 'Description', blocks: [RICH] },
      { title: 'Specifications', blocks: [RICH] },
      { title: 'Shipping', blocks: [RICH] },
    ]);

    expect(sectionTitles()).toEqual(['Description', 'Specifications', 'Shipping']);
  });

  it('does not reorder sections into any tidier arrangement', () => {
    // Alphabetical would be Downloads / Overview / Specifications. The merchant's order
    // is the merchandising decision.
    open([
      { title: 'Specifications', blocks: [RICH] },
      { title: 'Overview', blocks: [RICH] },
      { title: 'Downloads', blocks: [DOWNLOAD] },
    ]);

    expect(sectionTitles()).toEqual(['Specifications', 'Overview', 'Downloads']);
  });

  it('keeps mixed block types in their given order within a section', () => {
    // A renderer that grouped by type would put the two images together, or float the
    // download to the end. Nothing here groups.
    open([
      { title: 'Description', blocks: [RICH, IMAGE, DOWNLOAD, IMAGE, RICH] },
    ]);

    expect(blockTypes()).toEqual(['rich_text', 'image', 'download', 'image', 'rich_text']);
  });

  it('keeps block order across sections too', () => {
    open([
      { title: 'A', blocks: [DOWNLOAD, RICH] },
      { title: 'B', blocks: [IMAGE] },
    ]);

    expect(blockTypes()).toEqual(['download', 'rich_text', 'image']);
  });

  it('skips a block type this release cannot draw', () => {
    open([
      {
        title: 'Description',
        blocks: [RICH, { type: 'hologram' } as never, IMAGE],
      },
    ]);

    // The unknown one is gone; its neighbours are untouched and still in order.
    expect(blockTypes()).toEqual(['rich_text', 'image']);
    expect(all('product-content-section')).toHaveLength(1);
  });

  it('omits a section left with nothing renderable, heading included', () => {
    // A bare "Specifications" above empty space tells the buyer something failed, which
    // is worse than the section simply not being mentioned.
    open([
      { title: 'Description', blocks: [RICH] },
      { title: 'Specifications', blocks: [{ type: 'hologram' } as never] },
      { title: 'Shipping', blocks: [RICH] },
    ]);

    expect(sectionTitles()).toEqual(['Description', 'Shipping']);
    expect(host().textContent).not.toContain('Specifications');
  });

  it('renders nothing when every section is unrenderable', () => {
    open([{ title: 'Only', blocks: [{ type: 'hologram' } as never] }]);

    expect(all('product-content-section')).toHaveLength(0);
  });

  it('survives a section with an empty block list', () => {
    expect(() => open([{ title: 'Empty', blocks: [] }])).not.toThrow();
    expect(all('product-content-section')).toHaveLength(0);
  });

  it('draws no tab or accordion affordance', () => {
    // Every section is visible at once, by decision: the contract publishes no tab key
    // or layout mode, and hiding half a datasheet is how a buyer misses shipping terms.
    open([
      { title: 'Description', blocks: [RICH] },
      { title: 'Specifications', blocks: [RICH] },
    ]);

    expect(host().querySelector('[role="tab"]')).toBeNull();
    expect(host().querySelector('[role="tablist"]')).toBeNull();
    expect(host().querySelector('[role="tabpanel"]')).toBeNull();
    expect(host().querySelector('details')).toBeNull();
    expect(host().querySelector('summary')).toBeNull();
    // Both headings present simultaneously.
    expect(host().querySelectorAll('h2')).toHaveLength(2);
  });

  it('applies no CMS placement styling', () => {
    // Product content carries no section_style or content_width - the backend sends
    // neither - so none of the CMS band classes may appear here.
    open([{ title: 'Description', blocks: [RICH] }]);

    const html = host().innerHTML;
    for (const cmsClass of [
      'yob-section-muted',
      'yob-section-brand-soft',
      'yob-section-accent',
      'yob-section-dark',
    ]) {
      expect(html, `product content used ${cmsClass}`).not.toContain(cmsClass);
    }

    // The CMS band component's own hooks. Matched exactly rather than as substrings:
    // this component's `product-content-section` legitimately contains the shorter
    // string, and is precisely the separate thing being kept separate.
    expect(host().querySelector('[data-testid="content-section"]')).toBeNull();
    expect(host().querySelector('yob-content-section')).toBeNull();
    expect(host().querySelector('[data-section-style]')).toBeNull();
    expect(host().querySelector('[data-content-width]')).toBeNull();
  });

  it('uses the source-owned page band and column', () => {
    open([{ title: 'Description', blocks: [RICH] }]);

    expect(host().querySelector('.yob-page-section')).not.toBeNull();
    expect(host().querySelector('.yob-content-container')).not.toBeNull();
  });

  it('constructs with no HTTP provider, so it can issue no request', () => {
    expect(() => open([{ title: 'Description', blocks: [RICH] }])).not.toThrow();
  });
});
