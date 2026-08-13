import { YOB_CLIENT_ERROR_CODES, YobApiError } from '../../foundation/network/yob-api-error';
import { loginErrorMessage } from './login-error-message';

function apiError(code: string, detail = 'backend wording', httpStatus = 400): YobApiError {
  return new YobApiError({ kind: 'yob', httpStatus, errors: [{ code, detail }] });
}

describe('loginErrorMessage', () => {
  it('is vague about invalid credentials on purpose', () => {
    const message = loginErrorMessage(
      apiError('invalid_credentials', 'Invalid login credentials.', 401),
    );

    expect(message).toBe('The username or password is incorrect.');
    // Distinguishing "no such user" from "wrong password" would turn the form into a
    // way to test whether an account exists.
    expect(message).not.toMatch(/user.*not.*(found|exist)/i);
    expect(message).not.toMatch(/password.*(wrong|incorrect).*only/i);
  });

  it('points access denial at support rather than at the password', () => {
    const message = loginErrorMessage(apiError('application_access_denied', 'not allowed', 403));

    expect(message).toContain('cannot access this store');
    expect(message).not.toMatch(/password/i);
  });

  it('explains a disabled sign-in method', () => {
    expect(loginErrorMessage(apiError('login_method_disabled', 'disabled', 422))).toContain(
      'currently unavailable',
    );
  });

  it('asks the user to wait when rate limited, without inventing a duration', () => {
    const message = loginErrorMessage(apiError('rate_limit_exceeded', 'too many', 429));

    expect(message).toContain('Too many sign-in attempts');
    // The backend supplies no retry duration, so no countdown and no fake number.
    expect(message).not.toMatch(/\d+\s*(second|minute|hour)s?\b/i);
  });

  it('treats a validation failure as a configuration fault, not user error', () => {
    // The form guarantees both fields are filled, so this can only be the application
    // code sent with the request.
    const message = loginErrorMessage(
      apiError('validation_failed', 'Application is required.', 422),
    );

    expect(message).toContain('contact support');
    expect(message).not.toContain('Application is required.');
  });

  it('describes an offline client', () => {
    expect(
      loginErrorMessage(
        new YobApiError({
          kind: 'transport',
          httpStatus: 0,
          errors: [{ code: YOB_CLIENT_ERROR_CODES.networkUnavailable, detail: 'x' }],
        }),
      ),
    ).toContain('could not reach the server');
  });

  it('describes a timeout', () => {
    expect(
      loginErrorMessage(
        new YobApiError({
          kind: 'transport',
          httpStatus: 0,
          errors: [{ code: YOB_CLIENT_ERROR_CODES.requestTimeout, detail: 'x' }],
        }),
      ),
    ).toContain('took too long');
  });

  it('falls back safely for a server error', () => {
    expect(loginErrorMessage(apiError('internal_server_error', 'boom', 500))).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('falls back safely for a code it has never seen', () => {
    expect(loginErrorMessage(apiError('some_future_backend_code', 'boom', 400))).toBe(
      'Something went wrong. Please try again.',
    );
  });

  describe('never leaks backend internals', () => {
    const hostile = new YobApiError({
      kind: 'frappe',
      httpStatus: 403,
      frappeExcType: 'PermissionError',
      errors: [
        {
          code: 'some_future_backend_code',
          detail:
            'frappe.exceptions.PermissionError: <details><summary>Traceback</summary>/apps/frappe/app.py</details>',
        },
      ],
    });

    it('echoes nothing from the failure', () => {
      const message = loginErrorMessage(hostile);

      expect(message).not.toContain('frappe');
      expect(message).not.toContain('PermissionError');
      expect(message).not.toContain('Traceback');
      expect(message).not.toContain('<details>');
      expect(message).not.toContain('.py');
    });

    it('maps by code alone, so backend wording can never reach the screen', () => {
      const sameCodeDifferentDetail = apiError('invalid_credentials', 'ANYTHING AT ALL', 401);

      expect(loginErrorMessage(sameCodeDifferentDetail)).toBe(
        loginErrorMessage(apiError('invalid_credentials', 'something else', 401)),
      );
    });
  });
});
