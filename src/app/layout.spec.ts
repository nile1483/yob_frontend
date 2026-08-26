import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { MockServerSession } from '../mock-api/core/mock-server-session';
import { mockApiInterceptor } from '../mock-api/mock-api.interceptor';
import { routes } from './app.routes';
import { yobCsrfInterceptor } from './foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from './foundation/network/yob-api.config';
import { SessionStore } from './foundation/session/session.store';
import { CONTENT_CONTAINER, SHELL_CONTAINER } from './shells/shell.layout';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

/**
 * The width architecture (Phase 25J).
 *
 * Deliberately structural rather than pixel-based. What matters is **who owns the
 * column**: before this phase the shell's `main` did, which is why a content block could
 * never paint a background past the content width. Now `main` is full width and each
 * band opens its own column.
 *
 * Asserting the relationship - band outside, column inside, and no column above a band -
 * survives a design change; asserting `1152px` would not.
 */
describe('layout architecture', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(withInterceptors([yobCsrfInterceptor, mockApiInterceptor])),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    http = TestBed.inject(HttpTestingController);

    TestBed.inject(MockServerSession).signIn('TEST_APP', 'password');
    TestBed.inject(SessionStore).restore().subscribe();
  });

  afterEach(() => http.verify());

  async function open(url: string): Promise<HTMLElement> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    for (let i = 0; i < 8; i++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
    return harness.fixture.nativeElement as HTMLElement;
  }

  /* ------------------------------------------------------------------ the shell */

  describe('the shell', () => {
    it('no longer constrains routed content', async () => {
      const root = await open('/catalog');
      const main = root.querySelector('[data-testid="page-main"]');

      expect(main).not.toBeNull();
      // The one assertion this whole phase turns on.
      expect(main?.classList.contains('yob-content-container')).toBe(false);
      expect(main?.className ?? '').not.toMatch(/max-w-/);
      expect(main?.className ?? '').toContain('w-full');
    });

    it('keeps the vertical rhythm it always had', async () => {
      const root = await open('/catalog');
      const main = root.querySelector('[data-testid="page-main"]');

      // The gap under the header is the same on every route, so it stayed on `main`
      // rather than being copied into eight pages that could each drift.
      expect(main?.className ?? '').toContain('py-8');
    });

    it('leaves the header and the footer on the shared container', async () => {
      const root = await open('/catalog');

      // Phase 25J is about `main`. The bars keep the column they always had, and it is
      // the same definition the pages use - so the brand, a page title and the footer
      // note still start at one x-position.
      const header = root.querySelector('header > div');
      const footer = root.querySelector('footer > div');
      expect(header?.classList.contains('yob-content-container')).toBe(true);
      expect(footer?.classList.contains('yob-content-container')).toBe(true);
      expect(SHELL_CONTAINER).toBe(CONTENT_CONTAINER);
    });
  });

  /* ------------------------------------------------------- application sections */

  describe('application pages', () => {
    const PAGES: readonly (readonly [string, string])[] = [
      ['/home', 'home-page'],
      ['/catalog', 'catalog-section'],
      ['/catalog/fasteners', 'category-section'],
      ['/catalog/item/hex-bolt-m10-50', 'product-section'],
      ['/cart', 'cart-section'],
      ['/account', 'account-section'],
      ['/orders', 'orders-section'],
      ['/orders/SAL-ORD-2026-00001', 'order-detail-section'],
      ['/checkout', 'checkout-section'],
    ];

    for (const [url, hook] of PAGES) {
      if (hook === 'home-page') {
        continue;
      }

      it(`wraps ${url} in a full-width band with the common column inside`, async () => {
        const root = await open(url);
        const section = root.querySelector(`section.${hook}`);

        expect(section, `${url} has no ${hook}`).not.toBeNull();
        expect(section?.classList.contains('yob-page-section')).toBe(true);

        const column = section?.querySelector(':scope > .yob-content-container');
        expect(column, `${hook} does not open the common column`).not.toBeNull();
      });
    }

    it('gives every application band a source-owned hook, never a merchant style', async () => {
      const root = await open('/cart');

      for (const section of Array.from(root.querySelectorAll('section.yob-page-section'))) {
        // A Content Placement styles its own band and nothing else. An application
        // section must never carry one of the merchant surfaces.
        if (section.getAttribute('data-testid') === 'content-section') {
          continue;
        }
        expect(section.className).not.toMatch(/yob-section-/);
        expect(section.hasAttribute('data-section-style')).toBe(false);
      }
    });
  });

  /* ------------------------------------------------- bands are never capped */

  describe('content bands', () => {
    it('are not nested inside any content column', async () => {
      const root = await open('/home');
      const sections = Array.from(root.querySelectorAll('[data-testid="content-section"]'));

      expect(sections.length).toBeGreaterThan(0);
      for (const section of sections) {
        // A column anywhere above a band would cap its background at the content width,
        // which is the exact bug this phase removes. This is the assertion that stops a
        // future page from quietly re-introducing a wrapper.
        expect(
          section.parentElement?.closest('.yob-content-container'),
          `a band on /home sits inside a column`,
        ).toBeNull();
      }
    });

    it('are not capped on a dynamic Storefront Page either', async () => {
      const root = await open('/pages/about-us');
      const sections = Array.from(root.querySelectorAll('[data-testid="content-section"]'));

      expect(sections.length).toBeGreaterThan(0);
      for (const section of sections) {
        expect(section.parentElement?.closest('.yob-content-container')).toBeNull();
      }

      // The page's own heading still sits in the column, like every other page title.
      const title = root.querySelector('[data-testid="page-title"]');
      expect(title?.closest('.yob-content-container')).not.toBeNull();
    });

    it('are not capped by the slot that positions them', async () => {
      const root = await open('/cart');
      const slot = root.querySelector('[data-testid="content-slot"]');

      expect(slot).not.toBeNull();
      // `ContentSlot` decides WHERE, never how wide. A column on the slot would defeat
      // every band inside it.
      expect(slot?.closest('.yob-content-container')).toBeNull();
      expect(slot?.className ?? '').not.toMatch(/max-w-|yob-content-container/);
    });

    it('sit at their intended boundary, unchanged by the wrappers', async () => {
      const root = await open('/cart');
      const nodes = Array.from(
        root.querySelectorAll('[data-testid="page-main"] section, [data-testid="content-slot"]'),
      );

      // above_cart still comes after the cart's own heading band and before the cart's
      // functionality band. Phase 25J moved wrappers, not slots.
      const above = root.querySelector('[data-slot="above_cart"]');
      const heading = root.querySelector('[data-testid="page-main"] h1');
      expect(above).not.toBeNull();
      expect(heading).not.toBeNull();
      expect(
        heading!.compareDocumentPosition(above!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(nodes.length).toBeGreaterThan(0);
    });
  });

  /* ----------------------------------------------------------- no new requests */

  describe('the refactor is layout only', () => {
    it('adds no request to a page carrying a Product Grid', async () => {
      await open('/home');

      // Same guarantee as Phase 25H, re-asserted because this phase touched every
      // template that renders one.
      http.expectNone((request) => request.url.includes('catalog.'));
    });
  });
});
