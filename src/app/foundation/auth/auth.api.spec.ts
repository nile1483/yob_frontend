import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { YOB_API_CONFIG, type YobApiConfig } from '../network/yob-api.config';
import { AuthApi } from './auth.api';

/**
 * A non-production application code on purpose: a hardcoded 'STOREFRONT' anywhere in
 * the auth layer would fail these tests instead of passing by coincidence.
 */
const CONFIG: YobApiConfig = { methodBasePath: '/api/method/', application: 'TEST_APP' };

describe('AuthApi', () => {
  let auth: AuthApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: YOB_API_CONFIG, useValue: CONFIG },
      ],
    });
    auth = TestBed.inject(AuthApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the session context with the configured application as a query param', () => {
    auth.getSessionContext().subscribe();

    const req = http.expectOne(
      (r) => r.url === '/api/method/yob_auth.api.auth.get_session_context',
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('application')).toBe('TEST_APP');
    req.flush({ message: { data: {} } });
  });

  it('posts password credentials with the configured application', () => {
    auth.loginWithPassword({ username: 'someone@yob.test', password: 'secret' }).subscribe();

    const req = http.expectOne('/api/method/yob_auth.api.auth.login_with_password');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      application: 'TEST_APP',
      username: 'someone@yob.test',
      password: 'secret',
    });
    req.flush({ message: { data: {} } });
  });

  it('never sends a sid or cookie header of its own', () => {
    auth.loginWithPassword({ username: 'someone@yob.test', password: 'secret' }).subscribe();

    const req = http.expectOne('/api/method/yob_auth.api.auth.login_with_password');
    expect(req.request.headers.has('Cookie')).toBe(false);
    expect(req.request.withCredentials).toBeFalsy();
    expect(JSON.stringify(req.request.body)).not.toContain('sid');
    req.flush({ message: { data: {} } });
  });

  it('posts logout with an empty body', () => {
    auth.logout().subscribe();

    const req = http.expectOne('/api/method/yob_auth.api.auth.logout');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ message: { data: { authenticated: false }, notice: 'Logout successful.' } });
  });

  it('posts an OTP challenge without an application, which the backend recovers', () => {
    auth.loginWithOtp({ challenge_id: 'chal-1', otp: '123456' }).subscribe();

    const req = http.expectOne('/api/method/yob_auth.api.auth.login_with_otp');
    expect(req.request.body).toEqual({ challenge_id: 'chal-1', otp: '123456' });
    req.flush({ message: { data: {} } });
  });

  it('requests an OTP with the three verified required fields', () => {
    auth.requestOtp({ identifier: 'someone@yob.test', method: 'email' }).subscribe();

    const req = http.expectOne('/api/method/yob_auth.api.auth.request_otp');
    expect(req.request.body).toEqual({
      application: 'TEST_APP',
      identifier: 'someone@yob.test',
      method: 'email',
    });
    req.flush({ message: { data: {}, notice: 'If the account is eligible, a code was sent.' } });
  });
});
