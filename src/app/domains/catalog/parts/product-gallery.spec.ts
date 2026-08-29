import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { ProductGallery } from './product-gallery';
import type { ProductGalleryImageDto } from '../contracts/catalog.types';

/**
 * The product gallery (Phase 27C).
 *
 * Two things are being pinned here, and the second matters more than the first.
 *
 * The obvious one: a picker works - the primary opens, clicking changes the preview,
 * captions follow, blanks fall back.
 *
 * The load-bearing one: **selection survives everything except a new owner**. The
 * component is deliberately given no notion of a resolved variant, so the test for "a
 * variant does not reset the gallery" is expressed the only way it can be here - by
 * changing every other input and proving the selection holds. The page-level counterpart
 * lives in `item-variant.spec.ts`, and the browser-level one in `e2e/variants.spec.ts`.
 *
 * TestBed with no HTTP provider at all, on purpose. A gallery that reached for the
 * network would not fail an assertion in this file; it would fail to construct.
 */
describe('ProductGallery', () => {
  let fixture: ComponentFixture<ProductGallery>;

  function row(over: Partial<ProductGalleryImageDto> = {}): ProductGalleryImageDto {
    return { image: '/files/a.png', alt_text: null, caption: null, is_primary: false, ...over };
  }

  const ROWS: readonly ProductGalleryImageDto[] = [
    row({ image: '/files/side.png', alt_text: 'Side on', caption: 'Side view' }),
    row({ image: '/files/front.png', alt_text: 'Front on', caption: 'Front view', is_primary: true }),
    row({ image: '/files/back.png' }),
  ];

  function open(
    gallery: readonly ProductGalleryImageDto[],
    over: { fallbackImage?: string | null; productName?: string; ownerKey?: string } = {},
  ): void {
    fixture = TestBed.createComponent(ProductGallery);
    fixture.componentRef.setInput('gallery', gallery);
    fixture.componentRef.setInput('fallbackImage', over.fallbackImage ?? null);
    fixture.componentRef.setInput('productName', over.productName ?? 'Hex Bolt M10');
    fixture.componentRef.setInput('ownerKey', over.ownerKey ?? 'hex-bolt');
    fixture.detectChanges();
  }

  function el(testId: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
  }

  function all(testId: string): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testId}"]`),
    );
  }

  /** The large preview's rendered source, or null when it shows the placeholder. */
  function mainSrc(): string | null {
    return el('item-image')?.querySelector('img')?.getAttribute('src') ?? null;
  }

  function thumbs(): HTMLButtonElement[] {
    return all('product-gallery-thumb') as HTMLButtonElement[];
  }

  function click(index: number): void {
    thumbs()[index]!.click();
    fixture.detectChanges();
  }

  describe('with no gallery configured', () => {
    it('shows the product own image as the single preview', () => {
      open([], { fallbackImage: '/files/base.png' });

      expect(mainSrc()).toContain('base.png');
    });

    it('draws no thumbnail strip for a fallback image', () => {
      // The base image is not a gallery row. A lone thumbnail under it would imply a
      // gallery the merchant never configured.
      open([], { fallbackImage: '/files/base.png' });

      expect(el('product-gallery-thumbs')).toBeNull();
      expect(thumbs()).toHaveLength(0);
    });

    it('falls back to the shared placeholder when there is no image at all', () => {
      open([], { fallbackImage: null });

      expect(el('item-image-placeholder')).not.toBeNull();
      expect(el('item-image-image')).toBeNull();
      // The box still occupies its space, so nothing below it moves.
      expect(el('item-image')).not.toBeNull();
    });

    it('names the preview after the product', () => {
      open([], { fallbackImage: '/files/base.png', productName: 'Hex Bolt M10' });

      expect(el('item-image')?.querySelector('img')?.getAttribute('alt')).toBe('Hex Bolt M10');
    });
  });

  describe('with one image', () => {
    it('shows it without a redundant one-item strip', () => {
      open([row({ image: '/files/only.png' })]);

      expect(mainSrc()).toContain('only.png');
      expect(el('product-gallery-thumbs')).toBeNull();
    });
  });

  describe('opening image', () => {
    it('opens on the primary row', () => {
      open(ROWS);

      expect(mainSrc()).toContain('front.png');
    });

    it('opens on the first row when nothing is primary', () => {
      open(ROWS.map((r) => ({ ...r, is_primary: false })));

      expect(mainSrc()).toContain('side.png');
    });

    it('does not reorder the strip to put the primary first', () => {
      // Order and primacy are independent. The preview opens on Front; the thumbnails
      // stay Side / Front / Back, which is the merchant's arrangement.
      open(ROWS);

      const sources = thumbs().map(
        (button) => button.querySelector('img')?.getAttribute('src') ?? '',
      );

      expect(sources[0]).toContain('side.png');
      expect(sources[1]).toContain('front.png');
      expect(sources[2]).toContain('back.png');
      expect(thumbs()[1]?.getAttribute('data-selected')).toBe('true');
    });

    it('leaves a primary at position 3 as thumbnail 3', () => {
      // The requirement spelled out literally, because "primary" reads like "first" and
      // a reasonable implementer might promote it. Backend order wins; primacy only
      // decides what opens.
      const rows = [
        row({ image: '/files/one.png' }),
        row({ image: '/files/two.png' }),
        row({ image: '/files/three.png', is_primary: true }),
      ];
      open(rows);

      expect(thumbs()[2]?.querySelector('img')?.getAttribute('src')).toContain('three.png');
      expect(thumbs()[2]?.getAttribute('aria-pressed')).toBe('true');
      expect(thumbs()[0]?.querySelector('img')?.getAttribute('src')).toContain('one.png');
      expect(mainSrc()).toContain('three.png');
    });

    it('renders the strip in exactly the order given, whatever the values', () => {
      const scrambled = [
        row({ image: '/files/z.png' }),
        row({ image: '/files/a.png', is_primary: true }),
        row({ image: '/files/m.png' }),
      ];
      open(scrambled);

      expect(
        thumbs().map((button) => button.querySelector('img')?.getAttribute('src') ?? ''),
      ).toEqual([
        expect.stringContaining('z.png'),
        expect.stringContaining('a.png'),
        expect.stringContaining('m.png'),
      ]);
    });
  });

  describe('selection', () => {
    it('changes the preview when a thumbnail is clicked', () => {
      open(ROWS);
      click(2);

      expect(mainSrc()).toContain('back.png');
    });

    it('moves the selected state with the click', () => {
      open(ROWS);
      click(0);

      expect(thumbs()[0]?.getAttribute('aria-pressed')).toBe('true');
      expect(thumbs()[1]?.getAttribute('aria-pressed')).toBe('false');
      expect(thumbs()[2]?.getAttribute('aria-pressed')).toBe('false');
    });

    it('uses real buttons with a useful accessible name', () => {
      open(ROWS);

      for (const button of thumbs()) {
        expect(button.tagName).toBe('BUTTON');
        expect(button.getAttribute('type')).toBe('button');
      }

      // Position and total, then what the picture shows.
      expect(thumbs()[0]?.getAttribute('aria-label')).toContain('1');
      expect(thumbs()[0]?.getAttribute('aria-label')).toContain('3');
      expect(thumbs()[0]?.getAttribute('aria-label')).toContain('Side on');
      // A row with neither alt nor caption is still named, by the product.
      expect(thumbs()[2]?.getAttribute('aria-label')).toContain('Hex Bolt M10');
    });
  });

  describe('caption', () => {
    it('follows the active image', () => {
      open(ROWS);
      expect(el('product-gallery-caption')?.textContent?.trim()).toBe('Front view');

      click(0);
      expect(el('product-gallery-caption')?.textContent?.trim()).toBe('Side view');
    });

    it('reserves no row when the active image has none', () => {
      open(ROWS);
      click(2);

      expect(el('product-gallery-caption')).toBeNull();
    });

    it('treats a blank caption as no caption', () => {
      open([row({ image: '/files/only.png', caption: '   ', is_primary: true })]);

      expect(el('product-gallery-caption')).toBeNull();
    });
  });

  describe('alt text', () => {
    it('uses the row own alt text', () => {
      open(ROWS);

      expect(el('item-image')?.querySelector('img')?.getAttribute('alt')).toBe('Front on');
    });

    it('falls back to the product name when the row has none', () => {
      open(ROWS, { productName: 'Hi-Vis Vest' });
      click(2);

      expect(el('item-image')?.querySelector('img')?.getAttribute('alt')).toBe('Hi-Vis Vest');
    });

    it('treats a blank alt text as absent', () => {
      open([row({ image: '/files/only.png', alt_text: '  ', is_primary: true })], {
        productName: 'Hi-Vis Vest',
      });

      expect(el('item-image')?.querySelector('img')?.getAttribute('alt')).toBe('Hi-Vis Vest');
    });
  });

  describe('a long gallery', () => {
    const MANY = Array.from({ length: 8 }, (_, index) =>
      row({ image: `/files/img-${index}.png` }),
    );

    it('renders every configured image, with no cap', () => {
      open(MANY);

      expect(thumbs()).toHaveLength(8);
      expect(thumbs()[7]?.querySelector('img')?.getAttribute('src')).toContain('img-7.png');
    });

    it('scrolls the strip inside its own box rather than widening the page', () => {
      open(MANY);

      expect(el('product-gallery-thumbs')?.className).toContain('overflow-x-auto');
    });

    it('lets a later image be selected', () => {
      open(MANY);
      click(6);

      expect(mainSrc()).toContain('img-6.png');
    });
  });

  describe('reset semantics', () => {
    it('starts the new product own opening image when the owner changes', () => {
      open(ROWS, { ownerKey: 'product-a' });
      click(0);
      expect(mainSrc()).toContain('side.png');

      const other = [
        row({ image: '/files/b-one.png' }),
        row({ image: '/files/b-two.png', is_primary: true }),
      ];
      fixture.componentRef.setInput('gallery', other);
      fixture.componentRef.setInput('ownerKey', 'product-b');
      fixture.detectChanges();

      // Product B's primary, not Product A's chosen position.
      expect(mainSrc()).toContain('b-two.png');
      expect(thumbs()[1]?.getAttribute('data-selected')).toBe('true');
    });

    it('keeps the selection when everything except the owner changes', () => {
      // This is the resolved-variant case, expressed at component level. Resolving a
      // variant changes the page's name and code and never the owner or the gallery, so
      // the buyer's chosen image must survive it. The component cannot even observe a
      // resolved variant - which is the point - so the proof is that no other input
      // disturbs the selection.
      open(ROWS, { ownerKey: 'hi-vis-safety-vest', productName: 'Hi-Vis Vest' });
      click(0);
      expect(mainSrc()).toContain('side.png');

      fixture.componentRef.setInput('productName', 'Hi-Vis Vest - Orange, Medium');
      fixture.componentRef.setInput('fallbackImage', '/files/variant-orange.png');
      fixture.detectChanges();

      expect(mainSrc()).toContain('side.png');
      expect(mainSrc()).not.toContain('variant-orange');
      expect(thumbs()[0]?.getAttribute('data-selected')).toBe('true');
    });

    it('holds the selection across an unrelated re-render', () => {
      open(ROWS);
      click(2);

      fixture.detectChanges();
      fixture.detectChanges();

      expect(mainSrc()).toContain('back.png');
    });
  });

  describe('isolation', () => {
    it('constructs with no HTTP provider, so it can issue no request', () => {
      // TestBed here configures no HttpClient. If the gallery ever injected an API this
      // would throw a null-injector error rather than quietly starting to fetch.
      expect(() => open(ROWS)).not.toThrow();
      expect(el('product-gallery')).not.toBeNull();
    });

    it('names no catalog endpoint anywhere in its source', () => {
      // A structural guard: the gallery's data arrives with get_item, and a second
      // request for it would be the architecture regressing rather than a bug.
      expect(ProductGallery.prototype.constructor.toString()).not.toContain('get_item');
    });
  });
});
