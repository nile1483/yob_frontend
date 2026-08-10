import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CsrfTokenStore } from '../app/foundation/network/csrf-token.store';
import { yobCsrfInterceptor } from '../app/foundation/network/csrf.interceptor';
import { YobApiError } from '../app/foundation/network/yob-api-error';
import { YOB_API_CONFIG, type YobApiConfig } from '../app/foundation/network/yob-api.config';
import { SessionStore } from '../app/foundation/session/session.store';
import { MockServerSession } from './core/mock-server-session';
import { MOCK_CREDENTIALS, MOCK_CSRF_TOKEN } from './fixtures/session.fixture';
import { mockApiInterceptor } from './mock-api.interceptor';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

/**
 * The whole Phase 3 session lifecycle, driven end to end with no backend of any kind.
 *
 * `SessionStore` -> `AuthApi` -> `YobApiClient` -> `yobCsrfInterceptor` ->
 * `mockApiInterceptor`. Every layer is the production one; only the far end is
 * replaced. `http.verify()` after each test proves nothing escaped to the network.
 */
describe('mock API session lifecycle', () => {
  let session: SessionStore;
  let csrf: CsrfTokenStore;
  let mockServer: MockServerSession;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([yobCsrfInterceptor, mockApiInterceptor])),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    session = TestBed.inject(SessionStore);
    csrf = TestBed.inject(CsrfTokenStore);
    mockServer = TestBed.inject(MockServerSession);
    http = TestBed.inject(HttpTestingController);

    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    // No request may ever have reached the real backend.
    http.verify();
  });

  function signIn(): void {
    session
      .signInWithPassword({
        username: MOCK_CREDENTIALS.username,
        password: MOCK_CREDENTIALS.password,
      })
      .subscribe({ error: () => undefined });
  }

  it('restores as guest when the mock server has no session', () => {
    let resolved: string | undefined;
    session.restore().subscribe((status) => (resolved = status));

    expect(resolved).toBe('guest');
    expect(session.isGuest()).toBe(true);
    expect(session.restoreError()).toBeNull();
    expect(csrf.hasToken()).toBe(false);
  });

  it('establishes mock server-side state on login and captures the CSRF token', () => {
    expect(mockServer.isAuthenticated()).toBe(false);

    signIn();

    // Server side.
    expect(mockServer.isAuthenticated()).toBe(true);
    // Client side, through the real store.
    expect(session.status()).toBe('authenticated');
    expect(session.user()?.email).toBe(MOCK_CREDENTIALS.username);
    expect(session.profileName()).toBe('Mock Trading Co');
    expect(csrf.current()).toBe(MOCK_CSRF_TOKEN);
    // The application code came from configuration, not from the mock.
    expect(session.context()?.context.application).toBe('TEST_APP');
  });

  it('rejects the wrong password with the backend code and status', () => {
    let error: YobApiError | undefined;
    session
      .signInWithPassword({ username: MOCK_CREDENTIALS.username, password: 'nope' })
      .subscribe({ error: (e: YobApiError) => (error = e) });

    expect(error?.code).toBe('invalid_credentials');
    expect(error?.httpStatus).toBe(401);
    expect(session.isAuthenticated()).toBe(false);
    expect(mockServer.isAuthenticated()).toBe(false);
    expect(csrf.hasToken()).toBe(false);
  });

  it('returns authenticated context on a restore after login', () => {
    signIn();

    let resolved: string | undefined;
    session.restore().subscribe((status) => (resolved = status));

    expect(resolved).toBe('authenticated');
    expect(session.status()).toBe('authenticated');
    // get_session_context reports `session`, not the original `password`.
    expect(session.context()?.authentication_method).toBe('session');
  });

  it('survives a simulated page refresh using only the mock server session', () => {
    signIn();

    // A refresh throws away all client state while the server keeps its session. A
    // child injector gives a genuinely fresh SessionStore over the same mock server.
    const reloadedClient = Injector.create({
      providers: [{ provide: SessionStore, useClass: SessionStore }],
      parent: TestBed.inject(Injector),
    });
    const reloaded = reloadedClient.get(SessionStore);
    csrf.clear();

    expect(reloaded.status()).toBe('unknown');
    expect(reloaded.context()).toBeNull();

    let resolved: string | undefined;
    reloaded.restore().subscribe((status) => (resolved = status));

    // Everything came back from the server, nothing from the browser.
    expect(resolved).toBe('authenticated');
    expect(reloaded.user()?.email).toBe(MOCK_CREDENTIALS.username);
    expect(csrf.current()).toBe(MOCK_CSRF_TOKEN);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('requires a real CSRF token to log out', () => {
    signIn();

    // Simulate a client that lost the token: the interceptor now sends no header, and
    // the mock must refuse exactly as Frappe does.
    csrf.clear();

    let error: YobApiError | undefined;
    session.signOut().subscribe({ error: (e: YobApiError) => (error = e) });

    expect(error?.kind).toBe('frappe');
    expect(error?.httpStatus).toBe(400);
    expect(error?.code).toBe('client_csrf_token_invalid');
    expect(error?.frappeExcType).toBe('CSRFTokenError');
    // The server session is still alive, so local state must stay authenticated.
    expect(mockServer.isAuthenticated()).toBe(true);
    expect(session.status()).toBe('authenticated');
  });

  it('logs out and clears the mock server session when the token is present', () => {
    signIn();
    expect(csrf.current()).toBe(MOCK_CSRF_TOKEN);

    let completed = false;
    session.signOut().subscribe(() => (completed = true));

    expect(completed).toBe(true);
    expect(mockServer.isAuthenticated()).toBe(false);
    expect(session.status()).toBe('guest');
    expect(csrf.hasToken()).toBe(false);
  });

  it('restores as guest again after logout', () => {
    signIn();
    session.signOut().subscribe();

    let resolved: string | undefined;
    session.restore().subscribe((status) => (resolved = status));

    expect(resolved).toBe('guest');
    expect(session.isGuest()).toBe(true);
    expect(session.context()).toBeNull();
  });

  it('never touches browser storage across the whole lifecycle', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    session.restore().subscribe();
    signIn();
    session.restore().subscribe();
    session.signOut().subscribe();

    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    setItem.mockRestore();
  });
});
