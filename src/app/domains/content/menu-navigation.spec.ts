import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  type TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { YOB_API_CONFIG, type YobApiConfig } from '../../foundation/network/yob-api.config';
import { SecureNav } from '../../shells/secure/parts/secure-nav';
import { destinationRoute, isExternalDestination } from './contracts/cms.types';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

/** A menu shaped from API 3.4.0 `MenuResponse`, covering every destination type. */
function menuPayload(over: Record<string, unknown> = {}) {
  return {
    message: {
      data: {
        key: 'main',
        label: 'Main Menu',
        items: [
          {
            label: 'Catalog',
            type: 'catalog',
            destination: {
              type: 'catalog',
              target: null,
              href: '/catalog',
              external: false,
              open_in_new_tab: false,
            },
            children: [],
          },
          {
            label: 'Tools',
            type: 'group',
            destination: null,
            children: [
              {
                label: 'Power Tools',
                type: 'storefront_category',
                destination: {
                  type: 'storefront_category',
                  target: 'power-tools',
                  href: '/catalog/power-tools',
                  external: false,
                  open_in_new_tab: false,
                },
                children: [],
              },
              {
                label: 'Hex Bolt',
                type: 'product',
                destination: {
                  type: 'product',
                  target: 'hex-bolt-m10-50',
                  href: '/catalog/item/hex-bolt-m10-50',
                  external: false,
                  open_in_new_tab: false,
                },
                children: [],
              },
            ],
          },
          {
            label: 'About Us',
            type: 'storefront_page',
            destination: {
              type: 'storefront_page',
              target: 'about-us',
              href: null,
              external: false,
              open_in_new_tab: false,
            },
            children: [],
          },
          {
            label: 'Supplier',
            type: 'external_url',
            destination: {
              type: 'external_url',
              target: null,
              href: 'https://supplier.example.invalid/',
              external: true,
              open_in_new_tab: true,
            },
            children: [],
          },
          {
            label: 'Brochure',
            type: 'external_url',
            destination: {
              type: 'external_url',
              target: null,
              href: 'https://files.example.invalid/b.pdf',
              external: true,
              open_in_new_tab: false,
            },
            children: [],
          },
          {
            label: 'Seasonal',
            type: 'storefront_category',
            destination: null,
            children: [],
          },
        ],
        ...over,
      },
      notice: 'Menu loaded',
    },
  };
}

/**
 * Merchant-configured navigation (Phase 25D).
 *
 * The tree is the backend's published output: it has already had disabled items, dead
 * destinations and emptied groups removed. So these tests are about **rendering the
 * projection faithfully** - order, destination mapping, group semantics - and never about
 * re-deciding what should be published.
 */
describe('merchant navigation', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<SecureNav>;

  async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  }

  function all(testId: string): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testId}"]`),
    );
  }

  function byLabel(testId: string, label: string): HTMLElement | undefined {
    return all(testId).find((node) => node.getAttribute('data-label') === label);
  }

  function pendingMenu(): TestRequest {
    return http.expectOne((r) => r.url.includes('get_menu'));
  }

  async function render(payload: object = menuPayload()): Promise<void> {
    fixture = TestBed.createComponent(SecureNav);
    fixture.detectChanges();
    pendingMenu().flush(payload);
    await settle();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('loading', () => {
    it('asks for the configured menu by key', async () => {
      fixture = TestBed.createComponent(SecureNav);
      fixture.detectChanges();

      const request = pendingMenu();
      expect(request.request.method).toBe('GET');
      expect(request.request.params.get('menu_key')).toBe('main');

      request.flush(menuPayload());
      await settle();
    });

    it('renders the backend tree in the backend order', async () => {
      await render();

      // The merchant's order, not alphabetical and not re-ranked.
      const labels = all('nav-link')
        .concat(all('nav-group'), all('nav-inert'))
        .map((node) => node.getAttribute('data-label'));

      expect(labels).toEqual(
        expect.arrayContaining(['Catalog', 'Tools', 'About Us', 'Supplier', 'Brochure', 'Seasonal']),
      );
      const rendered = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(rendered.indexOf('Catalog')).toBeLessThan(rendered.indexOf('Tools'));
      expect(rendered.indexOf('Tools')).toBeLessThan(rendered.indexOf('About Us'));
    });

    it('shows only the application controls when the menu is unavailable', async () => {
      fixture = TestBed.createComponent(SecureNav);
      fixture.detectChanges();
      pendingMenu().flush(
        { message: { errors: [{ code: 'menu_not_found', detail: 'never rendered' }] } },
        { status: 404, statusText: 'Not Found' },
      );
      await settle();

      // A missing menu is indistinguishable from a store with none configured, so the
      // shell simply carries on. No banner, and above all no retry.
      //
      // Since Phase 26B the application's own controls are no longer in this row - the
      // cart and the account actions have their own places in the header - so what this
      // asserts is that the merchant row renders nothing rather than something broken.
      // That the controls survive an absent menu is asserted against the header itself,
      // in `secure-header.spec.ts`.
      expect(all('nav-link')).toHaveLength(0);
      expect(all('nav-group')).toHaveLength(0);
      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('never rendered');
      http.expectNone(() => true);
    });
  });

  describe('destinations', () => {
    it('renders a catalog destination as a router link', async () => {
      await render();

      expect(byLabel('nav-link', 'Catalog')?.getAttribute('href')).toBe('/catalog');
    });

    it('renders a storefront category destination', async () => {
      await render();
      byLabel('nav-group', 'Tools')?.click();
      await settle();

      expect(byLabel('nav-link', 'Power Tools')?.getAttribute('href')).toBe(
        '/catalog/power-tools',
      );
    });

    it('renders a product destination', async () => {
      await render();
      byLabel('nav-group', 'Tools')?.click();
      await settle();

      expect(byLabel('nav-link', 'Hex Bolt')?.getAttribute('href')).toBe(
        '/catalog/item/hex-bolt-m10-50',
      );
    });

    it('builds /pages/:slug for a storefront page, whose href is always null', async () => {
      await render();

      // The one route the SPA owns. The backend stores none by design, so this is the
      // only destination type Angular constructs - from `target`, never from the label.
      expect(byLabel('nav-link', 'About Us')?.getAttribute('href')).toBe('/pages/about-us');
    });

    it('renders an external URL as a plain anchor to the backend URL', async () => {
      await render();

      const link = byLabel('nav-link', 'Supplier');
      expect(link?.getAttribute('href')).toBe('https://supplier.example.invalid/');
    });

    it('opens a new tab only when the backend says so, and safely', async () => {
      await render();

      const newTab = byLabel('nav-link', 'Supplier');
      expect(newTab?.getAttribute('target')).toBe('_blank');
      // Without rel, the opened page keeps a handle on this one.
      expect(newTab?.getAttribute('rel')).toContain('noopener');

      // External does not imply a new tab: the two flags are independent.
      const sameTab = byLabel('nav-link', 'Brochure');
      expect(sameTab?.getAttribute('href')).toBe('https://files.example.invalid/b.pdf');
      expect(sameTab?.getAttribute('target')).toBeNull();
    });

    it('renders a null destination as text, not a link', async () => {
      await render();

      expect(byLabel('nav-inert', 'Seasonal')).not.toBeUndefined();
      expect(byLabel('nav-link', 'Seasonal')).toBeUndefined();
    });

    it('expects no raw Frappe link fields', async () => {
      // The published shape is normalised. A client reading `link_category` and friends
      // would be reading a database relationship the storefront is never given.
      const destination = {
        type: 'storefront_category' as const,
        target: 'power-tools',
        href: '/catalog/power-tools',
        external: false,
        open_in_new_tab: false,
      };

      expect(destinationRoute(destination)).toBe('/catalog/power-tools');
      expect(Object.keys(destination)).toEqual([
        'type',
        'target',
        'href',
        'external',
        'open_in_new_tab',
      ]);
      expect(Object.keys(destination)).not.toContain('link_category');
      expect(Object.keys(destination)).not.toContain('link_page');
      expect(Object.keys(destination)).not.toContain('link_item');
    });

    it('treats an unresolvable destination and a group the same way', () => {
      expect(destinationRoute(null)).toBeNull();
      expect(isExternalDestination(null)).toBe(false);
      // A storefront page with no target has nothing to build a route from.
      expect(
        destinationRoute({
          type: 'storefront_page',
          target: null,
          href: null,
          external: false,
          open_in_new_tab: false,
        }),
      ).toBeNull();
    });
  });

  describe('groups', () => {
    it('renders a group as a button, not a link', async () => {
      await render();

      const group = byLabel('nav-group', 'Tools');
      expect(group?.tagName).toBe('BUTTON');
      expect(group?.getAttribute('href')).toBeNull();
      expect(group?.getAttribute('aria-expanded')).toBe('false');
    });

    it('reveals its children when opened, and hides them again', async () => {
      await render();
      expect(all('nav-group-panel')).toHaveLength(0);

      byLabel('nav-group', 'Tools')?.click();
      await settle();
      expect(all('nav-group-panel')).toHaveLength(1);
      expect(byLabel('nav-group', 'Tools')?.getAttribute('aria-expanded')).toBe('true');
      expect(byLabel('nav-link', 'Power Tools')).not.toBeUndefined();

      byLabel('nav-group', 'Tools')?.click();
      await settle();
      expect(all('nav-group-panel')).toHaveLength(0);
    });

    it('ties the button to the panel it controls', async () => {
      await render();
      byLabel('nav-group', 'Tools')?.click();
      await settle();

      const controls = byLabel('nav-group', 'Tools')?.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      expect(all('nav-group-panel')[0]?.getAttribute('id')).toBe(controls);
    });
  });

  describe('application controls', () => {
    // Where these live changed in Phase 26B - the cart became its own header action and
    // the account actions moved into the user menu - so *that they survive an empty
    // menu* is now asserted in `secure-header.spec.ts`, against the header that owns
    // them. What belongs here is the other half of the same rule: this row renders the
    // merchant's tree and nothing else.

    it('renders no application control of its own', async () => {
      await render();

      // Not merely absent from the menu payload: absent from this component entirely.
      // A merchant tree and the application's own controls are different things, and
      // since Phase 26B they no longer share a list.
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).not.toContain('Cart');
      expect(text).not.toContain('Orders');
      expect(text).not.toContain('Account');
      expect(byLabel('nav-link', 'Cart')).toBeUndefined();
    });

    it('renders nothing at all for an empty menu', async () => {
      await render(menuPayload({ items: [] }));

      expect(all('nav-link')).toHaveLength(0);
      expect(all('nav-group')).toHaveLength(0);
    });
  });

  describe('one dataset for both breakpoints', () => {
    it('serves a second rendering from the same single request', async () => {
      await render();

      // The shell renders this component twice - desktop and mobile. The store is shared,
      // so the second instance issues no request of its own and shows the same tree.
      const second = TestBed.createComponent(SecureNav);
      second.detectChanges();
      await settle();
      second.detectChanges();

      http.expectNone((r) => r.url.includes('get_menu'));
      const secondText = (second.nativeElement as HTMLElement).textContent ?? '';
      expect(secondText).toContain('Tools');
      expect(secondText).toContain('About Us');
    });
  });
});
