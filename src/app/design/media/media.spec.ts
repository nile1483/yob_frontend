import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { mediaUrl } from '../../foundation/media/media-url';
import { Media, type MediaFit, type MediaRatio } from './media';

/**
 * The image standard, tested as behaviour.
 *
 * Ratio classes are asserted in exactly one place - the box-shape test - because the
 * ratio *is* the contract here: the whole point of the phase is that the container's
 * shape does not depend on the source image. Everything else checks what a buyer or a
 * screen reader would encounter.
 */

@Component({
  imports: [Media],
  template: `
    <app-media
      [src]="src()"
      [alt]="alt()"
      [ratio]="ratio()"
      [fit]="fit()"
      [priority]="priority()"
      testId="media"
    />
  `,
})
class Host {
  readonly src = signal<string | null | undefined>(null);
  readonly alt = signal('');
  readonly ratio = signal<MediaRatio>('product');
  readonly fit = signal<MediaFit>('contain');
  readonly priority = signal(false);
}

describe('media', () => {
  async function render(setup: (host: Host) => void = () => {}) {
    const fixture = TestBed.createComponent(Host);
    setup(fixture.componentInstance);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    return {
      element,
      img: () => element.querySelector('img'),
      box: () => element.querySelector('[data-testid="media"]'),
      placeholder: () => element.querySelector('[data-testid="media-placeholder"]'),
      settle: async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      },
    };
  }

  describe('the source contract', () => {
    it('renders the backend path unchanged', async () => {
      // Root-relative is what Frappe stores and what the edge serves. Rewriting it -
      // prefixing a base URL, pointing at a media host - would break the contract the
      // backend actually has.
      const view = await render((h) => h.src.set('/files/photo.jpg'));

      expect(view.img()?.getAttribute('src')).toBe('/files/photo.jpg');
    });

    it('treats null, empty and whitespace as no image at all', async () => {
      for (const value of [null, undefined, '', '   ']) {
        const view = await render((h) => h.src.set(value));

        expect(view.img(), `${JSON.stringify(value)} should render no img`).toBeNull();
        expect(view.placeholder()).not.toBeNull();
      }
    });

    it('normalizes the same way outside a template', () => {
      // The guard exists because a cleared Frappe Attach Image can arrive as "" rather
      // than null, and src="" re-requests the page and then fails as an image.
      expect(mediaUrl('/files/a.jpg')).toBe('/files/a.jpg');
      expect(mediaUrl('  /files/a.jpg  ')).toBe('/files/a.jpg');
      expect(mediaUrl('')).toBeNull();
      expect(mediaUrl('   ')).toBeNull();
      expect(mediaUrl(null)).toBeNull();
      expect(mediaUrl(undefined)).toBeNull();
    });
  });

  describe('the box does not depend on the image', () => {
    it('keeps its ratio whatever the source is', async () => {
      const withImage = await render((h) => h.src.set('/files/photo.jpg'));
      const without = await render((h) => h.src.set(null));

      // Same class on both, so a product with no photograph occupies exactly the same
      // space as one with a photograph and a grid row stays even.
      expect(withImage.box()?.className).toContain('aspect-3/4');
      expect(without.box()?.className).toContain('aspect-3/4');
    });

    it('gives categories their own shape', async () => {
      const view = await render((h) => {
        h.ratio.set('category');
        h.fit.set('cover');
        h.src.set('/files/banner.jpg');
      });

      // Products and categories are deliberately not forced to share a ratio.
      expect(view.box()?.className).toContain('aspect-4/3');
      expect(view.img()?.className).toContain('object-cover');
    });

    it('contains products rather than cropping them', async () => {
      const view = await render((h) => h.src.set('/files/photo.jpg'));

      // The whole product is visible. Cropping to fill would remove the collar of a
      // shirt or the thread of a fitting - the parts that identify it.
      expect(view.img()?.className).toContain('object-contain');
    });
  });

  describe('when an image fails to load', () => {
    it('falls back to the placeholder instead of a broken-image icon', async () => {
      const view = await render((h) => h.src.set('/files/deleted-from-disk.jpg'));
      expect(view.img()).not.toBeNull();

      view.img()?.dispatchEvent(new Event('error'));
      await view.settle();

      expect(view.img()).toBeNull();
      expect(view.placeholder()).not.toBeNull();
      // And the box is unchanged, so nothing reflows around the failure.
      expect(view.box()?.className).toContain('aspect-3/4');
    });
  });

  describe('accessibility', () => {
    it('passes through a name when the image is the subject', async () => {
      const view = await render((h) => {
        h.src.set('/files/photo.jpg');
        h.alt.set('Hex Bolt M10 x 50mm');
      });

      expect(view.img()?.getAttribute('alt')).toBe('Hex Bolt M10 x 50mm');
    });

    it('allows an empty name where adjacent text already identifies it', async () => {
      const view = await render((h) => h.src.set('/files/photo.jpg'));

      // Empty, not missing: an img with no alt attribute is announced by its filename.
      expect(view.img()?.getAttribute('alt')).toBe('');
    });

    it('hides the placeholder from assistive technology', async () => {
      const view = await render((h) => h.src.set(null));

      // The absence of a picture is not information worth announcing.
      expect(view.placeholder()?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('loading', () => {
    it('lazy-loads by default', async () => {
      const view = await render((h) => h.src.set('/files/photo.jpg'));

      // A catalog grid must not queue every image before the page is usable.
      expect(view.img()?.getAttribute('loading')).toBe('lazy');
      expect(view.img()?.getAttribute('fetchpriority')).not.toBe('high');
    });

    it('loads eagerly only when explicitly prioritised', async () => {
      const view = await render((h) => {
        h.src.set('/files/photo.jpg');
        h.priority.set(true);
      });

      expect(view.img()?.getAttribute('loading')).toBe('eager');
      expect(view.img()?.getAttribute('fetchpriority')).toBe('high');
    });
  });
});
