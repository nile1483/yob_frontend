import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearMockRequestLog, mockRequestLog } from '../../../mock-api/core/mock-request-log';
import { MockServerSession } from '../../../mock-api/core/mock-server-session';
import { mockApiInterceptor } from '../../../mock-api/mock-api.interceptor';
import { routes } from '../../app.routes';
import { yobCsrfInterceptor } from '../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../foundation/network/yob-api.config';
import { SessionStore } from '../../foundation/session/session.store';
import { RECENT_PRODUCTS_KEY_PREFIX } from './recent-products.store';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const SUGGESTIONS = 'yob_storefront.api.catalog.get_product_suggestions';

/** The mock buyer's identity, which is what namespaces their recent list. */
const BUYER = 'mock.buyer@example.invalid';

/**
 * The header product typeahead (Phase 26B).
 *
 * Driven through the real `CatalogApi`, the real envelope handling and the mock backend,
 * so what these assert is the request Angular actually composes and the DOM it actually
 * produces. Debounce is driven with fake timers rather than by waiting, so the tests are
 * about behaviour rather than about wall-clock luck.
 */
describe('product search', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(withInterceptors([yobCsrfInterceptor, mockApiInterceptor])),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    clearMockRequestLog();

    TestBed.inject(MockServerSession).signIn('TEST_APP', 'password');
    TestBed.inject(SessionStore).restore().subscribe();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  function suggestionCalls(): readonly string[] {
    return mockRequestLog()
      .filter((record) => record.rpcMethod === SUGGESTIONS)
      .map((record) => record.params['search'] ?? '');
  }

  async function open(url = '/home') {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);

    const settle = async () => {
      for (let i = 0; i < 8; i++) {
        await harness.fixture.whenStable();
        harness.fixture.detectChanges();
      }
    };
    await settle();

    const root = () => harness.fixture.nativeElement as HTMLElement;
    /** The first of the two inputs; both are the same component at two breakpoints. */
    const input = () => root().querySelector('[data-testid="product-search-input"]') as HTMLInputElement;

    return {
      harness,
      root,
      settle,
      input,
      testId: (id: string) => root().querySelector(`[data-testid="${id}"]`),
      all: (id: string) => Array.from(root().querySelectorAll(`[data-testid="${id}"]`)),
      /** Type, then let the debounce elapse and the response land. */
      type: async (value: string) => {
        const element = input();
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        harness.fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(400);
        await settle();
      },
      /** Type without letting the debounce elapse. */
      typeOnly: (value: string) => {
        const element = input();
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        harness.fixture.detectChanges();
      },
      focus: async () => {
        input().dispatchEvent(new Event('focus', { bubbles: true }));
        await settle();
      },
    };
  }

  /* ------------------------------------------------------------- the threshold */

  describe('the three-character floor', () => {
    for (const term of ['', 'b', 'bo']) {
      it(`asks for nothing at ${term.length} characters`, async () => {
        const view = await open();
        await view.type(term);

        // The backend answers an empty list under three characters anyway, so asking
        // could only ever return nothing.
        expect(suggestionCalls()).toEqual([]);
      });
    }

    it('asks once at three characters, after the debounce', async () => {
      const view = await open();
      await view.type('bol');

      expect(suggestionCalls()).toEqual(['bol']);
    });

    it('does not ask once per keystroke', async () => {
      const view = await open();

      // Four keystrokes inside one debounce window.
      view.typeOnly('b');
      view.typeOnly('bo');
      view.typeOnly('bol');
      view.typeOnly('bolt');
      await vi.advanceTimersByTimeAsync(400);
      await view.settle();

      expect(suggestionCalls()).toEqual(['bolt']);
    });

    it('normalises whitespace before deciding and before asking', async () => {
      const view = await open();
      await view.type('  hex   bolt  ');

      // One canonical term, so two spellings of the same search are one request.
      expect(suggestionCalls()).toEqual(['hex bolt']);
    });

    it('treats a whitespace-only term as empty', async () => {
      const view = await open();
      await view.type('    ');

      expect(suggestionCalls()).toEqual([]);
    });
  });

  /* --------------------------------------------------------- stale responses */

  describe('stale responses', () => {
    it('cannot let an older term overwrite a newer one', async () => {
      const view = await open();

      view.typeOnly('bol');
      await vi.advanceTimersByTimeAsync(400);
      view.typeOnly('nut');
      await vi.advanceTimersByTimeAsync(400);
      await view.settle();

      // `switchMap` unsubscribes the older request, so its answer can never paint over
      // the newer one. The panel shows what was typed last.
      const names = view.all('suggestion-name').map((el) => el.textContent?.trim());
      expect(names.join(' ')).toContain('Nut');
      expect(names.join(' ')).not.toContain('Bolt M10 x 50mm');
    });
  });

  /* ------------------------------------------------------------- the results */

  describe('suggestions', () => {
    it('shows the product name and its code', async () => {
      const view = await open();
      await view.type('bolt');

      expect(view.testId('suggestion-name')?.textContent).toContain('Hex Bolt');
      // A B2B buyer often searches by code, so the code is visible - quietly.
      expect(view.testId('suggestion-code')?.textContent).toContain('YOB-BOLT-M10');
    });

    it('finds a product by item code alone', async () => {
      const view = await open();
      await view.type('ANCHOR-HD');

      // Matching is the backend's, shared with the listing. Angular sends the string.
      expect(view.all('product-suggestion')).toHaveLength(1);
      expect(view.testId('suggestion-name')?.textContent).toContain('Through Bolt Anchor');
    });

    it('resolves the image through the existing media helper', async () => {
      const view = await open();
      await view.type('bolt');

      // `Media` is the storefront's one image standard; a missing image falls back to
      // its placeholder rather than a broken icon.
      expect(view.testId('suggestion-media')).not.toBeNull();
    });

    it('shows no money, no unit and no stock', async () => {
      const view = await open();
      await view.type('bolt');

      const panel = view.testId('product-search-panel')?.textContent ?? '';
      // A price in a dropdown is a second place for money to be wrong. The contract
      // carries none, and the row must not invent any.
      expect(panel).not.toMatch(/₹|\d+\.\d{2}/);
      expect(panel).not.toContain('Box');
      expect(panel).not.toContain('Nos');
      expect(panel).not.toMatch(/in stock/i);
    });

    it('navigates to the product page on the backend slug', async () => {
      const view = await open();
      await view.type('bolt');

      const row = view.testId('product-suggestion') as HTMLAnchorElement;
      expect(row.getAttribute('href')).toBe('/catalog/item/hex-bolt-m10-50');

      row.click();
      await view.settle();
      expect(router.url).toBe('/catalog/item/hex-bolt-m10-50');
    });

    it('opens a variant family on the family slug, resolving nothing', async () => {
      const view = await open();
      await view.type('vest');

      const family = view
        .all('product-suggestion')
        .find((row) => row.getAttribute('data-is-template') === 'true') as HTMLAnchorElement;
      expect(family).toBeDefined();
      expect(family.getAttribute('href')).toContain('/catalog/item/');

      family.click();
      await view.settle();

      // The family page decides what a buyer can buy. The header never resolves a
      // variant, and a generated child is never suggested in the first place.
      const rpcs = mockRequestLog().map((record) => record.rpcMethod);
      expect(rpcs.filter((rpc) => rpc.endsWith('resolve_variant'))).toEqual([]);
    });

    it('says so plainly when nothing matches', async () => {
      const view = await open();
      await view.type('zzzzzz');

      expect(view.testId('product-search-empty')).not.toBeNull();
      expect(view.all('product-suggestion')).toHaveLength(0);
    });

    it('closes on Escape', async () => {
      const view = await open();
      await view.type('bolt');
      expect(view.testId('product-search-panel')).not.toBeNull();

      view
        .input()
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await view.settle();

      expect(view.testId('product-search-panel')).toBeNull();
    });

    it('uses only the suggestion endpoint to find products', async () => {
      const view = await open();
      await view.type('bolt');

      // Discovery is the dedicated endpoint's job. A listing call, an item call or a
      // resolver call from the header would each be a different feature leaking in.
      const rpcs = mockRequestLog().map((record) => record.rpcMethod);
      expect(rpcs.filter((rpc) => rpc.endsWith('get_items'))).toEqual([]);
      expect(rpcs.filter((rpc) => rpc.endsWith('get_item'))).toEqual([]);
      expect(rpcs.filter((rpc) => rpc.endsWith('resolve_variant'))).toEqual([]);
    });
  });

  /* ------------------------------------------------------------------- Enter */

  describe('Enter does nothing', () => {
    it('does not navigate, submit, or open the first result', async () => {
      const view = await open('/home');
      await view.type('bolt');
      expect(view.all('product-suggestion').length).toBeGreaterThan(0);

      const before = router.url;
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      view.input().dispatchEvent(event);
      await view.settle();

      // There is no results page, no `/search` route, and no open-the-first-result
      // behaviour. A buyer reaches a product by choosing one.
      expect(router.url).toBe(before);
      expect(router.url).not.toContain('/catalog/item/');
      expect(router.url).not.toContain('search');
      expect(event.defaultPrevented).toBe(true);
    });

    it('is not inside a form, so there is nothing to submit', async () => {
      const view = await open();

      expect(view.input().closest('form')).toBeNull();
    });
  });

  /* -------------------------------------------------------- recent products */

  describe('recent products', () => {
    async function chooseBolt(view: Awaited<ReturnType<typeof open>>) {
      await view.type('bolt');
      (view.testId('product-suggestion') as HTMLElement).click();
      await view.settle();
    }

    it('remembers a product the buyer opened, and shows it on focus', async () => {
      const view = await open();
      await chooseBolt(view);

      await view.focus();
      expect(view.testId('recent-heading')).not.toBeNull();
      expect(view.testId('suggestion-name')?.textContent).toContain('Hex Bolt');
    });

    it('stores nothing a buyer merely typed', async () => {
      const view = await open();
      await view.type('bolt');

      // A typed string is a guess; only a click is a decision. Re-offering "bolr" helps
      // nobody, and the key must hold products rather than queries.
      const raw = localStorage.getItem(`${RECENT_PRODUCTS_KEY_PREFIX}${BUYER}`);
      expect(raw).toBeNull();
    });

    it('keeps the newest first, without duplicates, capped at five', async () => {
      const view = await open();
      await chooseBolt(view);
      await view.type('nut');
      (view.testId('product-suggestion') as HTMLElement).click();
      await view.settle();

      await view.focus();
      let names = view.all('suggestion-name').map((el) => el.textContent?.trim() ?? '');
      expect(names[0]).toContain('Nut');
      expect(names[1]).toContain('Bolt');

      // Re-opening a product moves it back to the top rather than adding a second row.
      await chooseBolt(view);
      await view.focus();
      names = view.all('suggestion-name').map((el) => el.textContent?.trim() ?? '');
      expect(names[0]).toContain('Bolt');
      expect(names.filter((name) => name.includes('Bolt'))).toHaveLength(1);
      expect(names.length).toBeLessThanOrEqual(5);
    });

    it('shows recent products under the threshold, and never under a live query', async () => {
      const view = await open();
      await chooseBolt(view);

      await view.type('nu');
      // Two characters: still the recent list, because nothing has been searched yet.
      expect(view.testId('recent-heading')).not.toBeNull();
      expect(suggestionCalls()).toEqual(['bolt']);

      await view.type('nut');
      // Three: live results replace it entirely. A recent product shown under a live
      // query reads as a match for it.
      expect(view.testId('recent-heading')).toBeNull();
      expect(view.testId('suggestion-name')?.textContent).toContain('Nut');
    });

    it('navigates from a recent row and moves it back to the top', async () => {
      const view = await open();
      await chooseBolt(view);
      await view.type('nut');
      (view.testId('product-suggestion') as HTMLElement).click();
      await view.settle();

      await view.focus();
      (view.testId('product-suggestion') as HTMLElement).click();
      await view.settle();

      expect(router.url).toBe('/catalog/item/hex-nut-m10');
    });

    it('clears the query after choosing, so the next page carries no stale dropdown', async () => {
      const view = await open();
      await chooseBolt(view);

      expect(view.input().value).toBe('');
      expect(view.testId('product-search-panel')).toBeNull();
    });
  });

  /* ------------------------------------------------------- storage failures */

  describe('when storage misbehaves', () => {
    it('treats malformed JSON as no recent products', async () => {
      localStorage.setItem(`${RECENT_PRODUCTS_KEY_PREFIX}${BUYER}`, '{not json');

      const view = await open();
      await view.focus();

      expect(view.testId('recent-heading')).toBeNull();
      expect(view.testId('product-search-panel')).toBeNull();
    });

    it('treats a row of the wrong shape as no recent products', async () => {
      // A value written by an older release parses perfectly and is still not this.
      localStorage.setItem(
        `${RECENT_PRODUCTS_KEY_PREFIX}${BUYER}`,
        JSON.stringify([{ item_code: 'X' }, 'nonsense', 42]),
      );

      const view = await open();
      await view.focus();

      expect(view.testId('recent-heading')).toBeNull();
    });

    it('survives storage that throws on access', async () => {
      const getItem = vi
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('blocked');
        });

      const view = await open();
      await view.focus();

      // Private modes and blocked cookies make even reading throw. The header must not
      // care.
      expect(view.testId('product-search-input')).not.toBeNull();
      getItem.mockRestore();
    });
  });
});
