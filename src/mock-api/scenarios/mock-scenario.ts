import { Service, signal } from '@angular/core';

/**
 * Mock behaviours that cannot be produced by asking the mock to behave normally.
 *
 * Deliberately short. The obvious candidates for a scenario switch are already
 * reachable through real behaviour, and reaching them that way tests the contract
 * instead of testing the switch:
 *
 * - guest / unauthenticated -> do not sign in
 * - validation or login error -> sign in with the wrong credentials
 * - empty collections       -> a handler whose fixture is empty
 *
 * What is left genuinely needs a knob:
 *
 * - `server-error` a fault no correct request can trigger
 * - `empty`        a populated fixture cannot also be the empty one, and swapping
 *                  fixtures per test would need a second set of them
 * - latency        a slow network, which is orthogonal to the reply itself
 */
export type MockScenario =
  | 'normal'
  | 'empty'
  | 'server-error'
  /** get_cart reports repriced lines, so the reconciliation notice can be seen. */
  | 'cart-repriced'
  /** get_cart withdraws the cart's lines and reports them as removed. */
  | 'cart-item-removed'
  /**
   * The cart reports `is_shippable: 0`.
   *
   * The backend derives shippability from `is_stock_item`, and every catalog fixture
   * is a physical product, so a cart of services or downloads is not reachable by
   * ordinary means. This stands in for one.
   */
  | 'cart-not-shippable'
  /**
   * The address and contact lists include a record the setters refuse.
   *
   * Stands in for a record deleted after this page read the list.
   */
  | 'checkout-stale-records'
  /**
   * `proceed_to_payment` answers 200 (obligation reused) instead of 201 (created).
   *
   * A knob because nothing a correct client does chooses between them - the server
   * decides from its own obligation state - and the frontend must behave identically,
   * which is only provable if both are reachable.
   */
  | 'payment-reused'
  /**
   * `proceed_to_payment` refuses with a documented precondition failure.
   *
   * A knob because it is unreachable by behaving correctly: the failure models the
   * cart changing between the page rendering and the buyer pressing Proceed - another
   * tab, another device - which a browser test cannot otherwise arrange.
   */
  | 'payment-refused'
  /**
   * `apply_coupon` and `remove_coupon` answer 500 while `get_cart` keeps working.
   *
   * A knob because it is unreachable by behaving correctly, and because the *pair*
   * matters: the mutation's outcome has to be genuinely unknown while the canonical
   * read still succeeds, so the client's recovery - re-read, never re-apply - is
   * observable rather than inferred. A blanket `server-error` would break the read too
   * and could only ever exercise the "could not confirm anything" branch.
   */
  | 'coupon-uncertain'
  /** get_checkout_data and process_payment answer 409 payment_request_stale. */
  | 'payment-stale'
  /** The checkout credential has expired: 422 checkout_token_expired. */
  | 'payment-token-expired'
  /** process_payment refuses the chosen method and narrows the eligible set. */
  | 'payment-method-ineligible'
  /**
   * The order commits and then the provider call fails.
   *
   * 500 payment_provider_error with `retryable: true` and the Sales Order - the case
   * the UI must never report as a failed order.
   */
  | 'payment-provider-error'
  /** verify_payment rejects the signature. */
  | 'payment-signature-invalid'
  /** Only Razorpay is eligible. */
  | 'payment-razorpay-only'
  /** Only Pay Later is eligible. */
  | 'payment-paylater-only'
  /** The obligation is already Sales-Order-backed on first load. */
  | 'payment-committed'
  /** process_payment fails with `retryable: false` and no order - nothing committed. */
  | 'payment-provider-unavailable'
  /** verify_payment reports the obligation already settled by a different payment. */
  | 'payment-already-processed'
  /**
   * Deleting an Address or Contact answers 409 `*_in_use`.
   *
   * A knob because the refusal comes from links a mock cart and mock order do not
   * have, and simulating those links would be more backend than this needs.
   */
  | 'account-record-in-use'
  /** `get_items` first page returns nothing while `has_more` stays true. */
  | 'catalog-empty-page'
  /** ERPNext adds a free row for the *same* SKU already in the cart. */
  | 'cart-promotion-same-item'
  /** ERPNext gifts a different SKU, present in no cart item. */
  | 'cart-promotion-other-item'
  /** A Paid row legitimately priced to zero by a 100% discount. */
  | 'cart-paid-zero-rate'
  /** Tax already inside the price: total equals amount, not amount + tax. */
  | 'cart-tax-inclusive'
  /** Inter-state sale: a single IGST component. */
  | 'cart-tax-igst'
  /** GST-unregistered company: a real but unclassified component named by `label`. */
  | 'cart-tax-generic'
  /** Row figures deliberately disagreeing with the document totals. */
  | 'cart-summary-mismatch'
  /**
   * `get_items` refuses a selection this category's projection still advertises.
   *
   * The genuinely stale facet list: the filters were fetched, the buyer chose from them,
   * and the merchant retired one in between. Unreproducible otherwise, because the mock's
   * projection and its listing agree.
   */
  | 'storefront-filter-refused'
  /**
   * `get_category_filters` fails outright.
   *
   * An older backend, a transient fault, anything. The products must still load: facets
   * are decoration, and a category that shows a spinner for ever because its filter list
   * failed is a worse page than one with no filter panel.
   */
  | 'category-filters-unavailable'
  /** The configured menu is missing or disabled - `cms.get_menu` answers 404. */
  | 'menu-missing'
  /**
   * `resolve_variant` refuses a combination the family matrix offered.
   *
   * The stale-matrix case: values that all exist, in a pairing the backend will not
   * sell. Unreproducible otherwise, because the mock's matrix and its resolver agree.
   */
  | 'variant-unavailable'
  /** The family cannot be configured in the storefront - Manufacturer-based variants. */
  | 'variant-family-unsupported'
  /**
   * The item's selling UOM changed after it was put in the cart.
   *
   * `add_to_cart` answers 409 `cart_item_uom_changed` for a line already in the cart,
   * and `get_cart` reports the same lines in `uom_changed_items`.
   */
  | 'cart-item-uom-changed'
  /**
   * `cms.get_route_content` fails.
   *
   * The supplemental-content case: system route content is decoration on top of a route
   * that works without it, so a cart whose banner failed must still be a working cart.
   * Nothing retries, and nothing tells the buyer - the alternative is an error message
   * about content they never asked to see.
   */
  | 'route-content-unavailable'
  /**
   * `catalog.get_product_suggestions` fails.
   *
   * Header typeahead is supplemental: a failed suggestion must leave the header, the
   * cart, the user menu and the current page entirely usable, and must not retry.
   */
  | 'product-suggestions-unavailable';

/**
 * Runtime knobs for the mock API.
 *
 * Injectable so a test can set them, and a future developer console could too. Not
 * persisted and not configurable at build time - this is a development aid, not a
 * feature-flag system.
 */
@Service()
export class MockApiScenario {
  readonly scenario = signal<MockScenario>('normal');

  /**
   * Artificial delay in milliseconds, applied to success and failure alike.
   *
   * `0` disables it entirely rather than scheduling a zero-length timer, so mock
   * responses stay synchronous by default and tests need no timer plumbing.
   */
  readonly latencyMs = signal(0);

  constructor() {
    // Dev affordance: `?mockLatency=600` on any URL makes slow responses reachable in
    // a real browser, which is otherwise impossible - the mock answers in memory, so
    // there is no request for a test to intercept and stall. Needed to exercise
    // pending states such as a submit button that must block a second click.
    //
    // Mock-only by construction: this whole folder is absent from production builds.
    const query = new URLSearchParams(globalThis.location?.search ?? '');

    const requested = Number(query.get('mockLatency'));
    if (Number.isFinite(requested) && requested > 0) {
      this.latencyMs.set(requested);
    }

    // `?mockScenario=empty` / `=server-error` for browser tests of those states.
    const scenario = query.get('mockScenario');
    if (
      scenario === 'empty' ||
      scenario === 'server-error' ||
      scenario === 'cart-repriced' ||
      scenario === 'cart-item-removed' ||
      scenario === 'cart-not-shippable' ||
      scenario === 'coupon-uncertain' ||
      scenario === 'checkout-stale-records' ||
      scenario === 'payment-reused' ||
      scenario === 'payment-refused' ||
      scenario === 'payment-stale' ||
      scenario === 'payment-token-expired' ||
      scenario === 'payment-method-ineligible' ||
      scenario === 'payment-provider-error' ||
      scenario === 'payment-signature-invalid' ||
      scenario === 'payment-razorpay-only' ||
      scenario === 'payment-paylater-only' ||
      scenario === 'payment-committed' ||
      scenario === 'payment-provider-unavailable' ||
      scenario === 'payment-already-processed' ||
      scenario === 'account-record-in-use' ||
      scenario === 'catalog-empty-page' ||
      scenario === 'cart-promotion-same-item' ||
      scenario === 'cart-promotion-other-item' ||
      scenario === 'cart-paid-zero-rate' ||
      scenario === 'cart-tax-inclusive' ||
      scenario === 'cart-tax-igst' ||
      scenario === 'cart-tax-generic' ||
      scenario === 'cart-summary-mismatch' ||
      scenario === 'cart-item-uom-changed' ||
      scenario === 'variant-unavailable' ||
      scenario === 'variant-family-unsupported' ||
      scenario === 'menu-missing' ||
      scenario === 'storefront-filter-refused' ||
      scenario === 'category-filters-unavailable' ||
      scenario === 'route-content-unavailable' ||
      scenario === 'product-suggestions-unavailable'
    ) {
      this.scenario.set(scenario);
      this.sparesAuth.set(true);
    }
  }

  /**
   * Whether the active scenario should spare the `yob_auth` endpoints.
   *
   * Set only when the scenario came from the URL. A browser test has to sign in
   * before it can reach the feature it wants to watch fail, and a `server-error` that
   * also broke `login_with_password` could never be used for anything past the
   * sign-in page. Tests that set the scenario programmatically keep it global,
   * because they can choose the moment.
   */
  readonly sparesAuth = signal(false);

  reset(): void {
    this.scenario.set('normal');
    this.latencyMs.set(0);
    this.sparesAuth.set(false);
  }
}
