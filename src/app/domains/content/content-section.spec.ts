import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { CATALOG_CURRENCY } from '../catalog/catalog.currency';
import type { AnyContentBlockDto, RichTextBlockDto, SectionStyle } from './contracts/page.types';
import { ContentBlocks } from './parts/content-blocks';
import { ContentSection } from './parts/content-section';

/**
 * The band a content block sits in (Phase 25J).
 *
 * Two things are being protected. The **shape** - a full-width section with the
 * storefront's one column inside it - because that is the whole point of the phase. And
 * the **mapping** - five approved words to classes this repository owns - because the
 * one thing a merchant must never be able to do is put a class name or a colour into
 * the page.
 */
describe('content section', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: CATALOG_CURRENCY, useValue: 'INR' }],
    });
  });

  @Component({
    selector: 'app-section-host',
    imports: [ContentSection],
    template: `
      <yob-content-section [sectionStyle]="style()">
        <p data-testid="inner">content</p>
      </yob-content-section>
    `,
  })
  class SectionHost {
    readonly style = signal<SectionStyle>('default');
  }

  async function renderSection(style: SectionStyle) {
    const fixture = TestBed.createComponent(SectionHost);
    fixture.componentInstance.style.set(style);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    return {
      root,
      section: root.querySelector('section[data-testid="content-section"]'),
      container: root.querySelector('.yob-content-container'),
    };
  }

  /* ------------------------------------------------------------------ the shape */

  describe('shape', () => {
    it('is a full-width section wrapping the common content container', async () => {
      const view = await renderSection('default');

      expect(view.section).not.toBeNull();
      expect(view.section?.classList.contains('yob-page-section')).toBe(true);

      // The column lives INSIDE the band. That nesting is the entire architecture: the
      // surface can span the whole of main while the content stays where it always was.
      expect(view.container).not.toBeNull();
      expect(view.section?.contains(view.container!)).toBe(true);
      expect(view.container?.querySelector('[data-testid="inner"]')).not.toBeNull();
    });

    it('never constrains its own outer width', async () => {
      const view = await renderSection('muted');

      // A max-width on the band would cap the background at the content width, which is
      // exactly the behaviour this phase exists to remove.
      const outer = view.section?.className ?? '';
      expect(outer).not.toMatch(/max-w-/);
      expect(outer).not.toMatch(/mx-auto/);
    });

    it('uses no viewport units, which would overflow past the scrollbar', async () => {
      const view = await renderSection('dark');

      expect(view.section?.className ?? '').not.toContain('vw');
      expect(view.section?.getAttribute('style') ?? '').not.toContain('vw');
    });
  });

  /* --------------------------------------------------------------- the mapping */

  describe('style mapping', () => {
    const CASES: readonly (readonly [SectionStyle, string | null])[] = [
      ['default', null],
      ['muted', 'yob-section-muted'],
      ['brand_soft', 'yob-section-brand-soft'],
      ['accent', 'yob-section-accent'],
      ['dark', 'yob-section-dark'],
    ];

    for (const [style, expected] of CASES) {
      it(`maps ${style} to its own controlled class`, async () => {
        const view = await renderSection(style);
        const classes = view.section?.className ?? '';

        if (expected === null) {
          // `default` is the ordinary page background: no surface at all, which is what
          // keeps every block written before this field existed looking unchanged.
          expect(classes).not.toMatch(/yob-section-/);
        } else {
          expect(classes).toContain(expected);
        }

        // The backend's own word is exposed for tests and styling hooks, never as a class.
        expect(view.section?.getAttribute('data-section-style')).toBe(style);
      });
    }

    it('emits no class named after the backend value', async () => {
      for (const [style] of CASES) {
        const view = await renderSection(style);
        const classes = (view.section?.className ?? '').split(/\s+/);

        // `muted` must never appear as a class in its own right - only the mapped
        // `yob-section-muted` may. This is what makes a dynamic
        // `yob-section-${style}` impossible to slip in unnoticed.
        expect(classes).not.toContain(style);
        expect(classes).not.toContain(`section-${style}`);
      }
    });

    it('falls back to default for a value outside the published enum', async () => {
      // The type already forbids this; the cast reproduces a backend that shipped a
      // sixth style to a client that does not know it. A band with no surface is a far
      // better outcome than an unstyled class name in the DOM.
      const view = await renderSection('rainbow' as SectionStyle);

      expect(view.section).not.toBeNull();
      expect(view.section?.className ?? '').not.toMatch(/yob-section-/);
      expect((view.section?.className ?? '').split(/\s+/)).not.toContain('rainbow');
    });
  });

  /* ------------------------------------------- one block, two placements (25I) */

  describe('the same block in two placements', () => {
    function welcome(style: SectionStyle): RichTextBlockDto {
      return {
        type: 'rich_text',
        block_name: 'Shared welcome',
        section_style: style,
        title: 'Trade counter open six days',
        html: '<p>Collect from the counter or have it delivered.</p>',
        text_alignment: 'left',
      };
    }

    @Component({
      selector: 'app-blocks-host',
      imports: [ContentBlocks],
      template: `<app-content-blocks [blocks]="blocks()" />`,
    })
    class BlocksHost {
      readonly blocks = signal<readonly AnyContentBlockDto[]>([]);
    }

    async function renderBlocks(blocks: readonly AnyContentBlockDto[]) {
      const fixture = TestBed.createComponent(BlocksHost);
      fixture.componentInstance.blocks.set(blocks);
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('renders identical content inside different bands', async () => {
      const asMuted = await renderBlocks([welcome('muted')]);
      const asDark = await renderBlocks([welcome('dark')]);

      // Same Block, same renderer, same words.
      const text = (root: HTMLElement) =>
        (root.querySelector('[data-testid="rich-text-body"]')?.textContent ?? '').trim();
      expect(text(asMuted)).toBe(text(asDark));
      expect(text(asMuted)).toContain('Collect from the counter');

      // Different band, because the style belongs to the placement and not to the Block.
      const style = (root: HTMLElement) =>
        root.querySelector('[data-testid="content-section"]')?.className ?? '';
      expect(style(asMuted)).toContain('yob-section-muted');
      expect(style(asDark)).toContain('yob-section-dark');
    });
  });

  /* ----------------------------------------------- every block type is banded */

  describe('every block type goes through a section', () => {
    @Component({
      selector: 'app-blocks-host-2',
      imports: [ContentBlocks],
      template: `<app-content-blocks [blocks]="blocks()" />`,
    })
    class Host {
      readonly blocks = signal<readonly AnyContentBlockDto[]>([]);
    }

    async function render(blocks: readonly AnyContentBlockDto[]) {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.blocks.set(blocks);
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    const BLOCKS: readonly AnyContentBlockDto[] = [
      {
        type: 'image_banner',
        block_name: 'Hero',
        section_style: 'dark',
        desktop_image: '/files/d.png',
        mobile_image: null,
        alt_text: 'Hero',
        desktop_height_px: 300,
        mobile_height_px: 200,
        destination: null,
      },
      {
        type: 'rich_text',
        block_name: 'Copy',
        section_style: 'muted',
        title: 'Hello',
        html: '<p>Hi</p>',
        text_alignment: 'left',
      },
      {
        type: 'banner_carousel',
        block_name: 'Carousel',
        section_style: 'brand_soft',
        auto_play: false,
        interval_ms: null,
        desktop_height_px: 300,
        mobile_height_px: 200,
        slides: [
          {
            desktop_image: '/files/s.png',
            mobile_image: null,
            title: 'Slide',
            alt_text: 'Slide',
            destination: null,
          },
        ],
      },
      {
        type: 'product_grid',
        block_name: 'Grid',
        section_style: 'accent',
        card_type: 'square',
        item_limit: 12,
        category: 'fasteners',
        items: [],
      },
      {
        type: 'promo_grid',
        block_name: 'Promos',
        section_style: 'default',
        cards_per_row: 3,
        desktop_height_px: 200,
        mobile_height_px: 150,
        cards: [
          {
            desktop_image: '/files/c.png',
            mobile_image: null,
            title: 'Card',
            alt_text: 'Card',
            destination: null,
          },
        ],
      },
    ];

    it('gives each of the five its own band, in order', async () => {
      const root = await render(BLOCKS);

      const styles = Array.from(root.querySelectorAll('[data-testid="content-section"]')).map(
        (section) => section.getAttribute('data-section-style'),
      );
      // An empty Product Grid renders nothing, so its band is present but hollow - the
      // band belongs to the placement, and the renderer decides whether to draw.
      expect(styles).toEqual(['dark', 'muted', 'brand_soft', 'accent', 'default']);
    });

    it('puts every block inside the common container', async () => {
      const root = await render(BLOCKS);

      for (const block of Array.from(root.querySelectorAll('[data-testid="page-block"]'))) {
        expect(block.closest('.yob-content-container')).not.toBeNull();
        expect(block.closest('[data-testid="content-section"]')).not.toBeNull();
      }
    });

    it('creates no band for a block type it cannot draw', async () => {
      const root = await render([
        { type: 'video_hero', block_name: 'Video', section_style: 'dark' } as AnyContentBlockDto,
        BLOCKS[1]!,
      ]);

      // Skipped before it is banded, so an unknown type leaves no empty dark stripe.
      const styles = Array.from(root.querySelectorAll('[data-testid="content-section"]')).map(
        (section) => section.getAttribute('data-section-style'),
      );
      expect(styles).toEqual(['muted']);
    });

    it('renders absolutely nothing for an empty block list', async () => {
      const root = await render([]);

      expect(root.querySelectorAll('[data-testid="content-section"]')).toHaveLength(0);
      expect((root.textContent ?? '').trim()).toBe('');
    });
  });
});
