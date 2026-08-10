import type { SessionContextDto } from '../../app/foundation/auth/auth.types';

/**
 * Development-only credentials for the mock API.
 *
 * Intentionally not the real local bench credentials, and intentionally unusable
 * anywhere: `.invalid` is reserved by RFC 2606 and can never resolve. Nothing in this
 * repository may contain a credential that works against a real system.
 */
export const MOCK_CREDENTIALS = {
  username: 'mock.buyer@example.invalid',
  password: 'mock-password-not-a-secret',
} as const;

/** Stands in for the token Frappe would generate for the session. */
export const MOCK_CSRF_TOKEN = 'mock-csrf-token-000000000000';

/**
 * The authenticated payload, mirroring the verified `SessionContextDto` field for
 * field - snake_case included.
 *
 * Fixtures stay in API shape on purpose. Converting them to friendlier models here
 * would mean the mock tested a different contract than the backend serves; DTO
 * mapping, if a domain ever needs it, belongs in that domain's data layer.
 *
 * `application` is supplied by the caller so the mock echoes whatever the environment
 * is configured with, rather than hardcoding a code of its own.
 */
export function mockSessionContext(
  application: string,
  authenticationMethod: 'password' | 'session' | string,
): SessionContextDto {
  return {
    authenticated: true,
    authentication_method: authenticationMethod,
    user: {
      name: MOCK_CREDENTIALS.username,
      full_name: 'Mock Buyer',
      user_image: null,
      email: MOCK_CREDENTIALS.username,
      mobile_no: null,
    },
    context: {
      application,
      profile_doctype: 'Customer',
      profile_name: 'Mock Trading Co',
    },
    csrf_token: MOCK_CSRF_TOKEN,
  };
}
