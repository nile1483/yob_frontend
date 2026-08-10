import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CsrfTokenStore } from './csrf-token.store';
import { yobCsrfInterceptor } from './csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from './yob-api.config';
import { YobApiClient } from './yob-api-client';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'STOREFRONT' };
const CSRF_HEADER = 'X-Frappe-CSRF-Token';
const TOKEN = 'test-csrf-token';

const CLEAR_CART = 'yob_storefront.api.cart.clear_cart';
const GET_CART = 'yob_storefront.api.cart.get_cart';

describe('yobCsrfInterceptor', () => {
  let client: YobApiClient;
  let http: HttpTestingController;
  let csrf: CsrfTokenStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([yobCsrfInterceptor])),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    client = TestBed.inject(YobApiClient);
    http = TestBed.inject(HttpTestingController);
    csrf = TestBed.inject(CsrfTokenStore);
  });

  afterEach(() => http.verify());

  it('adds the CSRF header to a mutating request once a token exists', () => {
    csrf.set(TOKEN);

    client.post(CLEAR_CART).subscribe();

    const req = http.expectOne(`/api/method/${CLEAR_CART}`);
    expect(req.request.headers.get(CSRF_HEADER)).toBe(TOKEN);
    req.flush({ message: { data: {} } });
  });

  it('omits the header entirely when no token has been established', () => {
    client.post(CLEAR_CART).subscribe();

    const req = http.expectOne(`/api/method/${CLEAR_CART}`);
    // An empty or invented value would turn "not signed in yet" into a CSRFTokenError.
    expect(req.request.headers.has(CSRF_HEADER)).toBe(false);
    req.flush({ message: { data: {} } });
  });

  it('never adds the header to a GET, even with a token', () => {
    csrf.set(TOKEN);

    client.get(GET_CART).subscribe();

    const req = http.expectOne(`/api/method/${GET_CART}`);
    expect(req.request.headers.has(CSRF_HEADER)).toBe(false);
    req.flush({ message: { data: {} } });
  });

  it('stops adding the header after the token is cleared', () => {
    csrf.set(TOKEN);
    csrf.clear();

    client.post(CLEAR_CART).subscribe();

    const req = http.expectOne(`/api/method/${CLEAR_CART}`);
    expect(req.request.headers.has(CSRF_HEADER)).toBe(false);
    req.flush({ message: { data: {} } });
  });

  it('leaves non-YOB requests untouched so the token cannot leak off-origin', () => {
    csrf.set(TOKEN);

    TestBed.inject(HttpClient).post('https://analytics.example/collect', { hit: 1 }).subscribe();

    const req = http.expectOne('https://analytics.example/collect');
    expect(req.request.headers.has(CSRF_HEADER)).toBe(false);
    req.flush({});
  });

  it('leaves same-origin requests outside the RPC base path untouched', () => {
    csrf.set(TOKEN);

    TestBed.inject(HttpClient).post('/files/upload', { hit: 1 }).subscribe();

    const req = http.expectOne('/files/upload');
    expect(req.request.headers.has(CSRF_HEADER)).toBe(false);
    req.flush({});
  });
});

describe('CsrfTokenStore', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('starts empty, reports possession without exposing the value, and clears', () => {
    const store = TestBed.inject(CsrfTokenStore);

    expect(store.hasToken()).toBe(false);
    expect(store.current()).toBeNull();

    store.set(TOKEN);
    expect(store.hasToken()).toBe(true);
    expect(store.current()).toBe(TOKEN);

    store.clear();
    expect(store.hasToken()).toBe(false);
    expect(store.current()).toBeNull();
  });
});
