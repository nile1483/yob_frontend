import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { MockServerAddressBook } from '../../../../mock-api/core/mock-server-address-book';
import { MockServerCart } from '../../../../mock-api/core/mock-server-cart';
import { MockServerSession } from '../../../../mock-api/core/mock-server-session';
import {
  MOCK_ADDRESS_LOCAL,
  MOCK_ADDRESS_REMOTE,
  MOCK_CONTACT_PRIMARY,
  MOCK_CONTACT_SECONDARY,
  MOCK_STALE_ADDRESS,
  MOCK_STALE_CONTACT,
} from '../../../../mock-api/fixtures/address-book.fixture';
import { mockApiInterceptor } from '../../../../mock-api/mock-api.interceptor';
import { MockApiScenario } from '../../../../mock-api/scenarios/mock-scenario';
import { routes } from '../../../app.routes';
import { yobCsrfInterceptor } from '../../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../../foundation/network/yob-api.config';
import { SessionStore } from '../../../foundation/session/session.store';
import { CartStore } from '../../cart/state/cart.store';
import { answerRouteContent } from '../../content/route-content.testing';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const BOLT = 'YOB-BOLT-M10';

describe('CheckoutPage', () => {
  let http: HttpTestingController;
  let mockCart: MockServerCart;
  let mockBook: MockServerAddressBook;
  let scenario: MockApiScenario;

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
    mockCart = TestBed.inject(MockServerCart);
    mockBook = TestBed.inject(MockServerAddressBook);
    scenario = TestBed.inject(MockApiScenario);

    TestBed.inject(MockServerSession).signIn('TEST_APP', 'password');
    TestBed.inject(SessionStore).restore().subscribe();
  });

  afterEach(() => {
    scenario.reset();
    mockCart.reset();
    mockBook.reset();
    answerRouteContent(http);
    http.verify();
  });

  async function open() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/checkout');
    await harness.fixture.whenStable();
    const root = harness.fixture.nativeElement as HTMLElement;

    return {
      harness,
      root,
      text: () => root.textContent ?? '',
      testId: (id: string) => root.querySelector(`[data-testid="${id}"]`),
      all: (id: string) => Array.from(root.querySelectorAll(`[data-testid="${id}"]`)),
      /** The radio currently checked within a named group. */
      checked: (group: string) =>
        (root.querySelector(`[data-testid="${group}-option"]:checked`) as HTMLInputElement | null)
          ?.value ?? null,
      radios: (group: string) =>
        Array.from(root.querySelectorAll(`[data-testid="${group}-option"]`)) as HTMLInputElement[],
      settle: async () => {
        await Promise.resolve();
        await Promise.resolve();
        harness.fixture.detectChanges();
        await harness.fixture.whenStable();
      },
    };
  }

  // ------------------------------------------------------------------ load

  it('renders the cart, the addresses and the contacts together', async () => {
    mockCart.seedQuantity(BOLT, 2);
    const view = await open();

    expect(view.testId('checkout-items')).not.toBeNull();
    expect(view.testId('checkout-contact-section')).not.toBeNull();
    expect(view.testId('checkout-billing-section')).not.toBeNull();
  });

  it('starts all three requests without waiting for one another', async () => {
    // Each resource and the cart load are begun at construction. If any waited for
    // another, the later ones would not have been issued by first render.
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    expect(view.testId('checkout-items')).not.toBeNull();
    expect(view.radios('checkout-contact').length).toBeGreaterThan(0);
    expect(view.radios('checkout-billing').length).toBeGreaterThan(0);
  });

  it('shows an empty cart without offering any selection', async () => {
    const view = await open();

    expect(view.testId('checkout-empty')).not.toBeNull();
    // Nothing to select against, so no sections and no setter is reachable.
    expect(view.testId('checkout-contact-section')).toBeNull();
    expect(view.testId('checkout-billing-section')).toBeNull();
    expect(view.testId('checkout-shipping-section')).toBeNull();
  });

  // ---------------------------------------------------------- preselection

  it('preselects the contact the cart already holds', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    expect(view.checked('checkout-contact')).toBe(MOCK_CONTACT_PRIMARY);
  });

  it('preselects the billing address the cart already holds', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    expect(view.checked('checkout-billing')).toBe(MOCK_ADDRESS_LOCAL);
  });

  it('preselects the shipping address when the cart is shippable', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    expect(view.testId('checkout-shipping-section')).not.toBeNull();
    expect(view.checked('checkout-shipping')).toBe(MOCK_ADDRESS_LOCAL);
  });

  it('offers the same address records for billing and shipping', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    const billing = view.radios('checkout-billing').map((r) => r.value);
    const shipping = view.radios('checkout-shipping').map((r) => r.value);
    expect(shipping).toEqual(billing);
  });

  // -------------------------------------------------------------- shipping

  it('hides the shipping section when the cart is not shippable', async () => {
    mockCart.seedQuantity(BOLT, 1);
    scenario.scenario.set('cart-not-shippable');
    const view = await open();

    expect(view.testId('checkout-shipping-section')).toBeNull();
    // Billing is unaffected - only shipping depends on is_shippable.
    expect(view.testId('checkout-billing-section')).not.toBeNull();
  });

  it('says shipping matches billing when the two identifiers agree', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    expect(view.testId('checkout-same-as-billing')).not.toBeNull();
  });

  it('drops the same-as-billing note once they differ', async () => {
    mockCart.seedQuantity(BOLT, 1);
    mockCart.setShippingAddress(MOCK_ADDRESS_REMOTE);
    const view = await open();

    expect(view.testId('checkout-same-as-billing')).toBeNull();
  });

  // ------------------------------------------------------------- selecting

  it('sends a chosen contact and adopts the returned cart', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    const radio = view
      .radios('checkout-contact')
      .find((r) => r.value === MOCK_CONTACT_SECONDARY) as HTMLInputElement;
    radio.click();
    await view.settle();

    expect(TestBed.inject(CartStore).contactName()).toBe(MOCK_CONTACT_SECONDARY);
    expect(view.checked('checkout-contact')).toBe(MOCK_CONTACT_SECONDARY);
  });

  it('shows the repriced total the server returned after a billing change', async () => {
    mockCart.seedQuantity(BOLT, 2);
    const view = await open();
    const before = view.testId('cart-grand-total')?.textContent ?? '';

    const radio = view
      .radios('checkout-billing')
      .find((r) => r.value === MOCK_ADDRESS_REMOTE) as HTMLInputElement;
    radio.click();
    await view.settle();

    const after = view.testId('cart-grand-total')?.textContent ?? '';
    const cart = TestBed.inject(CartStore).cart();

    expect(after).not.toBe(before);
    // The rendered figure is the server's grand_total, to the digit - not a local sum
    // of the lines, which would still be the old amount.
    expect(after).toContain(String(cart?.grand_total));
    expect(cart?.tax_total).toBeGreaterThan(0);
  });

  it('keeps the previous selection visible when the server refuses a record', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    // A record that is not this customer's: the list is stale.
    mockBook.reset();
    const store = TestBed.inject(CartStore);
    store.setContact('SOMEONE-ELSES-CONTACT').subscribe();
    await view.settle();

    expect(view.testId('checkout-selection-error')).not.toBeNull();
    expect(view.text()).toContain('no longer available');
    // The backend's own wording named the other customer's ownership; ours does not.
    expect(view.text()).not.toContain('does not belong to this customer');
    expect(store.contactName()).toBe(MOCK_CONTACT_PRIMARY);
  });

  it('reverts the radio when the server refuses the record it names', async () => {
    // The list still offers a record that has since been deleted server-side.
    mockCart.seedQuantity(BOLT, 1);
    scenario.scenario.set('checkout-stale-records');
    const view = await open();

    const stale = view
      .radios('checkout-billing')
      .find((r) => r.value === MOCK_STALE_ADDRESS.name) as HTMLInputElement;
    expect(stale).toBeDefined();

    stale.click();
    await view.settle();

    // Clicking changed the DOM directly, and the cart never adopted it. The list must
    // show what the cart holds, not what the user tried.
    expect(view.checked('checkout-billing')).toBe(MOCK_ADDRESS_LOCAL);
    expect(stale.checked).toBe(false);
    expect(view.testId('checkout-selection-error')).not.toBeNull();
  });

  it('re-reads the master list after a record is refused', async () => {
    mockCart.seedQuantity(BOLT, 1);
    scenario.scenario.set('checkout-stale-records');
    const view = await open();

    // The refreshed read no longer offers the stale record.
    scenario.scenario.set('normal');
    const stale = view
      .radios('checkout-contact')
      .find((r) => r.value === MOCK_STALE_CONTACT.name) as HTMLInputElement;
    stale.click();
    await view.settle();

    expect(view.radios('checkout-contact').map((r) => r.value)).not.toContain(
      MOCK_STALE_CONTACT.name,
    );
  });

  // ------------------------------------------------------------- readiness

  it('reports readiness when contact, billing and shipping are all set', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    expect(view.testId('checkout-readiness')).not.toBeNull();
    expect(view.text()).toContain('Ready to proceed');
    expect(view.testId('checkout-not-ready')).toBeNull();
  });

  it('lists what is still missing when a selection is absent', async () => {
    mockCart.seedQuantity(BOLT, 1);
    mockCart.clearShippingAddress();
    const view = await open();

    expect(view.testId('checkout-not-ready')).not.toBeNull();
    expect(view.text()).toContain('a shipping address');
  });

  it('ignores a missing shipping address when the cart does not ship', async () => {
    mockCart.seedQuantity(BOLT, 1);
    mockCart.clearShippingAddress();
    scenario.scenario.set('cart-not-shippable');
    const view = await open();

    // Readiness must not demand something the cart does not need.
    expect(view.text()).toContain('Ready to proceed');
  });

  // ----------------------------------------------------------- add records

  it('creates an address, refreshes the list and selects it as billing', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    (view.testId('checkout-add-billing-address') as HTMLButtonElement).click();
    await view.settle();

    fill(view.root, 'address-line1', 'Shed 7');
    fill(view.root, 'address-city', 'Pune');
    fill(view.root, 'address-title', 'New Depot');
    (view.testId('address-form-submit') as HTMLButtonElement).click();
    await view.settle();
    await view.settle();

    const store = TestBed.inject(CartStore);
    const created = store.billingAddressName();
    expect(created).not.toBe(MOCK_ADDRESS_LOCAL);
    // Present in the refreshed list, not merely selected.
    expect(view.radios('checkout-billing').map((r) => r.value)).toContain(created);
    expect(view.checked('checkout-billing')).toBe(created);
  });

  it('creates an address from the shipping section and selects it there', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    (view.testId('checkout-add-shipping-address') as HTMLButtonElement).click();
    await view.settle();

    fill(view.root, 'address-line1', 'Dock 2');
    fill(view.root, 'address-city', 'Surat');
    fill(view.root, 'address-title', 'Surat Dock');
    (view.testId('address-form-submit') as HTMLButtonElement).click();
    await view.settle();
    await view.settle();

    const store = TestBed.inject(CartStore);
    expect(store.shippingAddressName()).not.toBe(MOCK_ADDRESS_LOCAL);
    // Only the section that opened the form adopted it.
    expect(store.billingAddressName()).toBe(MOCK_ADDRESS_LOCAL);
  });

  it('creates a contact, refreshes the list and selects it', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    (view.testId('checkout-add-contact') as HTMLButtonElement).click();
    await view.settle();

    fill(view.root, 'contact-first-name', 'Ravi');
    fill(view.root, 'contact-last-name', 'Mock');
    (view.testId('contact-form-submit') as HTMLButtonElement).click();
    await view.settle();
    await view.settle();

    const store = TestBed.inject(CartStore);
    const created = store.contactName();
    expect(created).not.toBe(MOCK_CONTACT_PRIMARY);
    expect(view.radios('checkout-contact').map((r) => r.value)).toContain(created);
    // The refreshed list supplies the composed name the create reply lacked.
    expect(view.text()).toContain('Ravi Mock');
  });

  it('refuses to submit an address with no street or city', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    (view.testId('checkout-add-billing-address') as HTMLButtonElement).click();
    await view.settle();

    (view.testId('address-form-submit') as HTMLButtonElement).click();
    await view.settle();

    // Still on the form, with messages, and nothing was created.
    expect(view.testId('address-form')).not.toBeNull();
    expect(view.text()).toContain('Enter the street address.');
    expect(TestBed.inject(CartStore).billingAddressName()).toBe(MOCK_ADDRESS_LOCAL);
  });

  // ----------------------------------------------------------------- state

  it('holds no selection of its own - the cart is the only source', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    // Change the cart behind the page's back, then re-read it. If the page kept its
    // own chosen value, the radio would still show the old one.
    mockCart.setContactPerson(MOCK_CONTACT_SECONDARY);
    TestBed.inject(CartStore).load().subscribe();
    await view.settle();

    expect(view.checked('checkout-contact')).toBe(MOCK_CONTACT_SECONDARY);
  });

  it('groups each list for assistive technology', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    for (const group of ['checkout-contact', 'checkout-billing', 'checkout-shipping']) {
      const fieldset = view.testId(group);
      expect(fieldset?.tagName).toBe('FIELDSET');
      expect(fieldset?.querySelector('legend')?.textContent?.trim()).toBeTruthy();
    }
  });

  it('gives each group a distinct radio name so they do not interfere', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    const billing = new Set(view.radios('checkout-billing').map((r) => r.name));
    const shipping = new Set(view.radios('checkout-shipping').map((r) => r.name));
    expect(billing.size).toBe(1);
    expect(shipping.size).toBe(1);
    expect([...billing][0]).not.toBe([...shipping][0]);
  });

  it('never renders the backend HTML address block', async () => {
    mockCart.seedQuantity(BOLT, 1);
    const view = await open();

    // `display` is backend-rendered HTML - on the real bench it embeds the customer's
    // GSTIN. Binding it as markup would inject server HTML; interpolating it would
    // print raw tags. Neither happens, because the field is not used at all: assert
    // the whole string is absent rather than guessing which of the two mistakes was
    // made.
    for (const address of mockBook.addresses()) {
      const display = address.display ?? '';
      expect(display.length).toBeGreaterThan(0);
      expect(view.root.innerHTML).not.toContain(display);
      expect(view.text()).not.toContain(display.replace(/<br>/g, ''));
    }
  });
});

/** Type into a native control the way a user would, so Signal Forms sees it. */
function fill(root: HTMLElement, testId: string, value: string): void {
  const input = root.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
}
