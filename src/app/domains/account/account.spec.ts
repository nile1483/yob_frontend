import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, Subject } from 'rxjs';

import { MockServerAddressBook } from '../../../mock-api/core/mock-server-address-book';
import { MockServerSession } from '../../../mock-api/core/mock-server-session';
import {
  MOCK_ADDRESS_LOCAL,
  MOCK_CONTACT_PRIMARY,
} from '../../../mock-api/fixtures/address-book.fixture';
import { mockApiInterceptor } from '../../../mock-api/mock-api.interceptor';
import { MockApiScenario } from '../../../mock-api/scenarios/mock-scenario';
import { routes } from '../../app.routes';
import { yobCsrfInterceptor } from '../../foundation/network/csrf.interceptor';
import { normalizeYobFailure } from '../../foundation/network/yob-api-error';
import { YOB_API_CONFIG, type YobApiConfig } from '../../foundation/network/yob-api.config';
import { SessionStore } from '../../foundation/session/session.store';
import { AddressBookApi } from '../checkout/data/address-book.api';
import { changedFields, hasChanges, toFormValues } from './account.changed-fields';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };
const UPDATE_ADDRESS = '/api/method/yob_storefront.api.address.update_address';
const UPDATE_CONTACT = '/api/method/yob_storefront.api.address.update_contact';
const DELETE_ADDRESS = '/api/method/yob_storefront.api.address.delete_address';
const DELETE_CONTACT = '/api/method/yob_storefront.api.address.delete_contact';
const GET_ADDRESSES = '/api/method/yob_storefront.api.address.get_addresses';

/**
 * ## Mutation results (Phase 15)
 *
 * These tests were checked by breaking the code on purpose and confirming they fail.
 * Killed: padding every field into the patch (9 failures); comparing with truthiness so
 * clearing a field is dropped (3); retrying the delete inside the uncertain-outcome
 * recovery; treating a 409 refusal as uncertain; rendering a field error as a form-level
 * banner; closing the editor on a validation failure; skipping the list re-read on
 * `*_not_found` in either the save or the delete path; and sending a name-only request
 * when nothing changed.
 *
 * Survived by design: removing *either* the `deleting()` guard or the button's disabled
 * state, because both enforce "one delete per confirmation" independently - removing
 * both together fails, which is what proves each is load-bearing rather than decorative.
 */
describe('Account', () => {
  // ============================================== the partial-update contract

  describe('changedFields', () => {
    const stored = {
      address_line1: 'Old',
      address_line2: 'Suite 4',
      phone: '123',
      email: 'hello@example.test',
    };

    it('emits only what changed', () => {
      const patch = changedFields(stored, { ...stored, address_line1: 'New' });

      expect(patch).toEqual({ address_line1: 'New' });
    });

    it('does NOT pad the payload with the untouched fields', () => {
      // The bug this whole helper exists to prevent: sending `""` for a field the
      // buyer never touched is a deliberate CLEAR to the backend, so padding would
      // destroy exactly the data that backend Phase 15B stopped destroying.
      const patch = changedFields(stored, { ...stored, address_line1: 'New' }) as Record<
        string,
        unknown
      >;

      expect(patch['address_line2']).toBeUndefined();
      expect(patch['phone']).toBeUndefined();
      expect(patch['email']).toBeUndefined();
      expect(Object.keys(patch)).toEqual(['address_line1']);
    });

    it('sends an explicit empty string when a value is deliberately cleared', () => {
      const patch = changedFields(stored, { ...stored, phone: '' });

      // Present and empty - the difference between "leave it" and "remove it".
      expect(patch).toEqual({ phone: '' });
      expect('phone' in patch).toBe(true);
    });

    it('is not fooled by truthiness', () => {
      // `if (value)` would drop every one of these.
      const before = { a: 'x', b: 'y', c: 'z' };
      const patch = changedFields(before, { a: '', b: '0', c: 'z' });

      expect(patch).toEqual({ a: '', b: '0' });
    });

    it('ignores a change that is only whitespace', () => {
      expect(changedFields(stored, { ...stored, phone: ' 123 ' })).toEqual({});
      expect(hasChanges({})).toBe(false);
    });

    it('treats a stored null as an empty value, so no spurious clear is sent', () => {
      // `get_addresses` returns null for unset fields; the form holds ''. Both
      // normalise, so an untouched empty field produces no key.
      const values = toFormValues({ address_line2: null, city: 'Ahmedabad' }, [
        'address_line2',
        'city',
      ]);

      expect(values).toEqual({ address_line2: '', city: 'Ahmedabad' });
      expect(changedFields(values, values)).toEqual({});
    });
  });

  // ================================================================== the API

  describe('AddressBookApi mutations', () => {
    let api: AddressBookApi;
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: YOB_API_CONFIG, useValue: CONFIG },
        ],
      });
      api = TestBed.inject(AddressBookApi);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('posts a partial address update to the documented method', () => {
      api.updateAddress({ name: 'A-Billing', address_line1: 'New' }).subscribe();

      const req = http.expectOne(UPDATE_ADDRESS);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'A-Billing', address_line1: 'New' });
      req.flush({ message: { data: { name: 'A-Billing' } } });
    });

    it('posts a partial contact update', () => {
      api.updateContact({ name: 'C-1', phone: '' }).subscribe();

      const req = http.expectOne(UPDATE_CONTACT);
      // An explicit clear survives as a present, empty key.
      expect((req.request.body as Record<string, unknown>)['phone']).toBe('');
      req.flush({ message: { data: { name: 'C-1' } } });
    });

    it('deletes by name only', () => {
      api.deleteAddress('A-Billing').subscribe();

      const req = http.expectOne(DELETE_ADDRESS);
      expect(req.request.body).toEqual({ name: 'A-Billing' });
      req.flush({ message: { data: {} } });
    });

    it('never uses a generic Frappe resource endpoint', () => {
      api.updateAddress({ name: 'A' }).subscribe();
      api.deleteContact('C').subscribe();

      http.expectNone((r) => r.url.includes('/api/resource/'));
      http.expectOne(UPDATE_ADDRESS).flush({ message: { data: {} } });
      http.expectOne(DELETE_CONTACT).flush({ message: { data: {} } });
    });

    it('does NOT retry a failed delete', () => {
      api.deleteAddress('A-Billing').subscribe({ error: () => undefined });

      http.expectOne(DELETE_ADDRESS).error(new ProgressEvent('network error'));

      // A delete that succeeded and lost its response answers 404 next time, so a
      // retry would turn a completed deletion into an apparent failure.
      http.expectNone(DELETE_ADDRESS);
    });

    it('surfaces address_in_use with its stable code', () => {
      let code: string | undefined;
      api.deleteAddress('A').subscribe({ error: (e: { code: string }) => (code = e.code) });

      http.expectOne(DELETE_ADDRESS).flush(
        { message: { errors: [{ code: 'address_in_use', detail: 'x', field: 'name' }] } },
        { status: 409, statusText: 'Conflict' },
      );

      expect(code).toBe('address_in_use');
    });
  });

  // ================================================================= the page

  describe('AccountPage', () => {
    let scenario: MockApiScenario;
    let book: MockServerAddressBook;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter(routes, withComponentInputBinding()),
          provideHttpClient(withInterceptors([yobCsrfInterceptor, mockApiInterceptor])),
          provideHttpClientTesting(),
          { provide: YOB_API_CONFIG, useValue: CONFIG },
        ],
      });
      scenario = TestBed.inject(MockApiScenario);
      book = TestBed.inject(MockServerAddressBook);
      TestBed.inject(MockServerSession).signIn('TEST_APP', 'password');
      TestBed.inject(SessionStore).restore().subscribe();
    });

    afterEach(() => {
      scenario.reset();
      book.reset();
    });

    async function open() {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/account');
      await harness.fixture.whenStable();
      const root = harness.fixture.nativeElement as HTMLElement;

      const settle = async () => {
        for (let i = 0; i < 4; i++) {
          await Promise.resolve();
        }
        harness.fixture.detectChanges();
        await harness.fixture.whenStable();
        harness.fixture.detectChanges();
      };
      await settle();

      return {
        settle,
        root,
        text: () => root.textContent ?? '',
        testId: (id: string) => root.querySelector(`[data-testid="${id}"]`),
        all: (id: string) => Array.from(root.querySelectorAll(`[data-testid="${id}"]`)),
        click: async (id: string, index = 0) => {
          const el = Array.from(
            root.querySelectorAll(`[data-testid="${id}"]`),
          )[index] as HTMLElement;
          el.click();
          // Twice: Signal Forms' `submit()` resolves a microtask after the click, so
          // one flush lands before the action has run.
          await settle();
          await settle();
        },
        fill: async (id: string, value: string) => {
          const input = root.querySelector(`[data-testid="${id}"]`) as HTMLInputElement;
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
          await settle();
        },
      };
    }

    // ------------------------------------------------------------------ lists

    it('lists addresses and contacts', async () => {
      const view = await open();

      expect(view.all('address-item')).toHaveLength(2);
      expect(view.all('contact-item')).toHaveLength(2);
      expect(view.text()).toContain('Head Office');
      expect(view.text()).toContain('Priya Mock');
    });

    it('shows empty states rather than errors', async () => {
      scenario.scenario.set('empty');
      const view = await open();

      expect(view.testId('addresses-empty')).not.toBeNull();
      expect(view.testId('contacts-empty')).not.toBeNull();
      expect(view.testId('addresses-error')).toBeNull();
    });

    it('reports a load failure safely', async () => {
      scenario.scenario.set('server-error');
      const view = await open();

      expect(view.testId('addresses-error')).not.toBeNull();
      expect(view.text()).not.toContain('internal_server_error');
      expect(view.text()).not.toContain('Traceback');
    });

    it('never shows the Frappe document id as content', async () => {
      const view = await open();

      // The identifier is the mutation key, not something a buyer reads.
      expect(view.testId('address-item-title')?.textContent).not.toContain('ADDR-MOCK');
    });

    // ----------------------------------------------------------------- create

    it('creates an address and refreshes the list', async () => {
      const view = await open();
      await view.click('account-add-address');

      await view.fill('address-title', 'New Depot');
      await view.fill('address-line1', 'Shed 9');
      await view.fill('address-city', 'Pune');
      await view.fill('address-country', 'India');
      await view.click('address-form-submit');
      await view.settle();

      expect(view.all('address-item')).toHaveLength(3);
      expect(view.text()).toContain('New Depot');
      expect(view.testId('address-form')).toBeNull();
    });

    it('creates a contact and refreshes the list', async () => {
      const view = await open();
      await view.click('account-add-contact');

      await view.fill('contact-first-name', 'Anita');
      await view.fill('contact-last-name', 'Mock');
      await view.click('contact-form-submit');
      await view.settle();

      expect(view.all('contact-item')).toHaveLength(3);
      expect(view.text()).toContain('Anita Mock');
    });

    // ------------------------------------------------------------------ edit

    it('populates the editor with the current values', async () => {
      const view = await open();
      await view.click('address-edit');

      const line1 = view.testId('address-line1') as HTMLInputElement;
      expect(line1.value).toBe('Plot 19, Sanand Industrial Estate');
    });

    it('sends only the changed field, preserving the rest', async () => {
      const api = TestBed.inject(AddressBookApi);
      const spy = vi.spyOn(api, 'updateAddress');
      const view = await open();

      await view.click('address-edit');
      await view.fill('address-line1', 'Plot 20, Sanand Industrial Estate');
      await view.click('address-form-submit');
      await view.settle();

      expect(spy).toHaveBeenCalledTimes(1);
      const payload = spy.mock.calls[0][0] as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual(['address_line1', 'name']);
      // The stored second line and title are untouched and absent from the request.
      expect(payload['address_line2']).toBeUndefined();
      expect(payload['address_title']).toBeUndefined();
    });

    it('keeps the untouched fields after the refresh', async () => {
      const view = await open();

      await view.click('address-edit');
      await view.fill('address-line1', 'Plot 20, Sanand Industrial Estate');
      await view.click('address-form-submit');
      await view.settle();

      // Phase II was the second line of this fixture and must survive the edit.
      expect(view.text()).toContain('Phase II');
      expect(view.text()).toContain('Plot 20');
    });

    it('sends an explicit clear when a field is emptied', async () => {
      const api = TestBed.inject(AddressBookApi);
      const spy = vi.spyOn(api, 'updateAddress');
      const view = await open();

      await view.click('address-edit');
      await view.fill('address-line2', '');
      await view.click('address-form-submit');
      await view.settle();

      const payload = spy.mock.calls[0][0] as Record<string, unknown>;
      expect(payload['address_line2']).toBe('');
      expect('address_line2' in payload).toBe(true);
    });

    it('makes no request when nothing changed', async () => {
      const api = TestBed.inject(AddressBookApi);
      const spy = vi.spyOn(api, 'updateAddress');
      const view = await open();

      await view.click('address-edit');
      await view.click('address-form-submit');
      await view.settle();

      expect(spy).not.toHaveBeenCalled();
      expect(view.testId('address-form')).toBeNull();
    });

    it('blocks a cleared required field before any request', async () => {
      const api = TestBed.inject(AddressBookApi);
      const spy = vi.spyOn(api, 'updateAddress');
      const view = await open();

      await view.click('address-edit');
      await view.fill('address-city', '');
      await view.click('address-form-submit');

      // Client validation catches it, so the round trip never happens - but note the
      // backend would also refuse this, naming the field. Both layers agree.
      expect(spy).not.toHaveBeenCalled();
      expect(view.testId('address-form')).not.toBeNull();
      expect(view.text()).toContain('Enter the city.');
    });

    it('maps a server field error onto the matching input', async () => {
      // A rule only the backend knows - India Compliance pincode validation, say.
      // Thrown the way the network layer would really produce it: a 422 carrying a YOB
      // envelope, normalized by the same code the live client uses. Hand-rolling a
      // `{code, field}` literal here would prove nothing - `normalizeYobFailure` would
      // reject it as unrecognizable and fall through to the generic message.
      const api = TestBed.inject(AddressBookApi);
      const failure = normalizeYobFailure(
        new HttpErrorResponse({
          status: 422,
          url: UPDATE_ADDRESS,
          error: {
            message: {
              errors: [
                { code: 'validation_failed', field: 'pincode', detail: 'Invalid PIN code' },
              ],
            },
          },
        }),
      );
      vi.spyOn(api, 'updateAddress').mockReturnValue(new Observable((s) => s.error(failure)));
      const view = await open();

      await view.click('address-edit');
      await view.fill('address-pincode', '99');
      await view.click('address-form-submit');
      await view.settle();

      // The form stays open so the buyer can correct it, and the message sits against
      // the field rather than floating at the top. Asserted through the accessibility
      // wiring, because that is what makes it *the field's* error: a form-level banner
      // would still put the words on screen but would leave the input unmarked and
      // undescribed, which is the failure this test exists to catch.
      expect(view.testId('address-form')).not.toBeNull();
      const pincode = view.testId('address-pincode');
      expect(pincode?.getAttribute('aria-invalid')).toBe('true');

      const describedBy = pincode?.getAttribute('aria-describedby') ?? '';
      const description = describedBy
        .split(' ')
        .map((id) => view.root.querySelector(`#${id}`)?.textContent ?? '')
        .join(' ');
      expect(description).toContain('Please check this value.');

      // And no other field was marked.
      expect(view.testId('address-city')?.getAttribute('aria-invalid')).toBe('false');
      // Never the backend's own words, nor its stable code.
      expect(view.text()).not.toContain('Invalid PIN code');
      expect(view.text()).not.toContain('validation_failed');
    });

    it('edits a contact partially', async () => {
      const api = TestBed.inject(AddressBookApi);
      const spy = vi.spyOn(api, 'updateContact');
      const view = await open();

      await view.click('contact-edit');
      await view.fill('contact-last-name', 'Renamed');
      await view.click('contact-form-submit');
      await view.settle();

      const payload = spy.mock.calls[0][0] as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual(['last_name', 'name']);
      // The stored email is not resent and therefore not cleared.
      expect(payload['email']).toBeUndefined();
    });

    it('does not let the record identifier be edited', async () => {
      const view = await open();
      await view.click('address-edit');

      // There is no input bound to `name`; it travels with the payload only.
      expect(view.root.querySelector('[data-testid="address-name"]')).toBeNull();
    });

    it('refuses a second submit while one is in flight', async () => {
      const api = TestBed.inject(AddressBookApi);
      const spy = vi
        .spyOn(api, 'updateAddress')
        .mockReturnValue(new Observable<never>());
      const view = await open();

      await view.click('address-edit');
      await view.fill('address-line1', 'Changed');
      await view.click('address-form-submit');
      await view.click('address-form-submit');
      await view.click('address-form-submit');

      expect(spy).toHaveBeenCalledTimes(1);
    });

    // ---------------------------------------------------------------- delete

    it('asks for confirmation before deleting', async () => {
      const api = TestBed.inject(AddressBookApi);
      const spy = vi.spyOn(api, 'deleteAddress');
      const view = await open();

      await view.click('address-delete');

      expect(view.testId('address-confirm')).not.toBeNull();
      expect(spy).not.toHaveBeenCalled();
      // And the record is named in human terms, not by its document id.
      expect(view.testId('address-confirm')?.textContent).toContain('Head Office');
    });

    it('cancels without deleting', async () => {
      const api = TestBed.inject(AddressBookApi);
      const spy = vi.spyOn(api, 'deleteAddress');
      const view = await open();

      await view.click('address-delete');
      await view.click('address-confirm-cancel');

      expect(spy).not.toHaveBeenCalled();
      expect(view.testId('address-confirm')).toBeNull();
      expect(view.all('address-item')).toHaveLength(2);
    });

    it('deletes an unreferenced address and refreshes', async () => {
      const view = await open();

      await view.click('address-delete');
      await view.click('address-confirm-confirm');
      await view.settle();

      expect(view.all('address-item')).toHaveLength(1);
      expect(view.testId('account-notice')?.textContent).toContain('deleted');
    });

    it('treats address_in_use as a business outcome, keeping the record', async () => {
      scenario.scenario.set('account-record-in-use');
      const view = await open();

      await view.click('address-delete');
      await view.click('address-confirm-confirm');
      await view.settle();

      // Phrased as information with a way forward, not as a refusal.
      expect(view.text()).toContain('used by an existing order');
      expect(view.text()).toContain('You can edit it instead');
      // Still listed, and nothing suggests a server fault or a retry.
      expect(view.all('address-item')).toHaveLength(2);
      expect(view.text()).not.toContain('Please try again');
      expect(view.text()).not.toContain('address_in_use');
    });

    it('re-reads the list when a save lands on a record that is gone', async () => {
      const view = await open();

      await view.click('address-edit');
      // Removed elsewhere while the buyer had the form open.
      book.removeAddress(MOCK_ADDRESS_LOCAL);
      await view.fill('address-city', 'Pune');
      await view.click('address-form-submit');
      await view.settle();

      // The editor closes - there is nothing left to edit - and the list is re-read so
      // the buyer is not looking at a row that no longer exists.
      expect(view.testId('address-form')).toBeNull();
      expect(view.all('address-item')).toHaveLength(1);
      expect(view.text()).toContain('no longer available');
    });

    it('gives focus to the confirmation, on the safe choice', async () => {
      const view = await open();

      (view.testId('address-delete') as HTMLButtonElement).focus();
      await view.click('address-delete');

      // The confirmation replaced the focused button. Leaving focus on the removed
      // element sends it to `<body>`, and the next Tab restarts from the top of the
      // page - in the middle of a destructive action. It lands on Cancel, so the
      // reflexive Enter keeps the record.
      expect(document.activeElement).toBe(view.testId('address-confirm-cancel'));

      // The other half - focus returning to the Delete button when the confirmation is
      // dismissed - needs a real render pass, which this harness never schedules, so it
      // is asserted in `e2e/account.spec.ts` instead of faked here.
    });

    it('sends one delete however many times Confirm is pressed', async () => {
      // A delete is not safe to repeat: the second one answers 404 for a deletion that
      // worked, so a double-press must not become two requests. The subject holds the
      // first request open, which is exactly the window a real double-click lands in.
      const api = TestBed.inject(AddressBookApi);
      const inFlight = new Subject<void>();
      const spy = vi.spyOn(api, 'deleteAddress').mockReturnValue(inFlight.asObservable());
      const view = await open();

      await view.click('address-delete');
      await view.click('address-confirm-confirm');
      await view.click('address-confirm-confirm');
      await view.click('address-confirm-confirm');

      expect(spy).toHaveBeenCalledTimes(1);

      inFlight.next();
      inFlight.complete();
      await view.settle();
    });

    it('re-reads the list when the record turns out to be gone', async () => {
      const view = await open();
      expect(view.all('address-item')).toHaveLength(2);

      // Deleted elsewhere - another tab, or Desk - after this page loaded. The stale row
      // is still on screen and still has working buttons.
      book.removeAddress(MOCK_ADDRESS_LOCAL);

      await view.click('address-delete');
      await view.click('address-confirm-confirm');
      await view.settle();

      // The refreshed list is the truth: the row goes, without the buyer reloading.
      expect(view.all('address-item')).toHaveLength(1);
      expect(view.text()).toContain('no longer available');
      expect(view.text()).not.toContain('address_not_found');
    });

    it('does not treat a gone record as a lost session', async () => {
      const session = TestBed.inject(SessionStore);
      const view = await open();
      book.removeAddress(MOCK_ADDRESS_LOCAL);

      await view.click('address-delete');
      await view.click('address-confirm-confirm');
      await view.settle();

      // `address_not_found` is a business answer about one record. Clearing the session
      // or bouncing to sign-in over it would throw away a working login.
      expect(session.isAuthenticated()).toBe(true);
      expect(view.testId('address-item')).not.toBeNull();
    });

    it('treats contact_in_use the same way', async () => {
      scenario.scenario.set('account-record-in-use');
      const view = await open();

      await view.click('contact-delete');
      await view.click('contact-confirm-confirm');
      await view.settle();

      // Phrased as information with a way forward, not as a refusal.
      expect(view.text()).toContain('used by an existing order');
      expect(view.text()).toContain('You can edit it instead');
      expect(view.all('contact-item')).toHaveLength(2);
    });

    it('issues one delete however many times confirm is pressed', async () => {
      const api = TestBed.inject(AddressBookApi);
      const spy = vi
        .spyOn(api, 'deleteAddress')
        .mockReturnValue(new Observable<never>());
      const view = await open();

      await view.click('address-delete');
      await view.click('address-confirm-confirm');
      await view.click('address-confirm-confirm');
      await view.click('address-confirm-confirm');

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('recovers from an uncertain delete by re-reading the list', async () => {
      const api = TestBed.inject(AddressBookApi);
      const http = TestBed.inject(HttpTestingController);
      vi.spyOn(api, 'deleteAddress').mockReturnValue(
        new Observable((subscriber) =>
          subscriber.error({ httpStatus: 0, code: 'client_network_unavailable' }),
        ),
      );
      const listSpy = vi.spyOn(api, 'getAddresses');
      const view = await open();
      listSpy.mockClear();

      await view.click('address-delete');
      await view.click('address-confirm-confirm');
      await view.settle();

      // A read, never another delete.
      expect(listSpy).toHaveBeenCalled();
      expect(view.text()).toContain("couldn't confirm");
      void http;
    });

    it('says nothing is known when the recovery read also fails', async () => {
      const api = TestBed.inject(AddressBookApi);
      // Installed after the initial load, so the page has a list to act on.
      const view = await open();
      vi.spyOn(api, 'deleteAddress').mockReturnValue(
        new Observable((s) => s.error({ httpStatus: 0, code: 'client_network_unavailable' })),
      );
      vi.spyOn(api, 'getAddresses').mockReturnValue(
        new Observable((s) => s.error({ httpStatus: 0, code: 'client_network_unavailable' })),
      );

      await view.click('address-delete');
      await view.click('address-confirm-confirm');
      await view.settle();

      expect(view.text()).toContain("couldn't confirm the result");
      expect(view.text()).not.toContain('Delete failed');
    });

    it('handles a record that vanished between load and delete', async () => {
      const view = await open();
      // Someone else removed it; the list on screen is stale.
      book.removeAddress(MOCK_ADDRESS_LOCAL);

      await view.click('address-delete');
      await view.click('address-confirm-confirm');
      await view.settle();

      expect(view.text()).toContain('no longer available');
      expect(TestBed.inject(SessionStore).isAuthenticated()).toBe(true);
    });

    it('keeps the session on any business refusal', async () => {
      scenario.scenario.set('account-record-in-use');
      const view = await open();

      await view.click('contact-delete');
      await view.click('contact-confirm-confirm');
      await view.settle();

      expect(TestBed.inject(SessionStore).isAuthenticated()).toBe(true);
      expect(TestBed.inject(SessionStore).status()).toBe('authenticated');
    });

    it('reads changes back immediately, with no cache workaround', async () => {
      // Backend Phase 15B fixed list-cache invalidation, so a refresh right after a
      // mutation must already show the new state. No timers, no delays.
      const view = await open();

      await view.click('address-edit');
      await view.fill('address-title', 'Renamed Immediately');
      await view.click('address-form-submit');
      await view.settle();

      expect(view.text()).toContain('Renamed Immediately');
    });

    // -------------------------------------------------------------- boundaries

    it('never touches the cart', async () => {
      const http = TestBed.inject(HttpTestingController);
      const view = await open();

      await view.click('account-add-address');
      await view.fill('address-title', 'Cartless');
      await view.fill('address-line1', 'Shed 1');
      await view.fill('address-city', 'Pune');
      await view.fill('address-country', 'India');
      await view.click('address-form-submit');
      await view.settle();

      // Account manages master data; selecting it into a cart is Checkout's job.
      http.expectNone((r) => r.url.includes('get_cart'));
      http.expectNone((r) => r.url.includes('set_cart_'));
      void MOCK_CONTACT_PRIMARY;
      void GET_ADDRESSES;
    });
  });
});
