import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { clearMockRequestLog, mockRequestLog } from '../../../mock-api/core/mock-request-log';
import { MockServerSession } from '../../../mock-api/core/mock-server-session';
import { mockApiInterceptor } from '../../../mock-api/mock-api.interceptor';
import { yobCsrfInterceptor } from '../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../foundation/network/yob-api.config';
import { SessionStore } from '../../foundation/session/session.store';
import { CATALOG_CURRENCY } from '../catalog/catalog.currency';
import { ContentSlot } from './parts/content-slot';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const ROUTE_CONTENT = 'yob_storefront.api.cms.get_route_content';

/** How many times the route-content endpoint was actually called, and for what. */
function routeContentCalls(): readonly string[] {
  return mockRequestLog()
    .filter((record) => record.rpcMethod === ROUTE_CONTENT)
    .map((record) => record.params['route_key'] ?? '');
}

/* --------------------------------------------------------------------- hosts */

@Component({
  selector: 'app-home-slots-host',
  imports: [ContentSlot],
  template: `
    <yob-content-slot routeKey="home" slotKey="hero" />
    <yob-content-slot routeKey="home" slotKey="main" />
    <yob-content-slot routeKey="home" slotKey="bottom" />
  `,
})
class HomeSlotsHost {}

@Component({
  selector: 'app-one-slot-host',
  imports: [ContentSlot],
  template: `<yob-content-slot routeKey="home" slotKey="hero" />`,
})
class OneSlotHost {}

@Component({
  selector: 'app-cart-slots-host',
  imports: [ContentSlot],
  template: `
    <p data-testid="host-core">The cart itself</p>
    <yob-content-slot routeKey="cart" slotKey="above_cart" />
    <yob-content-slot routeKey="cart" slotKey="below_cart" />
  `,
})
class CartSlotsHost {}

@Component({
  selector: 'app-empty-slot-host',
  imports: [ContentSlot],
  // `catalog` declares both slots and the fixture leaves both empty - the ordinary case.
  template: `<yob-content-slot routeKey="catalog" slotKey="above_listing" />`,
})
class EmptySlotHost {}

@Component({
  selector: 'app-two-routes-host',
  imports: [ContentSlot],
  // The same slot KEY on two different routes. Only the pair identifies a position.
  template: `
    <div data-testid="from-category">
      <yob-content-slot routeKey="category" slotKey="above_listing" />
    </div>
    <div data-testid="from-catalog">
      <yob-content-slot routeKey="catalog" slotKey="above_listing" />
    </div>
  `,
})
class TwoRoutesHost {}

/**
 * System route content: one request per route, one renderer for every block (Phase 25H).
 *
 * Driven through the real `CmsApi`, the real envelope handling and the mock backend, so
 * what these assert is the request Angular actually composes and the DOM it actually
 * produces - not a stub agreeing with itself.
 */
describe('system route content', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([yobCsrfInterceptor, mockApiInterceptor])),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
        { provide: CATALOG_CURRENCY, useValue: 'INR' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    clearMockRequestLog();

    // Signed in: `get_route_content` is an authenticated storefront endpoint, and every
    // route that has slots sits behind the session guard.
    TestBed.inject(MockServerSession).signIn('TEST_APP', 'password');
    TestBed.inject(SessionStore).restore().subscribe();
  });

  async function render<T>(host: Type<T>) {
    const fixture = TestBed.createComponent(host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = () => fixture.nativeElement as HTMLElement;
    return {
      fixture,
      root,
      text: () => (root().textContent ?? '').replace(/\s+/g, ' ').trim(),
      all: (id: string) => Array.from(root().querySelectorAll(`[data-testid="${id}"]`)),
      testId: (id: string) => root().querySelector(`[data-testid="${id}"]`),
    };
  }

  /* ------------------------------------------------------ request coordination */

  describe('what a route costs', () => {
    it('asks once for a route with one slot on it', async () => {
      await render(OneSlotHost);

      expect(routeContentCalls()).toEqual(['home']);
    });

    it('still asks once when three slots of the same route are mounted', async () => {
      await render(HomeSlotsHost);

      // The backend returns every slot of a route in one answer. Three components
      // consuming one response is the whole point of the store.
      expect(routeContentCalls()).toEqual(['home']);
    });

    it('asks once for the cart, whichever slots are on it', async () => {
      await render(CartSlotsHost);

      expect(routeContentCalls()).toEqual(['cart']);
    });

    it('never asks per slot', async () => {
      await render(HomeSlotsHost);

      // The failure this guards against is a URL naming a slot at all.
      for (const record of mockRequestLog()) {
        expect(record.urlWithParams).not.toContain('slot');
      }
    });

    it('keeps one route out of another, even for a slot key they share', async () => {
      const view = await render(TwoRoutesHost);

      // `above_listing` is declared by BOTH catalog and category. The category fixture
      // fills it; the catalog fixture leaves it empty. A lookup by slot key alone would
      // show one route's merchandising on the other.
      expect([...routeContentCalls()].sort()).toEqual(['catalog', 'category']);
      expect(view.testId('from-category')?.textContent).toContain('Bulk pricing');
      expect(view.testId('from-catalog')?.textContent?.trim()).toBe('');
    });
  });

  /* ----------------------------------------------------------- what it renders */

  describe('rendering', () => {
    it('renders nothing at all for a slot the merchant left empty', async () => {
      const view = await render(EmptySlotHost);

      // Not a placeholder, not a gap, not an empty wrapper: an unconfigured position is
      // invisible, or every page carries the spacing of content nobody wrote.
      expect(view.testId('content-slot')).toBeNull();
      expect(view.all('page-block')).toHaveLength(0);
      expect(view.root().textContent?.trim()).toBe('');
    });

    it('renders each slot into its own position, in the backend order', async () => {
      const view = await render(HomeSlotsHost);

      const slots = view.all('content-slot');
      expect(slots.map((slot) => slot.getAttribute('data-slot'))).toEqual([
        'hero',
        'main',
        'bottom',
      ]);
      expect(slots.every((slot) => slot.getAttribute('data-route') === 'home')).toBe(true);
    });

    it('preserves the merchant block order inside one slot', async () => {
      const view = await render(HomeSlotsHost);

      // `main` holds rich text, then the customer's targets, then a product grid.
      // Sequence is a merchandising decision that has already been made.
      const main = view.all('content-slot').find((s) => s.getAttribute('data-slot') === 'main');
      const types = Array.from(main?.querySelectorAll('[data-testid="page-block"]') ?? []).map(
        (block) => block.getAttribute('data-block-type'),
      );
      expect(types).toEqual(['rich_text', 'target_progress', 'product_grid']);
    });

    it('goes through the same renderer a Storefront Page uses', async () => {
      const view = await render(HomeSlotsHost);

      // The block types on Home's three slots are drawn by `ContentBlocks` - the same
      // component `/pages/:slug` renders. A slot that had its own dispatch would be a
      // second place for a block type to be added.
      const types = view.all('page-block').map((block) => block.getAttribute('data-block-type'));
      expect(types).toEqual([
        'image_banner',
        'rich_text',
        // 3.13.0, drawn by the same dispatcher as every other type - which is the point
        // of this assertion: a slot with its own dispatch would be a second place to
        // register a block.
        'target_progress',
        'product_grid',
        'rich_text',
        'promo_grid',
      ]);
      expect(view.all('block-image-banner')).toHaveLength(1);
      expect(view.all('block-rich-text')).toHaveLength(2);
      expect(view.all('block-product-grid')).toHaveLength(1);
      expect(view.all('block-promo-grid')).toHaveLength(1);
    });
  });

  /* ---------------------------------------------- Product Grid inside a slot */

  describe('a Product Grid in a system slot', () => {
    it('renders the catalogue own card, priced by the backend', async () => {
      const view = await render(HomeSlotsHost);

      const cards = view.all('item-card');
      expect(cards.length).toBeGreaterThan(0);

      // A simple item shows the authoritative rate and its selling UOM, straight from
      // the row the backend embedded - 240 in Nos, neither of them computed here.
      expect(view.testId('item-rate')?.textContent).toContain('240');
      expect(view.testId('item-uom')?.textContent).toContain('Nos');
    });

    it('shows a variant family as Select options, with no money at all', async () => {
      const view = await render(HomeSlotsHost);

      const family = view
        .all('item-card')
        .find((card) => card.querySelector('[data-testid="item-select-options"]') !== null);
      expect(family).toBeDefined();
      expect(family?.querySelector('[data-testid="item-rate"]')).toBeNull();
      expect(family?.textContent).not.toContain('₹');
    });

    it('issues no catalogue, pricing, stock or variant request of its own', async () => {
      await render(HomeSlotsHost);

      // The rows arrived with the route content, already selected and priced. A client
      // that interpreted a grid by fetching would show up here.
      const rpcs = mockRequestLog().map((record) => record.rpcMethod);
      expect(rpcs.filter((rpc) => rpc.includes('get_item'))).toHaveLength(0);
      expect(rpcs.filter((rpc) => rpc.includes('get_items'))).toHaveLength(0);
      expect(rpcs.filter((rpc) => rpc.includes('resolve_variant'))).toHaveLength(0);
      expect(rpcs.filter((rpc) => rpc.includes('get_category'))).toHaveLength(0);

      http.expectNone((request) => request.url.includes('catalog.'));
    });
  });

  /* ------------------------------------------------------------- destinations */

  describe('destinations', () => {
    it('uses the shared destination handling, including the client-built page route', async () => {
      const view = await render(HomeSlotsHost);

      const links = view.all('destination-link');
      expect(links.length).toBeGreaterThan(0);

      // A `storefront_page` destination carries a null href by design; the SPA owns
      // `/pages/:slug`. Same helper as the menu and as a page's own blocks.
      const pageLink = links.find(
        (link) => link.getAttribute('data-destination-type') === 'storefront_page',
      );
      expect(pageLink?.getAttribute('href')).toBe('/pages/support');

      // A card with no destination is not a link that goes nowhere.
      expect(view.all('destination-inert').length).toBeGreaterThan(0);
    });
  });
});

/* ------------------------------------------------------- supplemental failure */

/**
 * The failure contract, driven against the testing backend so the response can be chosen.
 *
 * Route content is decoration on top of a route that works without it. That claim is only
 * worth anything if it is tested, so these assert the host survives, stays legible, and
 * is never asked about it again.
 */
describe('when route content fails', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([yobCsrfInterceptor])),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
        { provide: CATALOG_CURRENCY, useValue: 'INR' },
      ],
    });
    http = TestBed.inject(HttpTestingController);

    // Authenticated without the mock interceptor, so the testing backend answers.
    TestBed.inject(SessionStore).restore().subscribe();
    http
      .expectOne((request) => request.url.includes('get_session_context'))
      .flush({ message: { data: AUTHENTICATED } });
  });

  async function renderCart() {
    const fixture = TestBed.createComponent(CartSlotsHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('leaves the host page working, and says nothing about it', async () => {
    const fixture = await renderCart();

    http
      .expectOne((request) => request.url.includes(ROUTE_CONTENT))
      .flush({ message: { errors: [{ code: 'internal_server_error', detail: 'Boom' }] } },
        { status: 500, statusText: 'Server Error' });

    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    // The cart is still a cart.
    expect(root.querySelector('[data-testid="host-core"]')?.textContent).toBe('The cart itself');
    // And the buyer is told nothing about content they never asked to see.
    expect(root.textContent).not.toContain('Boom');
    expect(root.querySelector('[data-testid="content-slot"]')).toBeNull();

    http.verify();
  });

  it('does not retry', async () => {
    const fixture = await renderCart();

    http
      .expectOne((request) => request.url.includes(ROUTE_CONTENT))
      .flush({ message: { errors: [{ code: 'internal_server_error', detail: 'Boom' }] } },
        { status: 500, statusText: 'Server Error' });

    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // A retry loop behind a page the buyer is actually using is a request storm, not a
    // recovery. One attempt, recorded, and that is the end of it.
    http.expectNone((request) => request.url.includes(ROUTE_CONTENT));
    http.verify();
  });
});

const AUTHENTICATED = {
  user: { name: 'buyer@example.invalid', full_name: 'Test Buyer' },
  csrf_token: 'test-csrf',
  context: { profile_name: 'Test Co' },
};
