import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';

import { Alert } from '../../../design/alert/alert';
import { Button } from '../../../design/button/button';
import { EmptyState } from '../../../design/empty-state/empty-state';
import { Spinner } from '../../../design/spinner/spinner';
import { PageHeader } from '../../../design/page-header/page-header';
import { normalizeYobFailure } from '../../../foundation/network/yob-api-error';
import { CartStore } from '../../cart/state/cart.store';
import {
  checkoutCreateErrorMessage,
  checkoutSelectionErrorMessage,
  proceedToPaymentErrorMessage,
  selectionNeedsMasterDataRefresh,
} from '../checkout-error-message';
import { toAddressChoice, toContactChoice } from '../checkout.choices';
import type { AddAddressRequest, AddContactRequest } from '../contracts/checkout.types';
import { sanitizePaymentUrl } from '../../payment/payment.route-path';
import { AddressBookApi } from '../data/address-book.api';
import { CheckoutApi } from '../data/checkout.api';
import { AddressForm } from '../parts/address-form';
import { CheckoutSummary } from '../parts/checkout-summary';
import { ChoiceList } from '../parts/choice-list';
import { ContactForm } from '../parts/contact-form';

/** Which section opened the shared address form, and therefore what happens after. */
type AddressContext = 'billing' | 'shipping';

/**
 * `proceed_to_payment` failures that are complaints about the cart's checkout state.
 *
 * Worth re-reading the cart for, because the server is telling us our copy is out of
 * date. Transport failures and server faults are not - nothing about the cart changed,
 * and a retry request would only add noise.
 */
const CHECKOUT_STATE_ERROR_CODES: ReadonlySet<string> = new Set([
  'cart_not_found',
  'cart_empty',
  'contact_required',
  'billing_address_required',
  'shipping_address_required',
]);

/**
 * Checkout details: who to contact, where to bill, where to ship.
 *
 * ## State decision: page-local master data, `CartStore` for everything selected
 *
 * There is no `CheckoutStore`. The page has several sections, which is not a reason for
 * one - the question is whether any state here has a second consumer, and it does not.
 *
 * The split that matters:
 *
 * - **What may be chosen** - the Address and Contact lists - is master data read by
 *   this page alone, derived from nothing, and discarded when the page goes. Two
 *   `rxResource`s, page-local, exactly as Catalog does it.
 * - **What is chosen** - contact, billing, shipping, and whether shipping applies at
 *   all - is cart state. `CartStore` already owns it and already has other consumers.
 *   Copying it into a checkout store would create a second answer to "which address is
 *   selected", and the two would eventually disagree.
 *
 * So this page never stores a selection. Every radio reflects `CartStore`, and the only
 * way to change one is a server round trip whose result the store adopts.
 *
 * ## Loading
 *
 * Cart, addresses and contacts start together and render independently. The order
 * summary appears as soon as the cart arrives even if the contact list is still in
 * flight, because blanking a whole page for the slowest of three requests is a cost
 * paid by the user for the developer's convenience.
 *
 * ## Repricing
 *
 * Selecting a contact or an address can change what the order costs - a destination
 * changes tax. Every setter is followed by the canonical `get_cart` inside the store,
 * so the summary re-renders from the response. Nothing here recalculates a total.
 */
@Component({
  selector: 'app-checkout-page',
  imports: [PageHeader, 
    AddressForm,
    Alert,
    Button,
    CheckoutSummary,
    ChoiceList,
    ContactForm,
    EmptyState,
    RouterLink,
    Spinner,
  ],
  template: `
    <app-page-header heading="Checkout" i18n-heading="@@checkout.heading" />

    <!-- Outside every state branch: a selection failure must survive the cart being
         reloaded underneath it, exactly as the cart page's reconciliation notice does. -->
    @if (selectionErrorMessage(); as message) {
      <div class="mt-6" data-testid="checkout-selection-error">
        <app-alert tone="error">{{ message }}</app-alert>
      </div>
    }

    <!-- Also outside the branches, and for a sharper reason: a failed Proceed re-reads
         the cart, and if the failure was an empty cart the page switches to the empty
         state - taking any message rendered inside the populated branch with it. The
         buyer would have pressed a button and seen nothing explain itself. -->
    @if (proceedErrorMessage(); as message) {
      <div class="mt-6" data-testid="checkout-proceed-error">
        <app-alert tone="error">{{ message }}</app-alert>
      </div>
    }

    @if (showsCartLoading()) {
      <div class="mt-8 flex justify-center" data-testid="checkout-loading">
        <app-spinner label="Loading checkout" i18n-label="@@checkout.loading" />
      </div>
    } @else if (store.error()) {
      <div class="mt-6" data-testid="checkout-cart-error">
        <app-alert tone="error">
          <span i18n="@@checkout.cart.error">We could not load your cart. Please try again.</span>
        </app-alert>
      </div>
    } @else if (store.isEmpty()) {
      <!-- No selections are offered and no setter is called: there is nothing to buy. -->
      <div class="mt-8" data-testid="checkout-empty">
        <app-empty-state>
          <h2 emptyTitle i18n="@@checkout.empty.title">Your cart is empty</h2>
          <p emptyBody i18n="@@checkout.empty.body">
            Add something to your cart before checking out.
          </p>
          <a
            emptyAction
            routerLink="/catalog"
            class="underline underline-offset-4"
            i18n="@@checkout.empty.action"
            >Browse the catalog</a
          >
        </app-empty-state>
      </div>
    } @else if (store.cart(); as cart) {
      <div class="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="flex flex-col gap-8">
          <!-- ------------------------------------------------------ contact -->
          <section data-testid="checkout-contact-section">
            @if (contacts.isLoading()) {
              <div class="flex justify-center py-4" data-testid="contacts-loading">
                <app-spinner label="Loading contacts" i18n-label="@@checkout.contacts.loading" />
              </div>
            } @else if (contacts.error()) {
              <app-alert tone="error" data-testid="contacts-error">
                <span i18n="@@checkout.contacts.error">
                  We could not load your contacts. Please try again.
                </span>
              </app-alert>
            } @else {
              <app-choice-list
                legend="Contact person"
                i18n-legend="@@checkout.contact.legend"
                groupName="checkout-contact"
                testId="checkout-contact"
                emptyText="You have no saved contacts yet."
                i18n-emptyText="@@checkout.contact.empty"
                [options]="contactOptions()"
                [selected]="store.contactName()"
                [busy]="store.selecting() === 'contact'"
                (choose)="onChooseContact($event)"
              />

              @if (contactFormOpen()) {
                <app-contact-form
                  [pending]="creatingContact()"
                  [error]="createContactError()"
                  [fieldErrors]="createContactFieldErrors()"
                  (submitted)="onCreateContact($event)"
                  (cancelled)="closeContactForm()"
                />
              } @else {
                <button
                  yob-button
                  variant="secondary"
                  size="sm"
                  type="button"
                  class="mt-3"
                  (click)="openContactForm()"
                  data-testid="checkout-add-contact"
                  i18n="@@checkout.contact.add"
                >
                  Add new contact
                </button>
              }
            }
          </section>

          <!-- ------------------------------------------------------ billing -->
          <section data-testid="checkout-billing-section">
            @if (addresses.isLoading()) {
              <div class="flex justify-center py-4" data-testid="addresses-loading">
                <app-spinner label="Loading addresses" i18n-label="@@checkout.addresses.loading" />
              </div>
            } @else if (addresses.error()) {
              <app-alert tone="error" data-testid="addresses-error">
                <span i18n="@@checkout.addresses.error">
                  We could not load your addresses. Please try again.
                </span>
              </app-alert>
            } @else {
              <app-choice-list
                legend="Billing address"
                i18n-legend="@@checkout.billing.legend"
                groupName="checkout-billing"
                testId="checkout-billing"
                emptyText="You have no saved addresses yet."
                i18n-emptyText="@@checkout.address.empty"
                [options]="addressOptions()"
                [selected]="store.billingAddressName()"
                [busy]="store.selecting() === 'billing'"
                (choose)="onChooseBilling($event)"
              />

              @if (addressContext() === 'billing') {
                <app-address-form
                  [pending]="creatingAddress()"
                  [error]="createAddressError()"
                  [fieldErrors]="createAddressFieldErrors()"
                  (submitted)="onCreateAddress($event)"
                  (cancelled)="closeAddressForm()"
                />
              } @else {
                <button
                  yob-button
                  variant="secondary"
                  size="sm"
                  type="button"
                  class="mt-3"
                  (click)="openAddressForm('billing')"
                  data-testid="checkout-add-billing-address"
                  i18n="@@checkout.billing.add"
                >
                  Add new address
                </button>
              }
            }
          </section>

          <!-- ----------------------------------------------------- shipping -->
          <!-- Rendered purely from the cart's is_shippable, re-read on every response. -->
          @if (store.isShippable()) {
            <section data-testid="checkout-shipping-section">
              @if (addresses.isLoading()) {
                <div class="flex justify-center py-4">
                  <app-spinner
                    label="Loading addresses"
                    i18n-label="@@checkout.addresses.loading"
                  />
                </div>
              } @else if (addresses.error()) {
                <app-alert tone="error">
                  <span i18n="@@checkout.addresses.error">
                    We could not load your addresses. Please try again.
                  </span>
                </app-alert>
              } @else {
                <app-choice-list
                  legend="Shipping address"
                  i18n-legend="@@checkout.shipping.legend"
                  groupName="checkout-shipping"
                  testId="checkout-shipping"
                  emptyText="You have no saved addresses yet."
                  i18n-emptyText="@@checkout.address.empty"
                  [options]="addressOptions()"
                  [selected]="store.shippingAddressName()"
                  [busy]="store.selecting() === 'shipping'"
                  (choose)="onChooseShipping($event)"
                />

                @if (shipsToBillingAddress()) {
                  <!-- Derived by comparing the two identifiers the cart returned. There
                       is no "same as billing" flag in the contract and none is invented. -->
                  <p
                    class="mt-2 text-sm text-slate-600"
                    data-testid="checkout-same-as-billing"
                    i18n="@@checkout.shipping.sameAsBilling"
                  >
                    Same as your billing address.
                  </p>
                }

                @if (addressContext() === 'shipping') {
                  <app-address-form
                    [pending]="creatingAddress()"
                    [error]="createAddressError()"
                    [fieldErrors]="createAddressFieldErrors()"
                    (submitted)="onCreateAddress($event)"
                    (cancelled)="closeAddressForm()"
                  />
                } @else {
                  <button
                    yob-button
                    variant="secondary"
                    size="sm"
                    type="button"
                    class="mt-3"
                    (click)="openAddressForm('shipping')"
                    data-testid="checkout-add-shipping-address"
                    i18n="@@checkout.shipping.add"
                  >
                    Add new address
                  </button>
                }
              }
            </section>
          }

          <!-- --------------------------------------- readiness and proceed -->
          <section aria-live="polite" data-testid="checkout-readiness">
            @if (isReady()) {
              <app-alert tone="success">
                <span i18n="@@checkout.ready">Ready to proceed.</span>
              </app-alert>
            } @else {
              <p class="text-sm text-slate-600" data-testid="checkout-not-ready">
                {{ outstandingMessage() }}
              </p>
            }
          </section>

          <div>
            <!-- Disabled rather than hidden: a button that vanishes leaves the buyer
                 wondering where checkout continues. The readiness line above says what
                 is missing. Backend validation remains authoritative either way. -->
            <!-- The only primary action on the page. Full width on a phone so it is a
                 thumb target, and never competing with the supporting "Add new"
                 buttons above, which are secondary for exactly that reason. -->
            <button
              yob-button
              type="button"
              class="w-full sm:w-auto sm:min-w-56"
              [disabled]="!isReady()"
              [loading]="proceeding()"
              (click)="onProceedToPayment()"
              data-testid="checkout-proceed"
              i18n="@@checkout.proceed"
            >
              Proceed to Payment
            </button>
          </div>
        </div>

        <app-checkout-summary [cart]="cart" />
      </div>
    }
  `,
})
export class CheckoutPage {
  protected readonly store = inject(CartStore);
  private readonly api = inject(AddressBookApi);
  private readonly checkoutApi = inject(CheckoutApi);
  private readonly router = inject(Router);

  /**
   * Master data. Two independent resources, started at construction alongside the
   * cart load below - none waits for another.
   */
  protected readonly addresses = rxResource({ stream: () => this.api.getAddresses() });
  protected readonly contacts = rxResource({ stream: () => this.api.getContacts() });

  protected readonly addressOptions = computed(() =>
    (this.addresses.value() ?? []).map(toAddressChoice),
  );
  protected readonly contactOptions = computed(() =>
    (this.contacts.value() ?? []).map(toContactChoice),
  );

  private readonly addressContextSignal = signal<AddressContext | null>(null);
  protected readonly addressContext = this.addressContextSignal.asReadonly();
  protected readonly contactFormOpen = signal(false);

  protected readonly creatingAddress = signal(false);
  protected readonly createAddressError = signal('');
  protected readonly createAddressFieldErrors = signal<Readonly<Record<string, string>>>({});

  protected readonly creatingContact = signal(false);
  protected readonly createContactError = signal('');
  protected readonly createContactFieldErrors = signal<Readonly<Record<string, string>>>({});

  /** A `proceed_to_payment` is in flight. Also what blocks a second submission. */
  protected readonly proceeding = signal(false);
  protected readonly proceedErrorMessage = signal<string | null>(null);

  constructor() {
    // Third of the three parallel loads. The store may already hold a payload from the
    // cart page; re-read anyway so checkout decides from current server truth.
    this.store.load().subscribe();
  }

  protected readonly showsCartLoading = computed(
    () => this.store.isLoading() && !this.store.isLoaded(),
  );

  protected readonly selectionErrorMessage = computed(() => {
    const error = this.store.selectionError();
    return error === null ? null : checkoutSelectionErrorMessage(error);
  });

  /** True when the server has shipping pointing at the billing address. */
  protected readonly shipsToBillingAddress = computed(() => {
    const billing = this.store.billingAddressName();
    return billing !== null && billing === this.store.shippingAddressName();
  });

  /**
   * Whether checkout looks complete.
   *
   * UX only. `proceed_to_payment` re-validates all of it server-side in Phase 12, and
   * this is not a substitute for that - it decides whether to show an encouraging
   * message, nothing more.
   */
  protected readonly isReady = computed(() => {
    if (this.store.cart() === null || this.store.isEmpty()) {
      return false;
    }
    const shippingSatisfied =
      !this.store.isShippable() || this.store.shippingAddressName() !== null;

    return (
      this.store.contactName() !== null &&
      this.store.billingAddressName() !== null &&
      shippingSatisfied
    );
  });

  protected readonly outstandingMessage = computed(() => {
    const missing: string[] = [];
    if (this.store.contactName() === null) {
      missing.push($localize`:@@checkout.missing.contact:a contact person`);
    }
    if (this.store.billingAddressName() === null) {
      missing.push($localize`:@@checkout.missing.billing:a billing address`);
    }
    if (this.store.isShippable() && this.store.shippingAddressName() === null) {
      missing.push($localize`:@@checkout.missing.shipping:a shipping address`);
    }
    return $localize`:@@checkout.stillNeeded:Still to choose: ${missing.join(', ')}:items:.`;
  });

  // ------------------------------------------------------------- selection

  protected onChooseContact(contactName: string): void {
    this.runSelection(this.store.setContact(contactName), () => this.contacts.reload());
  }

  protected onChooseBilling(addressName: string): void {
    this.runSelection(this.store.setBillingAddress(addressName), () => this.addresses.reload());
  }

  protected onChooseShipping(addressName: string): void {
    this.runSelection(this.store.setShippingAddress(addressName), () => this.addresses.reload());
  }

  /**
   * Run a selection and, if the server rejected the record, re-read the list it came
   * from.
   *
   * The store swallows the failure into `selectionError`, so the stream always
   * completes; the error is set by then. A rejected record means the list on screen is
   * stale - the record was deleted, or was never this customer's - and offering the
   * same stale list again would invite the same failure.
   */
  private runSelection(
    selection: { subscribe: (o: { complete: () => void }) => void },
    refreshMasterData: () => void,
  ): void {
    selection.subscribe({
      complete: () => {
        const error = this.store.selectionError();
        if (error !== null && selectionNeedsMasterDataRefresh(error)) {
          refreshMasterData();
        }
      },
    });
  }

  // --------------------------------------------------------------- proceed

  /**
   * Ask the server to issue the checkout credential, then hand off to the payment route.
   *
   * ## What this does not do
   *
   * It does not commit anything. `proceed_to_payment` issues or reuses a Payment
   * Request against the current cart - the cart becomes a Sales Order later, inside
   * `process_payment`, once the buyer has chosen how to pay. So there is no local
   * "ordered" transition here, optimistic or otherwise, and the cart is left exactly
   * as the server last reported it.
   *
   * It also does not distinguish `201` from `200`. Created, reused and
   * credential-rotated are the same outcome as far as the buyer is concerned: go here
   * next.
   *
   * ## Failure
   *
   * The server re-validates its own preconditions at the moment of issue, so this can
   * fail on a page that looked ready - another tab emptied the cart, a selected record
   * was deleted. The buyer stays on checkout, and the cart is re-read so the page
   * shows current server truth rather than a guess at what went wrong.
   */
  protected onProceedToPayment(): void {
    // Readiness is re-checked here, not only bound to the button: a disabled button is
    // a UI affordance, and this is the one place that must not start the request.
    if (this.proceeding() || !this.isReady()) {
      return;
    }

    this.proceeding.set(true);
    this.proceedErrorMessage.set(null);

    this.checkoutApi.proceedToPayment().subscribe({
      next: (data) => {
        // The server owns where checkout continues, but "the server said so" is not a
        // licence to navigate anywhere - see `sanitizePaymentUrl`.
        const destination = sanitizePaymentUrl(data.payment_url);

        if (destination === null) {
          this.proceeding.set(false);
          this.proceedErrorMessage.set(
            proceedToPaymentErrorMessage(normalizeYobFailure(new Error('unusable payment_url'))),
          );
          return;
        }

        // Angular routing, not a location assignment: this is an internal SPA path.
        // The token stays in the URL and is not copied anywhere.
        void this.router.navigateByUrl(destination);
      },
      error: (failure: unknown) => {
        this.proceeding.set(false);
        const error = normalizeYobFailure(failure);
        this.proceedErrorMessage.set(proceedToPaymentErrorMessage(error));

        if (CHECKOUT_STATE_ERROR_CODES.has(error.code)) {
          // The cart is what these complain about, so re-read it rather than trying to
          // work out locally what changed.
          this.store.load().subscribe();
        }
      },
    });
  }

  // ---------------------------------------------------------------- create

  protected openAddressForm(context: AddressContext): void {
    this.addressContextSignal.set(context);
    this.createAddressError.set('');
    this.createAddressFieldErrors.set({});
  }

  protected closeAddressForm(): void {
    this.addressContextSignal.set(null);
  }

  protected openContactForm(): void {
    this.contactFormOpen.set(true);
    this.createContactError.set('');
    this.createContactFieldErrors.set({});
  }

  protected closeContactForm(): void {
    this.contactFormOpen.set(false);
  }

  /**
   * Create an address, then adopt it.
   *
   * create → re-read the list → select into whichever slot opened the form. The
   * re-read is not redundant with the create response: the backend normalises fields
   * on insert and caches the list per customer, so the list is the authoritative view
   * of what the customer now owns. Only the created record's `name` is taken from the
   * create reply, because the list read cannot tell us which row is new.
   *
   * The context decides the setter, and only that setter runs - the backend may then
   * copy billing into shipping of its own accord, which is its decision to make.
   */
  protected onCreateAddress(request: AddAddressRequest): void {
    const context = this.addressContextSignal();
    if (context === null || this.creatingAddress()) {
      return;
    }

    this.creatingAddress.set(true);
    this.createAddressError.set('');
    this.createAddressFieldErrors.set({});

    this.api.addAddress(request).subscribe({
      next: (created) => {
        this.creatingAddress.set(false);
        this.addressContextSignal.set(null);
        this.addresses.reload();

        const selection =
          context === 'billing'
            ? this.store.setBillingAddress(created.name)
            : this.store.setShippingAddress(created.name);
        this.runSelection(selection, () => this.addresses.reload());
      },
      error: (failure: unknown) => {
        this.creatingAddress.set(false);
        this.applyCreateFailure(failure, this.createAddressError, this.createAddressFieldErrors);
      },
    });
  }

  /** Create a contact, then adopt it. Same shape as the address flow, same reasons. */
  protected onCreateContact(request: AddContactRequest): void {
    if (this.creatingContact()) {
      return;
    }

    this.creatingContact.set(true);
    this.createContactError.set('');
    this.createContactFieldErrors.set({});

    this.api.addContact(request).subscribe({
      next: (created) => {
        this.creatingContact.set(false);
        this.contactFormOpen.set(false);
        this.contacts.reload();
        this.runSelection(this.store.setContact(created.name), () => this.contacts.reload());
      },
      error: (failure: unknown) => {
        this.creatingContact.set(false);
        this.applyCreateFailure(failure, this.createContactError, this.createContactFieldErrors);
      },
    });
  }

  /** Turn a create failure into safe wording, attached to a field where one is named. */
  private applyCreateFailure(
    failure: unknown,
    message: { set: (value: string) => void },
    fieldErrors: { set: (value: Readonly<Record<string, string>>) => void },
  ): void {
    const error = normalizeYobFailure(failure);
    const text = checkoutCreateErrorMessage(error);

    if (error.field !== undefined) {
      fieldErrors.set({ [error.field]: text });
      message.set('');
      return;
    }

    message.set(text);
    fieldErrors.set({});
  }
}
