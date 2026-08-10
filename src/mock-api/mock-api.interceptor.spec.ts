import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { yobCsrfInterceptor } from '../app/foundation/network/csrf.interceptor';
import { YobApiClient } from '../app/foundation/network/yob-api-client';
import { YobApiError } from '../app/foundation/network/yob-api-error';
import { YOB_API_CONFIG, type YobApiConfig } from '../app/foundation/network/yob-api.config';
import { isRecord } from '../app/foundation/network/yob-api.types';
import { environment } from '../environments/environment';
import { MockServerSession } from './core/mock-server-session';
import { MOCK_CREDENTIALS } from './fixtures/session.fixture';
import { mockApiInterceptor } from './mock-api.interceptor';
import { MockApiScenario } from './scenarios/mock-scenario';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

const SESSION_CONTEXT = 'yob_auth.api.auth.get_session_context';
const LOGIN = 'yob_auth.api.auth.login_with_password';

/** `application` is required by the real endpoint, so the mock requires it too. */
const APP_PARAM = { application: 'TEST_APP' };

/**
 * `provideHttpClientTesting()` stands in for the network. Because the mock
 * interceptor never calls `next()` for RPC calls, `expectNone` is a direct proof that
 * a request was served in memory and never reached the backend.
 */
function configure(options: { mock: boolean }) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(
        withInterceptors(options.mock ? [yobCsrfInterceptor, mockApiInterceptor] : [yobCsrfInterceptor]),
      ),
      provideHttpClientTesting(),
      { provide: YOB_API_CONFIG, useValue: CONFIG },
    ],
  });
}

describe('mockApiInterceptor', () => {
  describe('when mock mode is off', () => {
    beforeEach(() => configure({ mock: false }));
    afterEach(() => TestBed.inject(HttpTestingController).verify());

    it('lets the request travel to the backend untouched', () => {
      const api = TestBed.inject(YobApiClient);
      const http = TestBed.inject(HttpTestingController);

      let data: unknown;
      api.get(SESSION_CONTEXT, APP_PARAM).subscribe((r) => (data = r.data));

      // The real backend sees it, and answers it.
      const req = http.expectOne((r) => r.url === `/api/method/${SESSION_CONTEXT}`);
      req.flush({ message: { data: { from: 'real backend' } } });

      expect(data).toEqual({ from: 'real backend' });
    });
  });

  describe('when mock mode is on', () => {
    let api: YobApiClient;
    let http: HttpTestingController;
    let session: MockServerSession;
    let scenario: MockApiScenario;

    beforeEach(() => {
      configure({ mock: true });
      api = TestBed.inject(YobApiClient);
      http = TestBed.inject(HttpTestingController);
      session = TestBed.inject(MockServerSession);
      scenario = TestBed.inject(MockApiScenario);
    });

    afterEach(() => http.verify());

    it('intercepts the RPC call so nothing reaches the backend', () => {
      let error: YobApiError | undefined;
      api.get(SESSION_CONTEXT, APP_PARAM).subscribe({ error: (e: YobApiError) => (error = e) });

      http.expectNone((r) => r.url === `/api/method/${SESSION_CONTEXT}`);
      // Served in memory: guest, so the raw Frappe 403.
      expect(error?.code).toBe('client_session_required');
    });

    it('leaves non-RPC requests to the backend', () => {
      // A file request is not a Frappe RPC call and must pass straight through.
      TestBed.inject(HttpClient).get('/files/product.png').subscribe();

      http.expectOne('/files/product.png').flush({});
    });

    it('returns the outer Frappe message wrapper, not an unwrapped envelope', () => {
      session.signIn('TEST_APP', 'password');

      // Bypass YobApiClient and read the body the mock actually put on the wire.
      let raw: unknown;
      TestBed.inject(HttpClient)
        .get(`/api/method/${SESSION_CONTEXT}?application=TEST_APP`)
        .subscribe((body) => (raw = body));

      expect(isRecord(raw)).toBe(true);
      const wrapper = raw as Record<string, unknown>;
      expect(Object.keys(wrapper)).toEqual(['message']);

      const message = wrapper['message'] as Record<string, unknown>;
      expect(message['data']).toMatchObject({ authenticated: true });
      // A pre-unwrapped `{data, notice}` at the top level would skip the very
      // normalization this layer exists to exercise.
      expect(wrapper['data']).toBeUndefined();
    });

    it('is unwrapped by YobApiClient exactly like a real response', () => {
      session.signIn('TEST_APP', 'password');

      let notice: string | undefined;
      let data: unknown;
      api.get(SESSION_CONTEXT, APP_PARAM).subscribe((r) => {
        data = r.data;
        notice = r.notice;
      });

      expect(data).toMatchObject({
        authenticated: true,
        authentication_method: 'session',
        context: { application: 'TEST_APP', profile_doctype: 'Customer' },
      });
      // get_session_context sends no notice, matching the verified backend response.
      expect(notice).toBeUndefined();
    });

    it('preserves backend-style codes and statuses on a login failure', () => {
      let error: YobApiError | undefined;
      api
        .post(LOGIN, {
          application: 'TEST_APP',
          username: MOCK_CREDENTIALS.username,
          password: 'wrong',
        })
        .subscribe({ error: (e: YobApiError) => (error = e) });

      expect(error?.kind).toBe('yob');
      expect(error?.code).toBe('invalid_credentials');
      expect(error?.httpStatus).toBe(401);
    });

    it('reproduces the backend validation error, field and all', () => {
      let error: YobApiError | undefined;
      api.post(LOGIN, {}).subscribe({ error: (e: YobApiError) => (error = e) });

      expect(error?.code).toBe('validation_failed');
      expect(error?.httpStatus).toBe(422);
      expect(error?.field).toBe('application');
      expect(error?.detail).toBe('Application is required.');
    });

    it('serves a server-error scenario as a real 500 envelope', () => {
      scenario.scenario.set('server-error');

      let error: YobApiError | undefined;
      api.get(SESSION_CONTEXT, APP_PARAM).subscribe({ error: (e: YobApiError) => (error = e) });

      expect(error?.kind).toBe('yob');
      expect(error?.httpStatus).toBe(500);
      expect(error?.code).toBe('internal_server_error');
      expect(error?.details).toEqual({ correlation_id: 'mock000000000000' });
    });

    it('fails loudly for an RPC method with no handler', () => {
      let error: YobApiError | undefined;
      // Deliberately an endpoint no phase has mocked yet.
      api
        .get('yob_storefront.api.cart.get_cart')
        .subscribe({ error: (e: YobApiError) => (error = e) });

      expect(error?.httpStatus).toBe(501);
      expect(error?.code).toBe('mock_handler_not_implemented');
      // Nothing leaked to the real backend behind the developer's back.
      http.expectNone(() => true);
    });

    describe('latency', () => {
      beforeEach(() => vi.useFakeTimers());
      afterEach(() => vi.useRealTimers());

      it('delays a successful response deterministically', () => {
        session.signIn('TEST_APP', 'password');
        scenario.latencyMs.set(750);

        let data: unknown;
        api.get(SESSION_CONTEXT, APP_PARAM).subscribe((r) => (data = r.data));

        vi.advanceTimersByTime(749);
        expect(data).toBeUndefined();

        vi.advanceTimersByTime(1);
        expect(data).toBeDefined();
      });

      it('delays a failure too, not just a success', () => {
        scenario.latencyMs.set(500);

        let error: YobApiError | undefined;
        api.get(SESSION_CONTEXT, APP_PARAM).subscribe({ error: (e: YobApiError) => (error = e) });

        vi.advanceTimersByTime(499);
        expect(error).toBeUndefined();

        vi.advanceTimersByTime(1);
        expect(error?.code).toBe('client_session_required');
      });
    });
  });
});

describe('mock mode configuration', () => {
  // `ng test` builds with the development configuration, so `fileReplacements` means
  // this import resolves to environment.development.ts - the production object is not
  // reachable from a spec at all. Production is proven at build time instead, by
  // asserting the mock fixtures are absent from the production bundle; see
  // docs/ARCHITECTURE.md section 21.
  it('defaults development to the real backend, not the mock', () => {
    expect(environment.production).toBe(false);
    expect(environment.mockApi).toBe(false);
  });

  it('registers no interceptor whenever mock mode is off', () => {
    // The invariant that makes the flag trustworthy: mock off means nothing is wired,
    // rather than something wired that decides to behave.
    if (!environment.mockApi) {
      expect(environment.httpInterceptors).toEqual([]);
    } else {
      expect(environment.httpInterceptors).toContain(mockApiInterceptor);
    }
  });
});
