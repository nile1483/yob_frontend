import { sanitizeReturnUrl } from './return-url';

describe('sanitizeReturnUrl', () => {
  it('accepts local application paths', () => {
    expect(sanitizeReturnUrl('/catalog')).toBe('/catalog');
    expect(sanitizeReturnUrl('/catalog/example')).toBe('/catalog/example');
    expect(sanitizeReturnUrl('/session-unavailable')).toBe('/session-unavailable');
    expect(sanitizeReturnUrl('/catalog?page=2&sort=name')).toBe('/catalog?page=2&sort=name');
    expect(sanitizeReturnUrl('/catalog#anchor')).toBe('/catalog#anchor');
  });

  it('rejects absolute URLs to another origin', () => {
    expect(sanitizeReturnUrl('https://phish.example/login')).toBeNull();
    expect(sanitizeReturnUrl('http://phish.example')).toBeNull();
  });

  it('rejects protocol-relative URLs, which browsers treat as external', () => {
    expect(sanitizeReturnUrl('//phish.example')).toBeNull();
    expect(sanitizeReturnUrl('//phish.example/catalog')).toBeNull();
  });

  it('rejects backslash variants that slip past a naive // check', () => {
    // Browsers normalise backslashes to forward slashes, so these are external too.
    expect(sanitizeReturnUrl('/\\phish.example')).toBeNull();
    expect(sanitizeReturnUrl('\\\\phish.example')).toBeNull();
    expect(sanitizeReturnUrl('/catalog\\..\\..')).toBeNull();
  });

  it('rejects a scheme hiding behind leading slashes', () => {
    expect(sanitizeReturnUrl('/javascript:alert(1)')).toBeNull();
    expect(sanitizeReturnUrl('/data:text/html,x')).toBeNull();
  });

  it('rejects whitespace and control characters', () => {
    expect(sanitizeReturnUrl('/cat alog')).toBeNull();
    expect(sanitizeReturnUrl('/catalog\n')).toBeNull();
    expect(sanitizeReturnUrl('\t/catalog')).toBeNull();
  });

  it('rejects relative paths that would resolve against the current page', () => {
    expect(sanitizeReturnUrl('catalog')).toBeNull();
    expect(sanitizeReturnUrl('../catalog')).toBeNull();
  });

  it('treats absent or empty input as no destination requested', () => {
    expect(sanitizeReturnUrl(null)).toBeNull();
    expect(sanitizeReturnUrl(undefined)).toBeNull();
    expect(sanitizeReturnUrl('')).toBeNull();
  });
});
