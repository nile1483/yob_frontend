import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AuthApi } from './foundation/auth/auth.api';
import { yobCsrfInterceptor } from './foundation/network/csrf.interceptor';
import { YOB_API_CONFIG, type YobApiConfig } from './foundation/network/yob-api.config';
import { SessionStore } from './foundation/session/session.store';
import { MockServerSession } from '../mock-api/core/mock-server-session';
import { MOCK_CREDENTIALS } from '../mock-api/fixtures/session.fixture';
import { mockApiInterceptor } from '../mock-api/mock-api.interceptor';
import { MockApiScenario } from '../mock-api/scenarios/mock-scenario';
import { routes } from './app.routes';

const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

/**
 * Routing is exercised against the mock API rather than a stubbed session, so these
 * tests prove the real chain: guard -> SessionStore -> AuthApi -> YobApiClient ->
 * mock handler. `http.verify()` confirms nothing escaped to the network.
 */
describe('application routes', () => {
  let router: Router;
  let session: SessionStore;
  let http: HttpTestingController;

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
  });

  afterEach(() => http.verify());

  /** Resolve the session the way the app initializer does, before any navigation. */
  function restore(): void {
    session.restore().subscribe();
  }

  function signIn(): void {
    session
      .signInWithPassword({
        username: MOCK_CREDENTIALS.username,
        password: MOCK_CREDENTIALS.password,
      })
      .subscribe({ error: () => undefined });
  }

  describe('public branch', () => {
    it('serves /login to a guest', async () => {
      restore();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/login');

      expect(router.url).toBe('/login');
      expect(harness.routeNativeElement?.textContent).toContain('Sign in');
    });

    it('serves /terms to a guest', async () => {
      restore();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/terms');

      expect(router.url).toBe('/terms');
      expect(harness.routeNativeElement?.textContent).toContain('Terms');
    });

    it('renders public content inside the public shell', async () => {
      restore();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/terms');

      const root = harness.fixture.nativeElement as HTMLElement;
      expect(root.querySelector('app-public-shell')).not.toBeNull();
      expect(root.querySelector('app-secure-shell')).toBeNull();
      // Shell structure wraps the routed content.
      expect(root.querySelector('header')).not.toBeNull();
      expect(root.querySelector('main')?.textContent).toContain('Terms');
    });
  });

  describe('secure branch', () => {
    it('lets an authenticated user through to /catalog', async () => {
      signIn();
      expect(session.isAuthenticated()).toBe(true);

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/catalog');

      expect(router.url).toBe('/catalog');
      expect(harness.routeNativeElement?.textContent).toContain('Catalog');
    });

    it('renders secure content inside the secure shell', async () => {
      signIn();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/catalog');

      const root = harness.fixture.nativeElement as HTMLElement;
      expect(root.querySelector('app-secure-shell')).not.toBeNull();
      expect(root.querySelector('app-public-shell')).toBeNull();
      expect(root.querySelector('app-secure-nav')).not.toBeNull();
      expect(root.querySelector('main')?.textContent).toContain('Catalog');
    });

    it('shows the signed-in user in the shell', async () => {
      signIn();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/catalog');

      const header = (harness.fixture.nativeElement as HTMLElement).querySelector('header');
      expect(header?.textContent).toContain('Mock Buyer');
    });

    it('does not redirect an authenticated user away', async () => {
      signIn();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/account');

      expect(router.url).toBe('/account');
      expect(router.url).not.toContain('login');
    });
  });

  describe('guard: guest', () => {
    it('redirects a guest to /login', async () => {
      restore();
      expect(session.isGuest()).toBe(true);

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/catalog');

      expect(router.url).toContain('/login');
    });

    it('preserves the originally requested URL', async () => {
      restore();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/catalog');

      expect(router.url).toBe('/login?returnUrl=%2Fcatalog');
    });

    it('preserves a deeper URL with its query string', async () => {
      restore();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/account?tab=addresses');

      const returned = router.parseUrl(router.url).queryParamMap.get('returnUrl');
      expect(returned).toBe('/account?tab=addresses');
    });

    it('lands on a working sign-in page with the destination intact', async () => {
      restore();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/catalog');

      // The real sign-in form renders (it does not display the raw path - what it
      // does with the parameter is covered in login-page.spec.ts).
      expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
      expect(router.parseUrl(router.url).queryParamMap.get('returnUrl')).toBe('/catalog');
    });

    it('discards an attacker-supplied external return URL on the sign-in page', async () => {
      restore();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/login?returnUrl=https://phish.example');

      // Reachable, but the hostile value is never shown or offered as a destination.
      expect(router.url).toContain('/login');
      expect(harness.routeNativeElement?.textContent).not.toContain('phish.example');
    });

    it('does not bounce the sign-in page back into the guard', async () => {
      restore();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/login');

      // /login is public: reaching it must not produce a second redirect.
      expect(router.url).toBe('/login');
    });
  });

  describe('guard: unresolved session', () => {
    beforeEach(() => {
      // A backend fault during restore leaves status `unknown` with restoreError set.
      TestBed.inject(MockApiScenario).scenario.set('server-error');
      restore();
      TestBed.inject(MockApiScenario).reset();
    });

    it('leaves the session unresolved rather than guest', () => {
      expect(session.status()).toBe('unknown');
      expect(session.isGuest()).toBe(false);
      expect(session.restoreError()).not.toBeNull();
    });

    it('does not send a backend failure to the sign-in page', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/catalog');

      expect(router.url).not.toContain('/login');
      expect(router.parseUrl(router.url).root.children['primary']?.segments[0]?.path).toBe(
        'session-unavailable',
      );
    });

    it('explains the failure instead of asking for credentials', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/catalog');

      expect(harness.routeNativeElement?.textContent).toContain('could not reach');
    });

    it('preserves where the user was going', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/catalog');

      const returned = router.parseUrl(router.url).queryParamMap.get('returnUrl');
      expect(returned).toBe('/catalog');
    });

    it('preserves a deep URL with its query string', async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/account?tab=addresses');

      expect(router.url.startsWith('/session-unavailable')).toBe(true);
      expect(router.parseUrl(router.url).queryParamMap.get('returnUrl')).toBe(
        '/account?tab=addresses',
      );
    });
  });

  describe('session-unavailable recovery', () => {
    let scenario: MockApiScenario;
    let mockServer: MockServerSession;

    /** Land on the error page the way the guard does, from `from`. */
    async function arriveFromFailedRestore(from: string): Promise<RouterTestingHarness> {
      scenario = TestBed.inject(MockApiScenario);
      mockServer = TestBed.inject(MockServerSession);

      scenario.scenario.set('server-error');
      restore();
      scenario.reset();

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(from);
      expect(router.url.startsWith('/session-unavailable')).toBe(true);
      return harness;
    }

    async function clickRetry(harness: RouterTestingHarness): Promise<void> {
      const button = harness.routeNativeElement?.querySelector('button');
      expect(button).not.toBeNull();
      button?.click();
      await harness.fixture.whenStable();
    }

    it('sends a recovered, authenticated user to the URL they originally wanted', async () => {
      const harness = await arriveFromFailedRestore('/account');

      // The backend comes back, and the server session is valid.
      mockServer.signIn('TEST_APP', 'password');
      await clickRetry(harness);

      expect(router.url).toBe('/account');
      expect(session.isAuthenticated()).toBe(true);
    });

    it('sends a recovered guest to sign in, still carrying the destination', async () => {
      const harness = await arriveFromFailedRestore('/account?tab=addresses');

      // Backend recovered, but there is no session: a legitimate guest.
      await clickRetry(harness);

      expect(router.url.startsWith('/login')).toBe(true);
      expect(router.parseUrl(router.url).queryParamMap.get('returnUrl')).toBe(
        '/account?tab=addresses',
      );
    });

    it('stays put when the retry fails as well', async () => {
      const harness = await arriveFromFailedRestore('/catalog');

      // Still broken.
      scenario.scenario.set('server-error');
      await clickRetry(harness);
      scenario.reset();

      expect(router.url.startsWith('/session-unavailable')).toBe(true);
      expect(session.isAuthenticated()).toBe(false);
      expect(session.isGuest()).toBe(false);
      expect(session.restoreError()).not.toBeNull();
    });

    it('falls back to the default landing page when no destination was requested', async () => {
      scenario = TestBed.inject(MockApiScenario);
      mockServer = TestBed.inject(MockServerSession);

      scenario.scenario.set('server-error');
      restore();
      scenario.reset();

      // Arrived directly, with no returnUrl at all.
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/session-unavailable');

      mockServer.signIn('TEST_APP', 'password');
      await clickRetry(harness);

      expect(router.url).toBe('/catalog');
    });

    it('ignores an attacker-supplied external destination and uses the fallback', async () => {
      scenario = TestBed.inject(MockApiScenario);
      mockServer = TestBed.inject(MockServerSession);

      scenario.scenario.set('server-error');
      restore();
      scenario.reset();

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/session-unavailable?returnUrl=https://phish.example');

      mockServer.signIn('TEST_APP', 'password');
      await clickRetry(harness);

      expect(router.url).toBe('/catalog');
      expect(router.url).not.toContain('phish.example');
    });

    it('does not forward a hostile destination on to the sign-in page either', async () => {
      scenario = TestBed.inject(MockApiScenario);

      scenario.scenario.set('server-error');
      restore();
      scenario.reset();

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/session-unavailable?returnUrl=//phish.example');

      await clickRetry(harness);

      expect(router.url).toBe('/login');
      expect(router.url).not.toContain('phish.example');
    });
  });

  describe('guard: no redundant session calls', () => {
    it('reads session state without issuing a request per navigation', async () => {
      signIn();
      const authApi = TestBed.inject(AuthApi);
      const spy = vi.spyOn(authApi, 'getSessionContext');

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/catalog');
      await harness.navigateByUrl('/account');
      await harness.navigateByUrl('/catalog');

      // The app initializer already resolved the session; the guard must trust it.
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('navigation', () => {
    it('moves between secure pages through the router, not a page load', async () => {
      signIn();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/catalog');

      const accountLink = (harness.fixture.nativeElement as HTMLElement).querySelector<
        HTMLAnchorElement
      >('app-secure-nav a[href="/account"]');
      expect(accountLink).not.toBeNull();

      accountLink?.click();
      await harness.fixture.whenStable();

      // A plain href would have left the router where it was.
      expect(router.url).toBe('/account');
    });
  });

  describe('fallbacks', () => {
    it('sends an unknown URL to not-found inside the public shell', async () => {
      signIn();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/no-such-page');

      expect(harness.routeNativeElement?.textContent).toContain('Page not found');
      const root = harness.fixture.nativeElement as HTMLElement;
      expect(root.querySelector('app-public-shell')).not.toBeNull();
    });

    it('does not let not-found swallow a secure route', async () => {
      signIn();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/catalog');

      expect(harness.routeNativeElement?.textContent).not.toContain('Page not found');
    });

    it('redirects the root URL into the storefront', async () => {
      signIn();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/');

      expect(router.url).toBe('/catalog');
    });
  });
});
