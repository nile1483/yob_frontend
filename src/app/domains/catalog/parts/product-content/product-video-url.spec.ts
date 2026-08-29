import { videoPresentation } from './product-video-url';

/**
 * Which video URLs play here, which are linked, and which are refused (Phase 27D).
 *
 * The refusals matter most. The backend restricts this field to http(s), so the
 * `javascript:` and `data:` cases below cannot arrive today - they are asserted because
 * the frontend must not be the layer that assumes they cannot, and because the answer
 * has to stay "render nothing" if that assumption ever stops holding.
 */
describe('videoPresentation', () => {
  describe('direct media files', () => {
    for (const url of [
      'https://cdn.example.test/demo.mp4',
      'https://cdn.example.test/demo.webm',
      'https://cdn.example.test/demo.ogg',
      // Case is a property of a filesystem somewhere, not of the format.
      'https://cdn.example.test/DEMO.MP4',
      'https://cdn.example.test/Demo.WebM',
      // The extension test runs on the path, so neither of these hides it.
      'https://cdn.example.test/demo.mp4?token=abc&version=2',
      'https://cdn.example.test/demo.mp4#t=30',
      'https://cdn.example.test/demo.mp4?token=abc#t=30',
      'http://cdn.example.test/demo.mp4',
      'https://cdn.example.test/a/b/c/demo.webm',
    ]) {
      it(`plays ${url}`, () => {
        expect(videoPresentation(url)).toEqual({ kind: 'file', url });
      });
    }

    it('returns the merchant string, not a normalised one', () => {
      // `URL` would re-encode and reorder; a merchant's link goes out as written.
      const url = 'https://cdn.example.test/demo.mp4?b=2&a=1';
      expect(videoPresentation(url)).toEqual({ kind: 'file', url });
    });
  });

  describe('everything else on http(s)', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://vimeo.com/123456789',
      'https://example.test/how-to-install',
      // A query string that only looks like a file. The path decides.
      'https://example.test/watch?file=demo.mp4',
      // A format no browser is promised to decode.
      'https://cdn.example.test/demo.mov',
      'https://cdn.example.test/demo.avi',
    ]) {
      it(`links ${url}`, () => {
        expect(videoPresentation(url)).toEqual({ kind: 'link', url });
      });
    }
  });

  describe('refusals', () => {
    for (const url of [
      'javascript:alert(1)',
      // eslint-disable-next-line no-script-url
      'JavaScript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'data:video/mp4;base64,AAAA',
      'blob:https://example.test/1234',
      'file:///etc/passwd',
      'ftp://example.test/demo.mp4',
      'vbscript:msgbox(1)',
    ]) {
      it(`refuses ${url.slice(0, 40)}`, () => {
        expect(videoPresentation(url)).toEqual({ kind: 'none' });
      });
    }

    for (const [label, url] of [
      ['a relative path', '/files/demo.mp4'],
      ['a bare host', 'example.test/demo.mp4'],
      ['nonsense', 'not a url at all'],
      ['empty', ''],
      ['whitespace', '   '],
    ] as const) {
      it(`refuses ${label}`, () => {
        expect(videoPresentation(url)).toEqual({ kind: 'none' });
      });
    }

    it('refuses null and undefined without throwing', () => {
      expect(videoPresentation(null)).toEqual({ kind: 'none' });
      expect(videoPresentation(undefined)).toEqual({ kind: 'none' });
    });
  });
});
