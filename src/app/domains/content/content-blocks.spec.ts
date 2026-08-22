import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CatalogItemDto } from '../catalog/contracts/catalog.types';
import type {
  BannerCarouselBlockDto,
  ImageBannerBlockDto,
  ProductGridBlockDto,
  PromoGridBlockDto,
  RichTextBlockDto,
} from './contracts/page.types';
import { BannerCarouselBlock } from './parts/banner-carousel-block';
import { ImageBannerBlock } from './parts/image-banner-block';
import { ProductGridBlock } from './parts/product-grid-block';
import { PromoGridBlock } from './parts/promo-grid-block';
import { RichTextBlock } from './parts/rich-text-block';
import { CATALOG_CURRENCY } from '../catalog/catalog.currency';

const CATEGORY_DESTINATION = {
  type: 'storefront_category' as const,
  target: 'fasteners',
  href: '/catalog/fasteners',
  external: false,
  open_in_new_tab: false,
};

const EXTERNAL_DESTINATION = {
  type: 'external_url' as const,
  target: null,
  href: 'https://partner.example.invalid/offer',
  external: true,
  open_in_new_tab: true,
};

const PAGE_DESTINATION = {
  type: 'storefront_page' as const,
  target: 'support',
  href: null,
  external: false,
  open_in_new_tab: false,
};

function listingCard(over: Partial<CatalogItemDto> = {}): CatalogItemDto {
  return {
    name: 'YOB-BOLT-M10',
    item_name: 'Hex Bolt M10',
    slug: 'hex-bolt-m10-50',
    uom: 'Box',
    conversion_factor: 25,
    stock_uom: 'Nos',
    has_variants: 0,
    price_state: 'priced',
    image: null,
    base_price: 12.5,
    rate: 11.25,
    discount_percentage: 10,
    discount_amount: 1.25,
    net_amount: 11.25,
    tax_amount: 0,
    total_amount: 11.25,
    pricing_rule_label: null,
    ...over,
  };
}

/**
 * The five content block renderers (Phase 25E).
 *
 * Each block is driven directly with a payload shaped from the backend's own projector,
 * because what matters is the mapping from contract to DOM: order preserved, destinations
 * shared, merchant values bounded, and nothing computed that the backend already decided.
 */
describe('content blocks', () => {
  // Restored here rather than at the end of each timer test: a failing assertion would
  // otherwise leave fake timers installed and hang every test after it.
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: CATALOG_CURRENCY, useValue: 'INR' }],
    });
  });

  function el(fixture: { nativeElement: unknown }, testId: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
  }

  function all(fixture: { nativeElement: unknown }, testId: string): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testId}"]`),
    );
  }

  function text(fixture: { nativeElement: unknown }): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  // ------------------------------------------------------------- image banner

  describe('image banner', () => {
    function banner(over: Partial<ImageBannerBlockDto> = {}): ImageBannerBlockDto {
      return {
        type: 'image_banner',
        block_name: 'Hero',
        desktop_image: '/files/desktop.png',
        mobile_image: '/files/mobile.png',
        alt_text: 'Our warehouse',
        desktop_height_px: 400,
        mobile_height_px: 220,
        destination: CATEGORY_DESTINATION,
        ...over,
      };
    }

    @Component({ selector: 'banner-host', imports: [ImageBannerBlock], template: `<app-image-banner-block [block]="value()" />` })
    class Host {
      readonly value = signal<ImageBannerBlockDto>(banner());
    }

    async function render(block: ImageBannerBlockDto = banner()) {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.value.set(block);
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    }

    it('renders both assets, so the browser picks before it fetches', async () => {
      const fixture = await render();
      const image = el(fixture, 'content-image');

      expect(image?.getAttribute('data-desktop')).toContain('desktop.png');
      expect(image?.getAttribute('data-mobile')).toContain('mobile.png');
      expect((fixture.nativeElement as HTMLElement).querySelector('source')?.getAttribute('media')).toBe(
        '(min-width: 640px)',
      );
    });

    it('falls back to the one asset it has', async () => {
      const fixture = await render(banner({ mobile_image: null }));

      // Better the desktop asset at both sizes than a blank frame on the breakpoint the
      // merchant did not fill in.
      expect(el(fixture, 'content-image')?.getAttribute('data-desktop')).toContain('desktop.png');
      expect((fixture.nativeElement as HTMLElement).querySelector('source')).toBeNull();
    });

    it('renders the alt text the backend supplied', async () => {
      const fixture = await render();
      expect(el(fixture, 'content-image')?.getAttribute('alt')).toBe('Our warehouse');
    });

    it('applies the configured heights, bounded', async () => {
      const fixture = await render();
      expect(el(fixture, 'banner-frame')?.getAttribute('data-desktop-height')).toBe('400');
      expect(el(fixture, 'banner-frame')?.getAttribute('data-mobile-height')).toBe('220');
    });

    it('clamps a height that would break the page', async () => {
      const fixture = await render(banner({ desktop_height_px: 40000, mobile_height_px: 2 }));

      // A merchant typo must not push every block below it off the screen, or render a
      // sliver. Bounded, never passed through as style text.
      expect(Number(el(fixture, 'banner-frame')?.getAttribute('data-desktop-height'))).toBeLessThanOrEqual(900);
      expect(Number(el(fixture, 'banner-frame')?.getAttribute('data-mobile-height'))).toBeGreaterThanOrEqual(80);
    });

    it('links where the destination says', async () => {
      const fixture = await render();
      expect(el(fixture, 'destination-link')?.getAttribute('href')).toBe('/catalog/fasteners');
    });

    it('is not clickable at all without a destination', async () => {
      const fixture = await render(banner({ destination: null }));

      // Not a link that goes nowhere: no anchor, so nothing looks pressable.
      expect(el(fixture, 'destination-link')).toBeNull();
      expect(el(fixture, 'destination-inert')).not.toBeNull();
    });

    it('opens an external destination safely', async () => {
      const fixture = await render(banner({ destination: EXTERNAL_DESTINATION }));
      const link = el(fixture, 'destination-link');

      expect(link?.getAttribute('href')).toBe('https://partner.example.invalid/offer');
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toContain('noopener');
    });

    it('builds the SPA route for a storefront page destination', async () => {
      const fixture = await render(banner({ destination: PAGE_DESTINATION }));
      expect(el(fixture, 'destination-link')?.getAttribute('href')).toBe('/pages/support');
    });
  });

  // ---------------------------------------------------------------- rich text

  describe('rich text', () => {
    function richText(over: Partial<RichTextBlockDto> = {}): RichTextBlockDto {
      return {
        type: 'rich_text',
        block_name: 'Intro',
        title: 'Who we are',
        html: '<p>Trusted since <strong>1998</strong>.</p>',
        text_alignment: 'center',
        ...over,
      };
    }

    @Component({ selector: 'rich-host', imports: [RichTextBlock], template: `<app-rich-text-block [block]="value()" />` })
    class Host {
      readonly value = signal<RichTextBlockDto>(richText());
    }

    async function render(block: RichTextBlockDto = richText()) {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.value.set(block);
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    }

    it('renders the title and the markup', async () => {
      const fixture = await render();

      expect(el(fixture, 'rich-text-title')?.textContent).toContain('Who we are');
      expect(el(fixture, 'rich-text-body')?.querySelector('strong')?.textContent).toBe('1998');
    });

    it('maps the documented alignment enum to a class of ours', async () => {
      const centred = await render();
      expect(el(centred, 'block-rich-text')?.className).toContain('text-center');

      const left = await render(richText({ text_alignment: 'left' }));
      expect(el(left, 'block-rich-text')?.className).toContain('text-left');
    });

    it('accepts no class or style name from the backend', async () => {
      // The alignment value is looked up, never concatenated into a class, so a value
      // outside the enum cannot reach the DOM.
      const fixture = await render(
        richText({ text_alignment: 'evil-class' as unknown as 'left' }),
      );

      const className = el(fixture, 'block-rich-text')?.className ?? '';
      expect(className).not.toContain('evil-class');
      expect(className).toContain('text-left');
    });

    it('does not execute scripts or inline handlers', async () => {
      const marker = { fired: false };
      vi.stubGlobal('__yobXssProbe', () => {
        marker.fired = true;
      });

      const fixture = await render(
        richText({
          html:
            '<p>ok</p><script>globalThis.__yobXssProbe()</script>' +
            '<img src="x" onerror="globalThis.__yobXssProbe()">',
        }),
      );
      await fixture.whenStable();

      // Angular's sanitiser runs on the binding. The backend sanitises on save too - this
      // is the second boundary, and it is the one that protects the buyer's session.
      const body = el(fixture, 'rich-text-body');
      expect(body?.querySelector('script')).toBeNull();
      expect(body?.querySelector('img')?.getAttribute('onerror')).toBeNull();
      expect(marker.fired).toBe(false);
      expect(body?.textContent).toContain('ok');

      vi.unstubAllGlobals();
    });

    it('neutralises an unsafe URL', async () => {
      const fixture = await render(richText({ html: '<a href="javascript:alert(1)">go</a>' }));

      // Angular's documented neutralisation is to prefix the scheme with `unsafe:`, which
      // no browser will navigate. The assertion is therefore that it is no longer an
      // executable javascript URL, not that the text has vanished.
      const href = el(fixture, 'rich-text-body')?.querySelector('a')?.getAttribute('href') ?? '';
      expect(href.startsWith('javascript:')).toBe(false);
      expect(href).toContain('unsafe:');
    });

    it('grants no sanitiser bypass anywhere in the renderer', async () => {
      // The one file that could mark merchant HTML trusted, asserted not to. Content
      // originating in Frappe is still content someone typed.
      const source = RichTextBlock.toString();
      expect(source).not.toContain('bypassSecurityTrust');
    });
  });

  // ----------------------------------------------------------------- carousel

  describe('banner carousel', () => {
    function slide(title: string, over: Record<string, unknown> = {}) {
      return {
        desktop_image: `/files/${title}.png`,
        mobile_image: null,
        title,
        alt_text: title,
        destination: CATEGORY_DESTINATION,
        ...over,
      };
    }

    function carousel(over: Partial<BannerCarouselBlockDto> = {}): BannerCarouselBlockDto {
      return {
        type: 'banner_carousel',
        block_name: 'Seasonal',
        auto_play: false,
        interval_ms: 3000,
        desktop_height_px: 320,
        mobile_height_px: 200,
        slides: [slide('first'), slide('second'), slide('third', { destination: null })],
        ...over,
      };
    }

    @Component({
      selector: 'carousel-host',
      imports: [BannerCarouselBlock],
      template: `<app-banner-carousel-block [block]="value()" />`,
    })
    class Host {
      readonly value = signal<BannerCarouselBlockDto>(carousel());
    }

    async function render(block: BannerCarouselBlockDto = carousel()) {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.value.set(block);
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    }

    /**
     * Render without awaiting stability.
     *
     * `whenStable()` waits on a task that `vi.useFakeTimers()` has taken control of, so
     * awaiting it under a fake clock never resolves. Change detection is driven directly
     * here, which is all these timer assertions need.
     */
    function renderSync(block: BannerCarouselBlockDto) {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.value.set(block);
      fixture.detectChanges();
      return fixture;
    }

    function tick(fixture: ReturnType<typeof renderSync>, ms: number) {
      vi.advanceTimersByTime(ms);
      fixture.detectChanges();
    }

    async function click(fixture: Awaited<ReturnType<typeof render>>, testId: string) {
      (el(fixture, testId) as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('starts on the merchant first slide', async () => {
      const fixture = await render();

      expect(el(fixture, 'carousel-slide')?.getAttribute('data-index')).toBe('0');
      expect(el(fixture, 'carousel-slide')?.getAttribute('data-title')).toBe('first');
    });

    it('moves forwards and backwards in the merchant order', async () => {
      const fixture = await render();

      await click(fixture, 'carousel-next');
      expect(el(fixture, 'carousel-slide')?.getAttribute('data-title')).toBe('second');

      await click(fixture, 'carousel-previous');
      expect(el(fixture, 'carousel-slide')?.getAttribute('data-title')).toBe('first');
    });

    it('wraps, so neither control is a dead end', async () => {
      const fixture = await render();

      await click(fixture, 'carousel-previous');
      expect(el(fixture, 'carousel-slide')?.getAttribute('data-title')).toBe('third');
    });

    it('gives its controls names and a spoken position', async () => {
      const fixture = await render();

      expect(el(fixture, 'carousel-next')?.getAttribute('aria-label')).toContain('Next');
      expect(el(fixture, 'carousel-previous')?.getAttribute('aria-label')).toContain('Previous');
      expect(el(fixture, 'carousel-next')?.tagName).toBe('BUTTON');
      expect(el(fixture, 'carousel-position')?.getAttribute('aria-live')).toBe('polite');
      expect(el(fixture, 'carousel-position')?.textContent).toContain('1');
    });

    it('links a slide, and leaves one without a destination inert', async () => {
      const fixture = await render();
      expect(el(fixture, 'destination-link')?.getAttribute('href')).toBe('/catalog/fasteners');

      await click(fixture, 'carousel-next');
      await click(fixture, 'carousel-next');
      expect(el(fixture, 'destination-link')).toBeNull();
      expect(el(fixture, 'destination-inert')).not.toBeNull();
    });

    it('opens an external slide in a new tab safely', async () => {
      const fixture = await render(
        carousel({ slides: [slide('promo', { destination: EXTERNAL_DESTINATION })] }),
      );

      expect(el(fixture, 'destination-link')?.getAttribute('target')).toBe('_blank');
      expect(el(fixture, 'destination-link')?.getAttribute('rel')).toContain('noopener');
    });

    it('advances on its own when autoplay is on', () => {
      vi.useFakeTimers();
      const fixture = renderSync(carousel({ auto_play: true, interval_ms: 3000 }));

      expect(el(fixture, 'carousel-slide')?.getAttribute('data-title')).toBe('first');

      tick(fixture, 3000);
      expect(el(fixture, 'carousel-slide')?.getAttribute('data-title')).toBe('second');
    });

    it('stays still when autoplay is off', () => {
      vi.useFakeTimers();
      const fixture = renderSync(carousel({ auto_play: false }));

      tick(fixture, 30000);

      expect(el(fixture, 'carousel-slide')?.getAttribute('data-title')).toBe('first');
    });

    it('clamps an interval a merchant mistyped', () => {
      vi.useFakeTimers();
      const fixture = renderSync(carousel({ auto_play: true, interval_ms: 50 }));

      // 50ms would strobe. The floor is applied, so nothing has moved yet at 100ms.
      tick(fixture, 100);
      expect(el(fixture, 'carousel-slide')?.getAttribute('data-title')).toBe('first');

      tick(fixture, 2000);
      expect(el(fixture, 'carousel-slide')?.getAttribute('data-title')).toBe('second');
    });

    it('stops advancing once the buyer has chosen a slide', () => {
      vi.useFakeTimers();
      const fixture = renderSync(carousel({ auto_play: true, interval_ms: 3000 }));

      (el(fixture, 'carousel-next') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el(fixture, 'carousel-slide')?.getAttribute('data-title')).toBe('second');

      // They have said which slide they want; a timer that overrides that is arguing.
      tick(fixture, 9000);
      expect(el(fixture, 'carousel-slide')?.getAttribute('data-title')).toBe('second');
    });

    it('offers no controls for a single slide', async () => {
      const fixture = await render(carousel({ slides: [slide('only')] }));

      expect(el(fixture, 'carousel-next')).toBeNull();
      expect(el(fixture, 'carousel-previous')).toBeNull();
    });
  });

  // ------------------------------------------------------------- product grid

  describe('product grid', () => {
    function grid(over: Partial<ProductGridBlockDto> = {}): ProductGridBlockDto {
      return {
        type: 'product_grid',
        block_name: 'Featured',
        card_type: 'square',
        item_limit: 12,
        category: 'fasteners',
        items: [
          listingCard(),
          listingCard({
            name: 'YOB-VEST',
            item_name: 'Hi-Vis Vest',
            slug: 'hi-vis-safety-vest',
            has_variants: 1,
            price_state: 'select_options',
            uom: null,
            conversion_factor: null,
            base_price: null,
            rate: null,
            discount_percentage: null,
            discount_amount: null,
            net_amount: null,
            tax_amount: null,
            total_amount: null,
          }),
        ],
        ...over,
      };
    }

    @Component({
      selector: 'grid-host',
      imports: [ProductGridBlock],
      template: `<app-product-grid-block [block]="value()" />`,
    })
    class Host {
      readonly value = signal<ProductGridBlockDto>(grid());
    }

    async function render(block: ProductGridBlockDto = grid()) {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.value.set(block);
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    }

    it('renders through the catalogue own card', async () => {
      const fixture = await render();

      // The same component the category listing uses. A second product card would be a
      // second place for price and UOM behaviour to drift.
      expect(all(fixture, 'item-card')).toHaveLength(2);
      expect(el(fixture, 'item-link')?.getAttribute('href')).toBe('/catalog/item/hex-bolt-m10-50');
    });

    it('shows a simple product with its authoritative price and selling UOM', async () => {
      const fixture = await render();
      const card = all(fixture, 'item-card')[0];

      expect(card?.querySelector('[data-testid="item-rate"]')?.textContent).toContain('11.25');
      expect(card?.querySelector('[data-testid="item-uom"]')?.textContent).toContain('Box');
    });

    it('shows a variant family as Select options, with no money at all', async () => {
      const fixture = await render();
      const family = all(fixture, 'item-card')[1];

      expect(family?.querySelector('[data-testid="item-select-options"]')).not.toBeNull();
      expect(family?.querySelector('[data-testid="item-rate"]')).toBeNull();
      expect(family?.textContent).not.toContain('₹');
    });

    it('computes nothing and resolves nothing', async () => {
      const fixture = await render();
      const rendered = text(fixture);

      // 11.25 / 25 = 0.45 and 11.25 * 25 = 281.25: a converted price appears nowhere. No
      // child variant is chosen to give the family a number either.
      expect(rendered).not.toContain('0.45');
      expect(rendered).not.toContain('281');
      expect(rendered).not.toContain('YOB-VEST-');
    });

    it('keeps the backend item order', async () => {
      const fixture = await render();

      expect(all(fixture, 'item-card').map((card) => card.textContent?.includes('Hex Bolt'))).toEqual([
        true,
        false,
      ]);
    });

    it('renders square and portrait as presentation only', async () => {
      const square = await render(grid({ card_type: 'square' }));
      const portrait = await render(grid({ card_type: 'portrait' }));

      expect(el(square, 'block-product-grid')?.getAttribute('data-card-type')).toBe('square');
      expect(el(portrait, 'block-product-grid')?.getAttribute('data-card-type')).toBe('portrait');

      // Same cards, same data, same rules - a different frame.
      expect(all(square, 'item-card')).toHaveLength(2);
      expect(all(portrait, 'item-card')).toHaveLength(2);
      expect(el(portrait, 'item-rate')?.textContent).toContain('11.25');
      expect(el(square, 'product-grid')?.className).not.toBe(
        el(portrait, 'product-grid')?.className,
      );
    });

    it('renders nothing when the configured category became unusable', async () => {
      const fixture = await render(grid({ category: null, items: [] }));

      // The backend refuses to substitute other products, and neither does this.
      expect(el(fixture, 'block-product-grid')).toBeNull();
      expect(text(fixture)).toBe('');
    });
  });

  // --------------------------------------------------------------- promo grid

  describe('promo grid', () => {
    function card(title: string, destination: unknown = CATEGORY_DESTINATION) {
      return {
        desktop_image: `/files/${title}.png`,
        mobile_image: null,
        title,
        alt_text: title,
        destination,
      } as PromoGridBlockDto['cards'][number];
    }

    function promo(over: Partial<PromoGridBlockDto> = {}): PromoGridBlockDto {
      return {
        type: 'promo_grid',
        block_name: 'Promotions',
        cards_per_row: 3,
        desktop_height_px: 240,
        mobile_height_px: 180,
        cards: [card('first'), card('second', EXTERNAL_DESTINATION), card('third', null)],
        ...over,
      };
    }

    @Component({ selector: 'promo-host', imports: [PromoGridBlock], template: `<app-promo-grid-block [block]="value()" />` })
    class Host {
      readonly value = signal<PromoGridBlockDto>(promo());
    }

    async function render(block: PromoGridBlockDto = promo()) {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.value.set(block);
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    }

    it('keeps the merchant card order', async () => {
      const fixture = await render();

      expect(all(fixture, 'promo-card').map((node) => node.getAttribute('data-title'))).toEqual([
        'first',
        'second',
        'third',
      ]);
    });

    it('renders each card image and title', async () => {
      const fixture = await render();

      expect(all(fixture, 'content-image')[0]?.getAttribute('data-desktop')).toContain('first.png');
      expect(all(fixture, 'promo-card-title')[0]?.textContent).toContain('first');
      expect(all(fixture, 'content-image')[0]?.getAttribute('alt')).toBe('first');
    });

    it('links, opens externally, and leaves an inert card inert', async () => {
      const fixture = await render();
      const links = all(fixture, 'destination-link');

      expect(links[0]?.getAttribute('href')).toBe('/catalog/fasteners');
      expect(links[1]?.getAttribute('target')).toBe('_blank');
      expect(links[1]?.getAttribute('rel')).toContain('noopener');
      expect(all(fixture, 'destination-inert')).toHaveLength(1);
    });

    it('maps cards-per-row through a fixed table', async () => {
      const three = await render();
      const four = await render(promo({ cards_per_row: 4 }));

      expect(el(three, 'promo-grid')?.className).toContain('lg:grid-cols-3');
      expect(el(four, 'promo-grid')?.className).toContain('lg:grid-cols-4');
    });

    it('falls back for a column count it does not support', async () => {
      // Tailwind compiles the classes it can see, so an interpolated `grid-cols-${n}`
      // would name a class that exists in the DOM and nowhere in the stylesheet.
      const fixture = await render(promo({ cards_per_row: 99 }));

      expect(el(fixture, 'promo-grid')?.className).toContain('lg:grid-cols-3');
      expect(el(fixture, 'promo-grid')?.className).not.toContain('99');
    });

    it('carries no financial semantics', async () => {
      const fixture = await render();
      const rendered = text(fixture);

      // Merchandising content, not an offer engine: no price, no discount, no rule.
      expect(rendered).not.toContain('₹');
      expect(rendered.toLowerCase()).not.toContain('pricing rule');
      expect(el(fixture, 'item-rate')).toBeNull();
    });
  });
});
