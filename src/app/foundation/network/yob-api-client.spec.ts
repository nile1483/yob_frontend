import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { YOB_CLIENT_ERROR_CODES, YobApiError } from './yob-api-error';
import { YOB_API_CONFIG, type YobApiConfig } from './yob-api.config';
import { YobApiClient } from './yob-api-client';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'STOREFRONT' };
const CATEGORIES = 'yob_storefront.api.catalog.get_categories';

/**
 * Fixtures are copied from `reference/api/live/verified-responses.json` so these tests
 * fail if the real contract ever moves, rather than agreeing with a stale invention.
 */
describe('YobApiClient', () => {
  let client: YobApiClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    client = TestBed.inject(YobApiClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Run a request and capture whichever of next/error fires. */
  function collect<T>(source: ReturnType<YobApiClient['get']>): {
    value: () => T | undefined;
    error: () => YobApiError | undefined;
  } {
    let value: unknown;
    let error: YobApiError | undefined;
    source.subscribe({
      next: (v) => (value = v),
      error: (e: YobApiError) => (error = e),
    });
    return { value: () => value as T | undefined, error: () => error };
  }

  describe('RPC URL construction', () => {
    it('builds /api/method/<method> for GET', () => {
      client.get(CATEGORIES).subscribe();

      const req = http.expectOne((r) => r.url === `/api/method/${CATEGORIES}`);
      expect(req.request.method).toBe('GET');
      req.flush({ message: { data: [] } });
    });

    it('builds /api/method/<method> for POST and defaults the body to {}', () => {
      client.post('yob_storefront.api.cart.clear_cart').subscribe();

      const req = http.expectOne('/api/method/yob_storefront.api.cart.clear_cart');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ message: { data: {} } });
    });

    it('sends the given POST body unchanged', () => {
      client
        .post('yob_auth.api.auth.login_with_password', {
          application: 'STOREFRONT',
          username: 'a@b.test',
        })
        .subscribe();

      const req = http.expectOne('/api/method/yob_auth.api.auth.login_with_password');
      expect(req.request.body).toEqual({ application: 'STOREFRONT', username: 'a@b.test' });
      req.flush({ message: { data: {} } });
    });

    it('serialises query params and drops null/undefined', () => {
      client
        .get('yob_storefront.api.catalog.get_category', {
          slug: 'fasteners',
          qty: 10,
          flag: true,
          missing: null,
          absent: undefined,
        })
        .subscribe();

      const req = http.expectOne(
        (r) => r.url === '/api/method/yob_storefront.api.catalog.get_category',
      );
      expect(req.request.params.get('slug')).toBe('fasteners');
      expect(req.request.params.get('qty')).toBe('10');
      expect(req.request.params.get('flag')).toBe('true');
      expect(req.request.params.has('missing')).toBe(false);
      expect(req.request.params.has('absent')).toBe(false);
      req.flush({ message: { data: {} } });
    });

    it('rejects a method name that is not a Frappe dotted path', () => {
      expect(() => client.get('../../etc/passwd')).toThrow(/Invalid Frappe RPC method name/);
      expect(() => client.get('no_dots')).toThrow(/Invalid Frappe RPC method name/);
    });
  });

  describe('session and credentials', () => {
    it('leaves the sid cookie entirely to the browser', () => {
      client.get(CATEGORIES).subscribe();

      const req = http.expectOne(`/api/method/${CATEGORIES}`);
      // Same-origin relative URL: the HttpOnly sid cookie rides along automatically.
      // Setting withCredentials would only matter cross-origin, which the host-scoped
      // cookie can never support.
      expect(req.request.withCredentials).toBeFalsy();
      expect(req.request.headers.has('Cookie')).toBe(false);
      req.flush({ message: { data: [] } });
    });

    it('uses a relative URL so requests stay same-origin', () => {
      client.get(CATEGORIES).subscribe();

      const req = http.expectOne(`/api/method/${CATEGORIES}`);
      expect(req.request.url.startsWith('/api/method/')).toBe(true);
      expect(req.request.url).not.toMatch(/^https?:/);
      req.flush({ message: { data: [] } });
    });
  });

  describe('success envelope unwrapping', () => {
    it('unwraps data, notice and meta', () => {
      const captured = collect<{ data: unknown; notice?: string; meta?: Record<string, unknown> }>(
        client.get(CATEGORIES),
      );

      http.expectOne(`/api/method/${CATEGORIES}`).flush({
        message: { data: [], notice: 'Categories loaded', meta: { count: 0 } },
      });

      expect(captured.value()).toEqual({
        data: [],
        notice: 'Categories loaded',
        meta: { count: 0 },
      });
      expect(captured.error()).toBeUndefined();
    });

    it('omits notice and meta when the backend omits them', () => {
      const captured = collect<{ notice?: string; meta?: unknown }>(
        client.get('yob_auth.api.auth.get_session_context'),
      );

      http
        .expectOne('/api/method/yob_auth.api.auth.get_session_context')
        .flush({ message: { data: { authenticated: true } } });

      expect(captured.value()).toEqual({ data: { authenticated: true } });
      expect(captured.value()?.notice).toBeUndefined();
      expect(captured.value()?.meta).toBeUndefined();
    });

    it('preserves a null data payload', () => {
      const captured = collect<{ data: unknown }>(client.get(CATEGORIES));

      http.expectOne(`/api/method/${CATEGORIES}`).flush({ message: { data: null } });

      expect(captured.value()?.data).toBeNull();
      expect(captured.error()).toBeUndefined();
    });

    it("ignores Frappe's own top-level keys beside message", () => {
      const captured = collect<{ data: unknown }>(
        client.post('yob_auth.api.auth.login_with_password'),
      );

      http.expectOne('/api/method/yob_auth.api.auth.login_with_password').flush({
        message: { data: { authenticated: true }, notice: 'Login successful.' },
        home_page: '/desk',
        full_name: 'Storefront',
      });

      expect(captured.value()?.data).toEqual({ authenticated: true });
      expect(captured.error()).toBeUndefined();
    });

    it('never exposes the raw message wrapper to callers', () => {
      const captured = collect<Record<string, unknown>>(client.get(CATEGORIES));

      http.expectOne(`/api/method/${CATEGORIES}`).flush({ message: { data: [] } });

      expect(captured.value()).toBeDefined();
      expect(Object.keys(captured.value() ?? {})).not.toContain('message');
    });

    it('fails when the outer message wrapper is missing', () => {
      const captured = collect(client.get(CATEGORIES));

      http.expectOne(`/api/method/${CATEGORIES}`).flush({ data: [] });

      expect(captured.error()?.code).toBe(YOB_CLIENT_ERROR_CODES.unreadableResponse);
      expect(captured.error()?.kind).toBe('unexpected');
    });

    it('fails when message carries no data key', () => {
      const captured = collect(client.get(CATEGORIES));

      http.expectOne(`/api/method/${CATEGORIES}`).flush({ message: { notice: 'nothing' } });

      expect(captured.error()?.code).toBe(YOB_CLIENT_ERROR_CODES.unreadableResponse);
    });

    it('treats an error envelope under HTTP 200 as a failure', () => {
      // The OpenAPI get_item 200 example is exactly this shape.
      const captured = collect(client.get('yob_storefront.api.catalog.get_item'));

      http.expectOne('/api/method/yob_storefront.api.catalog.get_item').flush({
        message: {
          errors: [
            {
              code: 'internal_server_error',
              detail: 'Something went wrong. Please try again.',
              details: {
                correlation_id: '0246f04aea554d10',
                // Extras the backend might send. None may reach a component.
                provider_message: 'gateway said: card declined by issuer bank XYZ',
                exc: 'Traceback (most recent call last): ...',
              },
            },
          ],
        },
      });

      expect(captured.error()?.kind).toBe('yob');
      expect(captured.error()?.code).toBe('internal_server_error');
      expect(captured.error()?.context.correlationId).toBe('0246f04aea554d10');

      // The allow-list drops everything else. `details` is open-ended - payment errors
      // put provider state in it - and handing that object to components would put
      // arbitrary server-authored content one interpolation away from the page.
      const context = captured.error()?.context as Record<string, unknown>;
      expect(Object.keys(context).sort()).toEqual(['correlationId']);
      expect(context['provider_message']).toBeUndefined();
      expect(context['exc']).toBeUndefined();
    });
  });

  describe('YOB envelope error normalization', () => {
    it('normalizes a 422 validation error with its field', () => {
      const captured = collect(client.post('yob_auth.api.auth.login_with_password'));

      http.expectOne('/api/method/yob_auth.api.auth.login_with_password').flush(
        {
          message: {
            errors: [
              {
                code: 'validation_failed',
                detail: 'Application is required.',
                field: 'application',
              },
            ],
          },
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

      const error = captured.error();
      expect(error).toBeInstanceOf(YobApiError);
      expect(error?.kind).toBe('yob');
      expect(error?.httpStatus).toBe(422);
      expect(error?.code).toBe('validation_failed');
      expect(error?.detail).toBe('Application is required.');
      expect(error?.field).toBe('application');
      expect(error?.method).toBe('yob_auth.api.auth.login_with_password');
    });

    it('normalizes a 404 not-found and keeps the backend code', () => {
      const captured = collect(
        client.get('yob_storefront.api.catalog.get_category', { slug: 'x' }),
      );

      http
        .expectOne((r) => r.url === '/api/method/yob_storefront.api.catalog.get_category')
        .flush(
          {
            message: {
              errors: [
                { code: 'category_not_found', detail: 'Category not found.', field: 'slug' },
              ],
            },
          },
          { status: 404, statusText: 'Not Found' },
        );

      expect(captured.error()?.code).toBe('category_not_found');
      expect(captured.error()?.httpStatus).toBe(404);
    });

    it('keeps every error when the backend returns several', () => {
      const captured = collect(client.post('yob_storefront.api.address.add_address'));

      http.expectOne('/api/method/yob_storefront.api.address.add_address').flush(
        {
          message: {
            errors: [
              { code: 'validation_failed', detail: 'City is required.', field: 'city' },
              { code: 'validation_failed', detail: 'Pincode is required.', field: 'pincode' },
            ],
          },
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

      expect(captured.error()?.errors).toHaveLength(2);
      expect(captured.error()?.errors[1]?.field).toBe('pincode');
    });

    it('handles an error with no field, such as cart_empty', () => {
      const captured = collect(client.post('yob_storefront.api.checkout.proceed_to_payment'));

      http
        .expectOne('/api/method/yob_storefront.api.checkout.proceed_to_payment')
        .flush(
          { message: { errors: [{ code: 'cart_empty', detail: 'The cart is empty.' }] } },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      expect(captured.error()?.code).toBe('cart_empty');
      expect(captured.error()?.field).toBeUndefined();
    });

    it('leaves an explicit YOB application_access_denied untouched at 403', () => {
      const captured = collect(client.get(CATEGORIES));

      http.expectOne(`/api/method/${CATEGORIES}`).flush(
        {
          message: {
            errors: [
              {
                code: 'application_access_denied',
                detail: 'This application is not allowed from the current domain',
              },
            ],
          },
        },
        { status: 403, statusText: 'Forbidden' },
      );

      // An explicit YOB envelope code must survive untouched, even at HTTP 403.
      // Collapsing it into the generic permission code would lose the backend's own
      // semantic - this one means "wrong/untrusted domain", not "not permitted".
      expect(captured.error()?.code).toBe('application_access_denied');
      expect(captured.error()?.kind).toBe('yob');
      expect(captured.error()?.code).not.toBe(YOB_CLIENT_ERROR_CODES.permissionDenied);
    });
  });

  describe('raw Frappe error normalization', () => {
    const TRACEBACK =
      '["Traceback (most recent call last):\\n  File \\"apps/frappe/frappe/app.py\\"..."]';

    it('normalizes a 403 PermissionError into a permission denial, not a session verdict', () => {
      const captured = collect(client.get(CATEGORIES));

      http.expectOne(`/api/method/${CATEGORIES}`).flush(
        {
          exception:
            'frappe.exceptions.PermissionError: <details><summary>You are not permitted to access this resource. Login to access</summary>Function <strong>get_categories</strong> is not whitelisted.</details>',
          exc_type: 'PermissionError',
          exc: TRACEBACK,
          _server_messages: '[{"message":"..."}]',
        },
        { status: 403, statusText: 'Forbidden' },
      );

      const error = captured.error();
      expect(error?.kind).toBe('frappe');
      expect(error?.httpStatus).toBe(403);
      expect(error?.code).toBe(YOB_CLIENT_ERROR_CODES.permissionDenied);
      expect(error?.frappeExcType).toBe('PermissionError');
      // The transport layer cannot know whether the session is gone or the user was
      // simply refused: an authenticated user denied a doctype looks identical.
      expect(error?.detail).not.toMatch(/sign in/i);
      expect(error?.detail).not.toMatch(/session/i);
    });

    it('never retains the Frappe traceback or its HTML exception text', () => {
      const captured = collect(client.get(CATEGORIES));

      http.expectOne(`/api/method/${CATEGORIES}`).flush(
        {
          exception:
            'frappe.exceptions.PermissionError: <details><summary>secret</summary></details>',
          exc_type: 'PermissionError',
          exc: TRACEBACK,
          _server_messages: '[{"message":"..."}]',
        },
        { status: 403, statusText: 'Forbidden' },
      );

      const serialised = JSON.stringify({
        ...captured.error(),
        message: captured.error()?.message,
        detail: captured.error()?.detail,
      });
      expect(serialised).not.toContain('Traceback');
      expect(serialised).not.toContain('<details>');
      expect(serialised).not.toContain('_server_messages');
      expect(captured.error()?.detail).toBe('You do not have permission to view this.');
    });

    it('normalizes a 400 CSRFTokenError distinctly from a session failure', () => {
      const captured = collect(client.post('yob_storefront.api.cart.clear_cart'));

      http.expectOne('/api/method/yob_storefront.api.cart.clear_cart').flush(
        {
          exception: 'frappe.exceptions.CSRFTokenError: Invalid Request',
          exc_type: 'CSRFTokenError',
          exc: TRACEBACK,
        },
        { status: 400, statusText: 'Bad Request' },
      );

      const error = captured.error();
      expect(error?.kind).toBe('frappe');
      expect(error?.httpStatus).toBe(400);
      expect(error?.code).toBe(YOB_CLIENT_ERROR_CODES.csrfTokenInvalid);
      expect(error?.frappeExcType).toBe('CSRFTokenError');
      expect(error?.code).not.toBe(YOB_CLIENT_ERROR_CODES.permissionDenied);
    });

    it('falls back to a generic failure for an unrecognised Frappe exception', () => {
      const captured = collect(client.get(CATEGORIES));

      http
        .expectOne(`/api/method/${CATEGORIES}`)
        .flush(
          {
            exception: 'frappe.exceptions.DuplicateEntryError: ...',
            exc_type: 'DuplicateEntryError',
          },
          { status: 409, statusText: 'Conflict' },
        );

      expect(captured.error()?.kind).toBe('frappe');
      expect(captured.error()?.code).toBe(YOB_CLIENT_ERROR_CODES.unexpectedFailure);
      expect(captured.error()?.frappeExcType).toBe('DuplicateEntryError');
    });
  });

  describe('non-JSON and transport failures', () => {
    it('normalizes the edge 421 HTML response', () => {
      const captured = collect(client.get(CATEGORIES));

      http
        .expectOne(`/api/method/${CATEGORIES}`)
        .flush('<html>\n<head><title>421 Misdirected Request</title></head>\n</html>', {
          status: 421,
          statusText: 'Misdirected Request',
        });

      const error = captured.error();
      expect(error?.kind).toBe('unexpected');
      expect(error?.httpStatus).toBe(421);
      expect(error?.code).toBe(YOB_CLIENT_ERROR_CODES.unreadableResponse);
      expect(error?.detail).not.toContain('<html>');
    });

    it('normalizes a status-0 network failure', () => {
      const captured = collect(client.get(CATEGORIES));

      http.expectOne(`/api/method/${CATEGORIES}`).error(new ProgressEvent('error'));

      const error = captured.error();
      expect(error?.kind).toBe('transport');
      expect(error?.httpStatus).toBe(0);
      expect(error?.code).toBe(YOB_CLIENT_ERROR_CODES.networkUnavailable);
    });

    it('normalizes a 500 while keeping the correlation id', () => {
      const captured = collect(client.get(CATEGORIES));

      http.expectOne(`/api/method/${CATEGORIES}`).flush(
        {
          message: {
            errors: [
              {
                code: 'internal_server_error',
                detail: 'Something went wrong. Please try again.',
                details: { correlation_id: '0246f04aea554d10' },
              },
            ],
          },
        },
        { status: 500, statusText: 'Internal Server Error' },
      );

      expect(captured.error()?.code).toBe('internal_server_error');
      expect(captured.error()?.context.correlationId).toBe('0246f04aea554d10');
    });
  });
});
