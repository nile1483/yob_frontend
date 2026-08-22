import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { MockServerSession } from '../../../../mock-api/core/mock-server-session';
import { mockApiInterceptor } from '../../../../mock-api/mock-api.interceptor';
import { MockApiScenario } from '../../../../mock-api/scenarios/mock-scenario';
import { routes } from '../../../app.routes';
import { yobCsrfInterceptor } from '../../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../../foundation/network/yob-api.config';
import { SessionStore } from '../../../foundation/session/session.store';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

/**
 * Category merchandising filters, through the real route tree and the mock backend.
 *
 * The unit of behaviour here is **the request Angular makes and the URL it leaves
 * behind** - what the buyer sees is the listing the backend returned for it. Matching is
 * the backend's: these tests never assert that "steel OR aluminium" was computed
 * correctly, only that the grouped keys arrived and that the state around them survives a
 * reload, a back button and a category change.
 */
describe('category filters', () => {
  let http: HttpTestingController;
  let scenario: MockApiScenario;
  let router: Router;
  let location: Location;

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
    scenario = TestBed.inject(MockApiScenario);
    router = TestBed.inject(Router);
    location = TestBed.inject(Location);

    TestBed.inject(MockServerSession).signIn('TEST_APP', 'password');
    TestBed.inject(SessionStore).restore().subscribe();
  });

  afterEach(() => {
    scenario.reset();
    http.verify();
  });

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await settle(harness);

    const root = () => harness.fixture.nativeElement as HTMLElement;
    return {
      harness,
      root,
      settle: () => settle(harness),
      testId: (id: string) => root().querySelector(`[data-testid="${id}"]`),
      all: (id: string) => Array.from(root().querySelectorAll(`[data-testid="${id}"]`)),
      cards: () => Array.from(root().querySelectorAll('[data-testid="item-card"]')),
      codes: () =>
        Array.from(root().querySelectorAll('[data-testid="item-card"]')).map(
          (card) => (card.textContent ?? '').match(/YOB-[A-Z0-9-]+/)?.[0] ?? '',
        ),
      value: (filterKey: string, valueKey: string) =>
        root().querySelector(
          `[data-testid="filter-value"][data-filter="${filterKey}"][data-value="${valueKey}"]`,
        ) as HTMLInputElement | null,
    };
  }

  /** Let the listing and filter requests land; both resolve through the mock. */
  async function settle(harness: RouterTestingHarness): Promise<void> {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }

  /** The `storefront_filters` parameter currently in the address bar, parsed. */
  function urlSelection(): Record<string, string[]> | null {
    const query = location.path().split('?')[1] ?? '';
    const raw = new URLSearchParams(query).get('storefront_filters');
    return raw === null ? null : (JSON.parse(raw) as Record<string, string[]>);
  }

  describe('loading the projection', () => {
    it('asks for the active category filters and renders them in backend order', async () => {
      const view = await open('/catalog/fasteners');

      expect(view.all('filter-group').map((el) => el.getAttribute('data-filter'))).toEqual([
        'material',
        'finish',
      ]);
      expect(view.all('filter-label').map((el) => el.textContent?.trim())).toEqual([
        'Material',
        'Finish',
      ]);
    });

    it('preserves the merchant order of values, rather than sorting them', async () => {
      const view = await open('/catalog/fasteners');

      const material = view
        .all('filter-value')
        .filter((el) => el.getAttribute('data-filter') === 'material')
        .map((el) => el.getAttribute('data-value'));

      // Steel before Stainless: alphabetical would reverse them.
      expect(material).toEqual(['steel', 'stainless']);
    });

    it('shows no filter UI for a category with no Filter Set', async () => {
      const view = await open('/catalog/safety-equipment');

      expect(view.testId('category-filters')).toBeNull();
      expect(view.testId('filter-panel')).toBeNull();
      // The listing itself is unaffected.
      expect(view.cards().length).toBeGreaterThan(0);
    });

    it('shows no counts anywhere', async () => {
      const view = await open('/catalog/fasteners');

      // The contract publishes none, so a number beside a value could only be invented.
      const panel = view.testId('filter-panel')?.textContent ?? '';
      expect(panel).not.toMatch(/\(\d+\)/);
      expect(panel).not.toMatch(/\d+\s*(items|products|results)/i);
    });
  });

  describe('selecting', () => {
    it('sends one selected value and narrows the listing', async () => {
      const view = await open('/catalog/fasteners');
      expect(view.cards()).toHaveLength(4);

      view.value('material', 'steel')?.click();
      await view.settle();

      expect(urlSelection()).toEqual({ material: ['steel'] });
      expect(view.codes().sort()).toEqual(['YOB-BOLT-M10', 'YOB-NUT-M10']);
    });

    it('sends several values of one filter', async () => {
      const view = await open('/catalog/fasteners');

      view.value('material', 'steel')?.click();
      await view.settle();
      view.value('material', 'stainless')?.click();
      await view.settle();

      // Grouped under one key: the backend ORs them, and Angular does not.
      expect(urlSelection()).toEqual({ material: ['stainless', 'steel'] });
      expect(view.cards()).toHaveLength(4);
    });

    it('sends several filters together', async () => {
      const view = await open('/catalog/fasteners');

      view.value('material', 'steel')?.click();
      await view.settle();
      view.value('finish', 'black')?.click();
      await view.settle();

      expect(urlSelection()).toEqual({ finish: ['black'], material: ['steel'] });
      // Steel AND black is the nut alone - but that is the backend's arithmetic, not ours.
      expect(view.codes()).toEqual(['YOB-NUT-M10']);
    });

    it('normalises the URL however the buyer clicked', async () => {
      const view = await open('/catalog/fasteners');

      view.value('finish', 'black')?.click();
      await view.settle();
      view.value('material', 'stainless')?.click();
      await view.settle();
      view.value('material', 'steel')?.click();
      await view.settle();

      const raw = new URLSearchParams(location.path().split('?')[1] ?? '').get(
        'storefront_filters',
      );
      expect(raw).toBe('{"finish":["black"],"material":["stainless","steel"]}');
    });

    it('marks the active selection in the controls', async () => {
      const view = await open('/catalog/fasteners');
      view.value('material', 'steel')?.click();
      await view.settle();

      expect(view.value('material', 'steel')?.checked).toBe(true);
      expect(view.value('material', 'stainless')?.checked).toBe(false);
    });
  });

  describe('clearing', () => {
    it('clears one filter and keeps the rest', async () => {
      const view = await open(
        '/catalog/fasteners?storefront_filters=' +
          encodeURIComponent('{"finish":["black"],"material":["steel"]}'),
      );

      (view.root().querySelector('[data-testid="filter-clear"][data-filter="material"]') as HTMLElement)
        ?.click();
      await view.settle();

      expect(urlSelection()).toEqual({ finish: ['black'] });
    });

    it('clears everything and removes the parameter', async () => {
      const view = await open(
        '/catalog/fasteners?storefront_filters=' + encodeURIComponent('{"material":["steel"]}'),
      );

      (view.testId('filters-clear-all') as HTMLElement)?.click();
      await view.settle();

      // Absent, not `{}`: an empty selection is the absence of a constraint.
      expect(urlSelection()).toBeNull();
      expect(view.cards()).toHaveLength(4);
    });
  });

  describe('URL state', () => {
    it('restores a selection from the URL on load', async () => {
      const view = await open(
        '/catalog/fasteners?storefront_filters=' + encodeURIComponent('{"material":["steel"]}'),
      );

      expect(view.value('material', 'steel')?.checked).toBe(true);
      expect(view.codes().sort()).toEqual(['YOB-BOLT-M10', 'YOB-NUT-M10']);
    });

    it('recovers from a malformed selection without an error', async () => {
      const view = await open('/catalog/fasteners?storefront_filters=' + encodeURIComponent('not-json'));

      // Fails safe to the plain listing, and rewrites the address bar so the URL and the
      // listing agree.
      expect(view.cards()).toHaveLength(4);
      expect(view.testId('items-filter-error')).toBeNull();
      expect(urlSelection()).toBeNull();
    });

    it('drops selections the category does not offer', async () => {
      const view = await open(
        '/catalog/fasteners?storefront_filters=' +
          encodeURIComponent('{"voltage":["230v"],"material":["steel"]}'),
      );

      // Reconciled before the request, so the backend never sees the unknown key.
      expect(urlSelection()).toEqual({ material: ['steel'] });
      expect(view.testId('items-filter-error')).toBeNull();
    });
  });

  describe('working with the rest of the listing', () => {
    it('keeps sorting available and combined with filters', async () => {
      const view = await open(
        '/catalog/fasteners?storefront_filters=' + encodeURIComponent('{"material":["stainless"]}'),
      );

      const select = view.testId('item-sort') as HTMLSelectElement;
      select.value = 'name_desc';
      select.dispatchEvent(new Event('change'));
      await view.settle();

      // Both still apply: the filter narrowed the set to the two stainless rows, and the
      // sort ordered what remains - Z to A, so "Heavy Duty..." precedes "Flat Washer".
      expect(urlSelection()).toEqual({ material: ['stainless'] });
      expect(view.codes()).toEqual(['YOB-ANCHOR-HD-12', 'YOB-WASH-M10']);
    });

    it('pages through a filtered listing, and never reuses a cursor across a change', async () => {
      const view = await open(
        '/catalog/bulk-fasteners?storefront_filters=' + encodeURIComponent('{"grade":["a"]}'),
      );

      // 26 Grade A rows at a page size of 24: filtered, and still more than one page.
      expect(view.cards()).toHaveLength(24);

      (view.testId('load-more') as HTMLElement)?.click();
      await view.settle();
      expect(view.cards()).toHaveLength(26);

      // Changing the selection restarts at page one. The mock refuses a cursor issued
      // under a different selection with `cursor_invalid`, so a reused one would surface
      // here as an error rather than a silent mismatch.
      view.value('grade', 'b')?.click();
      await view.settle();

      expect(view.testId('items-error')).toBeNull();
      expect(view.testId('items-filter-error')).toBeNull();
      // Grade A *and* B now: all 30 rows match, so the listing is back to a first page of
      // 24 with more to come - not 26 rows continued from the previous cursor.
      expect(urlSelection()).toEqual({ grade: ['a', 'b'] });
      expect(view.cards()).toHaveLength(24);
      expect(view.testId('load-more')).not.toBeNull();
    });

    it('leaves simple and variant-family cards exactly as they were', async () => {
      const view = await open('/catalog/safety-equipment');

      const family = view.cards().find((card) => (card.textContent ?? '').includes('Hi-Vis'));
      const simple = view.cards().find((card) => (card.textContent ?? '').includes('Goggles'));

      expect(family?.querySelector('[data-testid="item-select-options"]')).not.toBeNull();
      expect(family?.querySelector('[data-testid="item-rate"]')).toBeNull();
      expect(family?.textContent).not.toContain('₹');
      expect(simple?.querySelector('[data-testid="item-rate"]')?.textContent).toContain('240');
    });
  });

  describe('when the filter projection itself fails', () => {
    it('still lists the products, without a filter panel', async () => {
      scenario.scenario.set('category-filters-unavailable');
      const view = await open('/catalog/fasteners');

      // Facets are decoration; the products are the page. Waiting for a projection that
      // never arrives left a spinner and an empty category - much worse than no panel.
      expect(view.cards()).toHaveLength(4);
      expect(view.testId('category-filters')).toBeNull();
      expect(view.testId('items-loading')).toBeNull();
      expect(view.testId('items-error')).toBeNull();
    });

    it('drops a URL selection it cannot validate, rather than sending it blind', async () => {
      scenario.scenario.set('category-filters-unavailable');
      const view = await open(
        '/catalog/fasteners?storefront_filters=' + encodeURIComponent('{"material":["steel"]}'),
      );

      // With no projection there is nothing to check the keys against, and sending them
      // unvalidated would only invite `storefront_filter_unknown`.
      expect(urlSelection()).toBeNull();
      expect(view.cards()).toHaveLength(4);
    });
  });

  describe('changing category', () => {
    it('asks the new category for its own filters and drops what it does not offer', async () => {
      const view = await open(
        '/catalog/fasteners?storefront_filters=' + encodeURIComponent('{"material":["steel"]}'),
      );
      expect(urlSelection()).toEqual({ material: ['steel'] });

      await view.harness.navigateByUrl(
        '/catalog/bulk-fasteners?storefront_filters=' + encodeURIComponent('{"material":["steel"]}'),
      );
      await view.settle();

      // `material` belongs to the previous category. It is not inherited, not carried and
      // not sent - the new category publishes `grade` and nothing else.
      expect(view.all('filter-group').map((el) => el.getAttribute('data-filter'))).toEqual(['grade']);
      expect(urlSelection()).toBeNull();
      expect(view.testId('items-filter-error')).toBeNull();
    });
  });

  describe('when the backend refuses a selection', () => {
    it('explains it, offers to clear, and does not retry', async () => {
      // A selection the projection allows but the backend refuses - the shape of a
      // genuinely stale facet list.
      scenario.scenario.set('storefront-filter-refused');
      const view = await open(
        '/catalog/fasteners?storefront_filters=' + encodeURIComponent('{"material":["steel"]}'),
      );

      expect(view.testId('items-filter-error')).not.toBeNull();
      expect(view.testId('items-filter-error')?.textContent).toContain('no longer available');
      // Not the generic retry: repeating a refused selection is refused again.
      expect(view.testId('items-retry')).toBeNull();
      expect(view.testId('items-clear-filters')).not.toBeNull();
      expect(view.root().textContent).not.toContain('storefront_filter');

      (view.testId('items-clear-filters') as HTMLElement)?.click();
      await view.settle();

      // Clearing is a different request, and it succeeds.
      expect(urlSelection()).toBeNull();
      expect(view.testId('items-filter-error')).toBeNull();
    });
  });

  describe('no ERPNext Item Group', () => {
    it('never appears in a filter projection, a request or the URL', async () => {
      const view = await open('/catalog/fasteners');
      view.value('material', 'steel')?.click();
      await view.settle();

      const panel = view.testId('filter-panel')?.textContent ?? '';
      expect(panel.toLowerCase()).not.toContain('item group');
      expect(panel.toLowerCase()).not.toContain('item_group');
      expect(location.path()).not.toContain('item_group');
      expect(JSON.stringify(urlSelection())).not.toContain('item_group');
    });
  });
});
