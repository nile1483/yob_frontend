import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Type } from '@angular/core';

import {
  ProductDownload,
  ProductImage,
  ProductKeyValue,
  ProductRichText,
  ProductTable,
  ProductVideo,
} from './product-content-blocks';

/**
 * The six product-content block renderers (Phase 27D).
 *
 * TestBed with no HTTP provider anywhere in this file, deliberately: a block renderer
 * that reached for the network would fail to construct rather than quietly fetch.
 */
describe('product content blocks', () => {
  let fixture: ComponentFixture<unknown>;

  function open<T>(component: Type<T>, block: unknown): void {
    fixture = TestBed.createComponent(component) as ComponentFixture<unknown>;
    fixture.componentRef.setInput('block', block);
    fixture.detectChanges();
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function el(selector: string): HTMLElement | null {
    return host().querySelector(selector);
  }

  function all(selector: string): HTMLElement[] {
    return Array.from(host().querySelectorAll(selector));
  }

  describe('rich_text', () => {
    it('renders ordinary prose with its semantics intact', () => {
      open(ProductRichText, {
        type: 'rich_text',
        content: '<p>Zinc plated</p><ul><li>One</li><li>Two</li></ul><a href="/catalog">More</a>',
      });

      expect(el('p')?.textContent).toBe('Zinc plated');
      expect(all('li')).toHaveLength(2);
      expect(el('a')?.getAttribute('href')).toBe('/catalog');
    });

    it('drops a script element', () => {
      open(ProductRichText, {
        type: 'rich_text',
        content: '<p>Safe</p><script>window.__pwned = true;</script>',
      });

      expect(host().querySelector('script')).toBeNull();
      expect(host().innerHTML).not.toContain('__pwned');
      // The surrounding prose survives - sanitising is not the same as refusing.
      expect(el('p')?.textContent).toBe('Safe');
    });

    it('strips an inline event handler', () => {
      open(ProductRichText, {
        type: 'rich_text',
        content: '<img src="x" onerror="window.__pwned = true">',
      });

      const img = el('img');
      expect(img?.getAttribute('onerror')).toBeNull();
      expect(host().innerHTML).not.toContain('onerror');
    });

    it('neutralises a javascript: href', () => {
      open(ProductRichText, {
        type: 'rich_text',
        // eslint-disable-next-line no-script-url
        content: '<a href="javascript:window.__pwned=1">Click</a>',
      });

      // Angular does not delete the href, it defuses it: the scheme is rewritten to
      // `unsafe:`, which no browser will navigate or execute. Asserting the prefix is
      // the accurate proof - asserting the absence of the substring would fail against
      // a correctly sanitised value.
      const href = el('a')?.getAttribute('href') ?? '';
      expect(href.startsWith('unsafe:')).toBe(true);
      expect(href).not.toMatch(/^javascript:/i);
    });

    it('leaves nothing executable behind, however it is spelled', () => {
      // A trust bypass would show up here as surviving markup. The source-level guard
      // that no `bypassSecurityTrust*` call exists at all lives in the e2e purity scan,
      // which can read files - unit tests run in a browser with no filesystem.
      open(ProductRichText, {
        type: 'rich_text',
        content:
          '<div onclick="window.__a=1"><script>window.__b=1</script>' +
          '<iframe src="https://evil.test"></iframe>' +
          '<img src=x onerror="window.__c=1"></div>',
      });

      const html = host().innerHTML;
      expect(html).not.toContain('onclick');
      expect(html).not.toContain('onerror');
      expect(host().querySelector('script')).toBeNull();
      expect(host().querySelector('iframe')).toBeNull();
    });
  });

  describe('key_value', () => {
    const ITEMS = [
      { key: 'Material', value: 'Steel' },
      { key: 'Finish', value: 'Zinc plated' },
      { key: 'Thread', value: 'M10 x 1.5' },
    ];

    it('renders each pair', () => {
      open(ProductKeyValue, { type: 'key_value', items: ITEMS });

      expect(all('dt').map((node) => node.textContent?.trim())).toEqual([
        'Material',
        'Finish',
        'Thread',
      ]);
      expect(all('dd').map((node) => node.textContent?.trim())).toEqual([
        'Steel',
        'Zinc plated',
        'M10 x 1.5',
      ]);
    });

    it('keeps the backend order rather than alphabetising', () => {
      // Alphabetical would be Finish / Material / Thread. A specification list reads in
      // the order an engineer wrote it.
      open(ProductKeyValue, { type: 'key_value', items: ITEMS });

      expect(all('dt')[0]?.textContent?.trim()).toBe('Material');
    });

    it('uses dl/dt/dd so a pair is announced as a pair', () => {
      open(ProductKeyValue, { type: 'key_value', items: ITEMS });

      expect(el('dl')).not.toBeNull();
      expect(all('dt')).toHaveLength(3);
      expect(all('dd')).toHaveLength(3);
    });

    it('lets a long value wrap instead of widening the row', () => {
      open(ProductKeyValue, {
        type: 'key_value',
        items: [{ key: 'Standards', value: 'ISO 4014, DIN 931, BS 3692 and equivalents'.repeat(4) }],
      });

      expect(el('dd')?.className).toContain('break-words');
    });

    it('renders an empty list without throwing', () => {
      expect(() => open(ProductKeyValue, { type: 'key_value', items: [] })).not.toThrow();
      expect(all('dt')).toHaveLength(0);
    });
  });

  describe('table', () => {
    const TABLE = {
      type: 'table',
      columns: ['Size', 'Length', 'Weight'],
      rows: [
        ['M10', '50 mm', '38 g'],
        ['M12', '65 mm', '54 g'],
      ],
    };

    it('renders headers in the given order, scoped as columns', () => {
      open(ProductTable, TABLE);

      const headers = all('th');
      expect(headers.map((node) => node.textContent?.trim())).toEqual([
        'Size',
        'Length',
        'Weight',
      ]);
      for (const header of headers) {
        expect(header.getAttribute('scope')).toBe('col');
      }
    });

    it('renders rows in the given order', () => {
      open(ProductTable, TABLE);

      const rows = all('tbody tr').map((row) =>
        Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim()),
      );

      expect(rows).toEqual([
        ['M10', '50 mm', '38 g'],
        ['M12', '65 mm', '54 g'],
      ]);
    });

    it('handles a six-column table', () => {
      open(ProductTable, {
        type: 'table',
        columns: ['A', 'B', 'C', 'D', 'E', 'F'],
        rows: [['1', '2', '3', '4', '5', '6']],
      });

      expect(all('th')).toHaveLength(6);
      expect(all('tbody td')).toHaveLength(6);
    });

    it('handles a two-column table', () => {
      open(ProductTable, { type: 'table', columns: ['A', 'B'], rows: [['1', '2']] });

      expect(all('th')).toHaveLength(2);
    });

    it('does not transpose rows into columns', () => {
      open(ProductTable, TABLE);

      // Three headers and two body rows - not two headers and three rows.
      expect(all('th')).toHaveLength(3);
      expect(all('tbody tr')).toHaveLength(2);
    });

    it('scrolls inside its own wrapper rather than widening the page', () => {
      open(ProductTable, TABLE);

      expect(el('[data-testid="product-block-table"]')?.className).toContain('overflow-x-auto');
      // The page-level escape hatches a wide table must never reach for.
      expect(host().innerHTML).not.toContain('w-screen');
      expect(host().innerHTML).not.toContain('100vw');
    });

    it('renders a short row as blank cells rather than throwing', () => {
      // The contract pads every row to columns.length. Defence, not routine.
      expect(() =>
        open(ProductTable, { type: 'table', columns: ['A', 'B', 'C'], rows: [['1']] }),
      ).not.toThrow();

      expect(all('tbody td').map((cell) => cell.textContent?.trim())).toEqual(['1', '', '']);
    });

    it('renders an empty table safely', () => {
      expect(() => open(ProductTable, { type: 'table', columns: [], rows: [] })).not.toThrow();
    });
  });

  describe('image', () => {
    it('resolves the stored path through the shared media helper', () => {
      open(ProductImage, {
        type: 'image',
        image: '/files/diagram.png',
        alt_text: 'Dimension drawing',
        caption: null,
      });

      expect(el('img')?.getAttribute('src')).toBe('/files/diagram.png');
    });

    it('uses the merchant alt text when there is one', () => {
      open(ProductImage, {
        type: 'image',
        image: '/files/diagram.png',
        alt_text: 'Dimension drawing',
        caption: null,
      });

      expect(el('img')?.getAttribute('alt')).toBe('Dimension drawing');
    });

    it('marks an unlabelled content image decorative rather than naming it', () => {
      // Deliberately unlike the gallery: calling a torque chart "Hex Bolt M10" would be
      // worse than saying nothing, so a blank alt stays blank.
      for (const alt of [null, '', '   ']) {
        open(ProductImage, { type: 'image', image: '/files/d.png', alt_text: alt, caption: null });
        expect(el('img')?.getAttribute('alt')).toBe('');
      }
    });

    it('shows a caption as a figcaption', () => {
      open(ProductImage, {
        type: 'image',
        image: '/files/d.png',
        alt_text: null,
        caption: 'Dimensions in millimetres',
      });

      expect(el('figcaption')?.textContent?.trim()).toBe('Dimensions in millimetres');
    });

    it('reserves no caption row when there is none', () => {
      for (const caption of [null, '', '  ']) {
        open(ProductImage, { type: 'image', image: '/files/d.png', alt_text: null, caption });
        expect(el('figcaption')).toBeNull();
      }
    });

    it('keeps its natural shape instead of a gallery crop', () => {
      open(ProductImage, { type: 'image', image: '/files/d.png', alt_text: null, caption: null });

      const className = el('img')?.className ?? '';
      expect(className).toContain('h-auto');
      expect(className).toContain('max-w-full');
      // No fixed-ratio box, which is what a diagram must not be forced into.
      expect(className).not.toContain('aspect-');
      expect(className).not.toContain('object-cover');
    });

    it('loads lazily, never with hero priority', () => {
      open(ProductImage, { type: 'image', image: '/files/d.png', alt_text: null, caption: null });

      expect(el('img')?.getAttribute('loading')).toBe('lazy');
      expect(el('img')?.getAttribute('fetchpriority')).toBeNull();
    });

    it('renders nothing for a blank image path', () => {
      open(ProductImage, { type: 'image', image: '   ', alt_text: null, caption: null });

      expect(el('img')).toBeNull();
    });
  });

  describe('download', () => {
    it('renders a real link to the stored file', () => {
      open(ProductDownload, {
        type: 'download',
        file: '/files/manual.pdf',
        label: 'Installation Manual',
        description: null,
      });

      const link = el('a');
      expect(link?.tagName).toBe('A');
      expect(link?.getAttribute('href')).toBe('/files/manual.pdf');
    });

    it('uses the merchant label', () => {
      open(ProductDownload, {
        type: 'download',
        file: '/files/manual.pdf',
        label: 'Installation Manual',
        description: null,
      });

      expect(el('a')?.textContent).toContain('Installation Manual');
    });

    it('falls back to the file name when the label is blank', () => {
      for (const label of [null, '', '  ']) {
        open(ProductDownload, { type: 'download', file: '/files/torque-chart.pdf', label, description: null });
        expect(el('a')?.textContent).toContain('torque-chart.pdf');
      }
    });

    it('falls back to a generic phrase when the name is unreadable', () => {
      open(ProductDownload, { type: 'download', file: '/files/', label: null, description: null });

      expect(el('a')?.textContent).toContain('Download file');
    });

    it('shows a description only when there is one', () => {
      open(ProductDownload, {
        type: 'download',
        file: '/files/m.pdf',
        label: 'Manual',
        description: 'Torque figures.',
      });
      expect(el('[data-testid="product-download-description"]')?.textContent?.trim()).toBe(
        'Torque figures.',
      );

      open(ProductDownload, { type: 'download', file: '/files/m.pdf', label: 'Manual', description: '  ' });
      expect(el('[data-testid="product-download-description"]')).toBeNull();
    });

    it('opens in a new tab without handing over the opener', () => {
      open(ProductDownload, { type: 'download', file: '/files/m.pdf', label: 'Manual', description: null });

      expect(el('a')?.getAttribute('target')).toBe('_blank');
      expect(el('a')?.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('renders nothing for a blank file path', () => {
      open(ProductDownload, { type: 'download', file: '', label: 'Manual', description: null });

      expect(el('a')).toBeNull();
    });
  });

  describe('video', () => {
    it('plays a direct file with controls and no autoplay', () => {
      open(ProductVideo, { type: 'video', url: 'https://cdn.example.test/demo.mp4?v=1' });

      const video = el('video');
      expect(video).not.toBeNull();
      expect(video?.getAttribute('src')).toBe('https://cdn.example.test/demo.mp4?v=1');
      expect(video?.hasAttribute('controls')).toBe(true);
      expect(video?.getAttribute('preload')).toBe('metadata');
      expect(video?.hasAttribute('playsinline')).toBe(true);
      expect(video?.hasAttribute('autoplay')).toBe(false);
      expect(video?.hasAttribute('loop')).toBe(false);
    });

    it('links a provider page instead of embedding it', () => {
      for (const url of [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://vimeo.com/123456789',
        'https://example.test/how-it-works',
      ]) {
        open(ProductVideo, { type: 'video', url });

        const link = el('[data-testid="product-block-video-link"]');
        expect(link?.getAttribute('href')).toBe(url);
        expect(link?.getAttribute('target')).toBe('_blank');
        expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
        expect(link?.textContent?.trim()).toBe('Watch video');
        expect(el('video')).toBeNull();
      }
    });

    it('renders nothing at all for an unsafe or malformed URL', () => {
      for (const url of [
        // eslint-disable-next-line no-script-url
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'not a url',
        '',
      ]) {
        open(ProductVideo, { type: 'video', url });

        expect(el('video')).toBeNull();
        expect(el('a')).toBeNull();
      }
    });

    it('never produces an iframe, for any input', () => {
      for (const url of [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://player.vimeo.com/video/123456789',
        'https://cdn.example.test/demo.mp4',
        'https://example.test/embed',
      ]) {
        open(ProductVideo, { type: 'video', url });
        expect(host().querySelector('iframe'), `${url} produced an iframe`).toBeNull();
      }
    });
  });
});
