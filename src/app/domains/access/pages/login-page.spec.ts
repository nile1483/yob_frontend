import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { yobCsrfInterceptor } from '../../../foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from '../../../foundation/network/yob-api.config';
import { SessionStore } from '../../../foundation/session/session.store';
import { MockServerSession } from '../../../../mock-api/core/mock-server-session';
import { MOCK_CREDENTIALS } from '../../../../mock-api/fixtures/session.fixture';
import { mockApiInterceptor } from '../../../../mock-api/mock-api.interceptor';
import { MockApiScenario } from '../../../../mock-api/scenarios/mock-scenario';
import { routes } from '../../../app.routes';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

/**
 * Driven through the real route tree against the mock API, so these exercise the
 * production chain: page -> SessionStore -> AuthApi -> YobApiClient -> mock handler.
 * `http.verify()` proves nothing escaped to the network.
 */
describe('LoginPage', () => {
  let router: Router;
  let session: SessionStore;
  let http: HttpTestingController;
  let mockServer: MockServerSession;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([yobCsrfInterceptor, mockApiInterceptor])),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    router = TestBed.inject(Router);
    session = TestBed.inject(SessionStore);
    http = TestBed.inject(HttpTestingController);
    mockServer = TestBed.inject(MockServerSession);

    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => http.verify());

  /** Resolve the session as the app initializer does, then open the sign-in page. */
  async function openLogin(url = '/login'): Promise<RouterTestingHarness> {
    session.restore().subscribe();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness;
  }

  function inputs(harness: RouterTestingHarness) {
    const root = harness.fixture.nativeElement as HTMLElement;
    return {
      username: root.querySelector('[data-testid="login-username"]') as HTMLInputElement,
      password: root.querySelector('[data-testid="login-password"]') as HTMLInputElement,
      submit: root.querySelector('[data-testid="login-submit"]') as HTMLButtonElement,
      form: root.querySelector('form') as HTMLFormElement,
      text: () => root.textContent ?? '',
    };
  }

  async function type(
    harness: RouterTestingHarness,
    element: HTMLInputElement,
    value: string,
  ): Promise<void> {
    element.value = value;
    element.dispatchEvent(new Event('input'));
    element.dispatchEvent(new Event('blur'));
    await harness.fixture.whenStable();
  }

  async function signIn(
    harness: RouterTestingHarness,
    username: string = MOCK_CREDENTIALS.username,
    password: string = MOCK_CREDENTIALS.password,
  ) {
    const el = inputs(harness);
    await type(harness, el.username, username);
    await type(harness, el.password, password);
    el.form.dispatchEvent(new Event('submit', { cancelable: true }));
    await harness.fixture.whenStable();
    return el;
  }

  describe('native form semantics', () => {
    it('uses native inputs with the right autocomplete hints', async () => {
      const el = inputs(await openLogin());

      expect(el.username.tagName).toBe('INPUT');
      expect(el.username.getAttribute('autocomplete')).toBe('username');
      expect(el.password.type).toBe('password');
      expect(el.password.getAttribute('autocomplete')).toBe('current-password');
    });

    it('associates each label with its control', async () => {
      const harness = await openLogin();
      const el = inputs(harness);

      expect(el.username.labels?.[0]?.textContent).toContain('Username');
      expect(el.password.labels?.[0]?.textContent).toContain('Password');
    });

    it('submits with a real submit button', async () => {
      const el = inputs(await openLogin());
      expect(el.submit.type).toBe('submit');
    });
  });

  describe('validation', () => {
    it('shows no errors before the user touches anything', async () => {
      const el = inputs(await openLogin());
      expect(el.text()).not.toContain('Enter your username.');
      expect(el.text()).not.toContain('Enter your password.');
    });

    it('reports both fields as required on an empty submit', async () => {
      const harness = await openLogin();
      const el = inputs(harness);

      el.form.dispatchEvent(new Event('submit', { cancelable: true }));
      await harness.fixture.whenStable();

      expect(el.text()).toContain('Enter your username.');
      expect(el.text()).toContain('Enter your password.');
    });

    it('does not call the API when the form is invalid', async () => {
      const harness = await openLogin();
      const el = inputs(harness);

      el.form.dispatchEvent(new Event('submit', { cancelable: true }));
      await harness.fixture.whenStable();

      expect(session.isAuthenticated()).toBe(false);
      expect(mockServer.isAuthenticated()).toBe(false);
    });

    it('clears a field error once it is filled in', async () => {
      const harness = await openLogin();
      const el = inputs(harness);

      el.form.dispatchEvent(new Event('submit', { cancelable: true }));
      await harness.fixture.whenStable();
      expect(el.text()).toContain('Enter your username.');

      await type(harness, el.username, 'someone');

      expect(el.text()).not.toContain('Enter your username.');
    });
  });

  describe('successful sign-in', () => {
    it('establishes the session and lands on the catalog', async () => {
      const harness = await openLogin();
      await signIn(harness);

      expect(session.isAuthenticated()).toBe(true);
      expect(session.user()?.email).toBe(MOCK_CREDENTIALS.username);
      expect(router.url).toBe('/catalog');
    });

    it('goes to a valid return URL instead of the default', async () => {
      const harness = await openLogin('/login?returnUrl=%2Faccount');
      await signIn(harness);

      expect(router.url).toBe('/account');
    });

    it('ignores an external return URL and uses the safe default', async () => {
      const harness = await openLogin('/login?returnUrl=https://phish.example/steal');
      await signIn(harness);

      expect(router.url).toBe('/catalog');
      expect(router.url).not.toContain('phish.example');
    });

    it('ignores a protocol-relative return URL', async () => {
      const harness = await openLogin('/login?returnUrl=%2F%2Fphish.example');
      await signIn(harness);

      expect(router.url).toBe('/catalog');
    });

    it('does not retain the password anywhere afterwards', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const harness = await openLogin();
      await signIn(harness);

      expect(session.isAuthenticated()).toBe(true);

      // Navigation destroyed the sign-in page, so the observable facts are that the
      // password is nowhere in the document and was never written to storage.
      // (Reading the old input element would prove nothing - it is detached and
      // keeps whatever it last held.)
      const root = harness.fixture.nativeElement as HTMLElement;
      expect(root.querySelector('[data-testid="login-password"]')).toBeNull();
      expect(root.innerHTML).not.toContain(MOCK_CREDENTIALS.password);

      expect(setItem).not.toHaveBeenCalled();
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
      expect(document.cookie).not.toContain(MOCK_CREDENTIALS.password);
      setItem.mockRestore();
    });

    it('clears the form model, so a re-entered page starts empty', async () => {
      const harness = await openLogin();
      await signIn(harness);
      expect(router.url).toBe('/catalog');

      // Returning to sign-in must not resurrect the previous credentials.
      await harness.navigateByUrl('/login?returnUrl=%2Faccount');
      await harness.fixture.whenStable();

      // Already authenticated, so it redirects rather than showing a filled form.
      expect(router.url).toBe('/account');
    });
  });

  describe('failed sign-in', () => {
    it('shows the safe credential message and stays put', async () => {
      const harness = await openLogin();
      const el = await signIn(harness, MOCK_CREDENTIALS.username, 'wrong-password');

      expect(el.text()).toContain('The username or password is incorrect.');
      expect(session.isAuthenticated()).toBe(false);
      expect(router.url).toContain('/login');
    });

    it('announces the failure assertively', async () => {
      const harness = await openLogin();
      await signIn(harness, MOCK_CREDENTIALS.username, 'wrong-password');

      const alert = (harness.fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
      expect(alert?.textContent).toContain('incorrect');
    });

    it('never renders backend wording or exception details', async () => {
      const harness = await openLogin();
      const el = await signIn(harness, MOCK_CREDENTIALS.username, 'wrong-password');

      expect(el.text()).not.toContain('frappe');
      expect(el.text()).not.toContain('Traceback');
      expect(el.text()).not.toContain('Invalid login credentials.');
    });

    it('maps a server fault to a generic message', async () => {
      const scenario = TestBed.inject(MockApiScenario);
      const harness = await openLogin();
      scenario.scenario.set('server-error');

      const el = await signIn(harness);
      scenario.reset();

      expect(el.text()).toContain('Something went wrong.');
      expect(session.isAuthenticated()).toBe(false);
    });

    it('lets the user retry after a failure', async () => {
      const harness = await openLogin();
      await signIn(harness, MOCK_CREDENTIALS.username, 'wrong-password');
      expect(session.isAuthenticated()).toBe(false);

      const el = inputs(harness);
      await type(harness, el.password, MOCK_CREDENTIALS.password);
      el.form.dispatchEvent(new Event('submit', { cancelable: true }));
      await harness.fixture.whenStable();

      expect(session.isAuthenticated()).toBe(true);
      expect(router.url).toBe('/catalog');
    });

    it('clears the previous error when a retry succeeds', async () => {
      const harness = await openLogin();
      await signIn(harness, MOCK_CREDENTIALS.username, 'wrong-password');

      const el = inputs(harness);
      await type(harness, el.password, MOCK_CREDENTIALS.password);
      el.form.dispatchEvent(new Event('submit', { cancelable: true }));
      await harness.fixture.whenStable();

      expect(router.url).toBe('/catalog');
    });
  });

  describe('already authenticated', () => {
    it('leaves the sign-in page for the catalog', async () => {
      session.restore().subscribe();
      mockServer.signIn('TEST_APP', 'password');
      session.restore().subscribe();
      expect(session.isAuthenticated()).toBe(true);

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/login');
      await harness.fixture.whenStable();

      expect(router.url).toBe('/catalog');
    });

    it('honours a valid return URL instead of the default', async () => {
      session.restore().subscribe();
      mockServer.signIn('TEST_APP', 'password');
      session.restore().subscribe();

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/login?returnUrl=%2Faccount');
      await harness.fixture.whenStable();

      expect(router.url).toBe('/account');
    });

    it('ignores a hostile return URL when redirecting away', async () => {
      session.restore().subscribe();
      mockServer.signIn('TEST_APP', 'password');
      session.restore().subscribe();

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/login?returnUrl=https://phish.example');
      await harness.fixture.whenStable();

      expect(router.url).toBe('/catalog');
    });
  });

  describe('session integration', () => {
    it('drives sign-in through SessionStore, not its own HTTP call', async () => {
      const harness = await openLogin();
      const spy = vi.spyOn(session, 'signInWithPassword');

      await signIn(harness);

      expect(spy).toHaveBeenCalledWith({
        username: MOCK_CREDENTIALS.username,
        password: MOCK_CREDENTIALS.password,
      });
      spy.mockRestore();
    });

    it('captures the CSRF token through the session, ready for mutations', async () => {
      const harness = await openLogin();
      await signIn(harness);

      expect(session.isAuthenticated()).toBe(true);
      expect(session.context()?.context.application).toBe('TEST_APP');
    });
  });
});
