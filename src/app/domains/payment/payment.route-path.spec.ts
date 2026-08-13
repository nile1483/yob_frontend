import { PAYMENT_PATH, sanitizePaymentUrl } from './payment.route-path';

/**
 * The server decides where checkout continues, but the browser still refuses to
 * navigate anywhere that is not this application's payment route.
 */
describe('sanitizePaymentUrl', () => {
  it('accepts the documented shape', () => {
    // Reference 2.0.0 returns exactly this: a relative SPA path with one token segment.
    expect(sanitizePaymentUrl('/payment/abc123')).toBe('/payment/abc123');
  });

  it('accepts a token containing url-safe punctuation', () => {
    expect(sanitizePaymentUrl('/payment/aB3-_.~xyz')).toBe('/payment/aB3-_.~xyz');
  });

  it.each([
    ['an absolute external URL', 'https://phish.example/payment/abc'],
    ['a protocol-relative URL', '//phish.example/payment/abc'],
    ['a backslash-smuggled host', '/\\phish.example/payment/abc'],
    ['an embedded scheme', '/javascript:alert(1)'],
    ['a different internal route', '/catalog'],
    ['the login route', '/login?returnUrl=/payment/abc'],
    ['a payment path with no token', '/payment/'],
    ['the bare payment path', '/payment'],
    ['a deeper payment path', '/payment/abc/extra'],
    ['a relative path', 'payment/abc'],
    ['whitespace', '/payment/ abc'],
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('refuses %s', (_label, candidate) => {
    expect(sanitizePaymentUrl(candidate)).toBeNull();
  });

  it('refuses extra routing smuggled in a query or fragment', () => {
    // The segment check must not be fooled by what follows the path.
    expect(sanitizePaymentUrl('/payment/abc/evil?x=1')).toBeNull();
    expect(sanitizePaymentUrl('/payment/abc/evil#y')).toBeNull();
  });

  it('exposes the route base the router also uses', () => {
    // One definition, so the guard and the route table cannot drift apart.
    expect(PAYMENT_PATH).toBe('/payment');
  });
});
