/**
 * How a product-content video URL should be presented.
 *
 * `file` - a direct media file the browser can play itself.
 * `link` - some other http(s) address; offered as an ordinary outbound link.
 * `none` - nothing safe to render at all.
 */
export type VideoPresentation =
  | { readonly kind: 'file'; readonly url: string }
  | { readonly kind: 'link'; readonly url: string }
  | { readonly kind: 'none' };

/**
 * The file extensions a `<video>` element is offered.
 *
 * Deliberately the three the contract names and nothing else. A guessed fourth would
 * hand the browser a file it cannot decode and show a broken player where a working
 * link would have done.
 */
const DIRECT_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg'] as const;

/**
 * Decide how to present one merchant-supplied video URL.
 *
 * ## Two presentations, and deliberately no third
 *
 * A direct media file plays inline. **Everything else becomes a link**, including
 * YouTube and Vimeo. Nothing here parses a provider URL, extracts an id, builds an embed
 * address, calls oEmbed or loads a provider SDK - and nothing calls
 * `bypassSecurityTrustResourceUrl`, which is the API an embed would need.
 *
 * That is a security position rather than a scope decision. An `<iframe>` whose `src` a
 * merchant controls is a frame that runs third-party script inside the storefront's
 * origin context, and the only way Angular would allow one is a trust bypass this file
 * does not contain. A link costs the buyer one click and costs the application nothing.
 *
 * ## Why the URL is parsed rather than pattern-matched
 *
 * The extension test has to ignore a query string and a hash - `demo.mp4?token=abc` is a
 * video, and `?v=fake.mp4` is not - so it runs against `URL.pathname`, which the parser
 * has already separated. A string `.endsWith('.mp4')` would get both of those wrong.
 *
 * Parsing is also the protocol check. The backend already restricts this field to
 * http(s), but `javascript:` and `data:` are exactly the values that must never reach an
 * `href`, so they are rejected here too rather than trusted upstream. A URL that does not
 * parse at all is `none`: the buyer sees nothing, which is the correct answer for data
 * nobody can make sense of.
 *
 * The original string is returned, not the parsed one - `URL` normalises, and a merchant's
 * link should go out as they wrote it.
 */
export function videoPresentation(raw: string | null | undefined): VideoPresentation {
  const value = (raw ?? '').trim();
  if (value === '') {
    return { kind: 'none' };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    // Not a URL at all - relative, malformed, or something that only looks like one.
    return { kind: 'none' };
  }

  // The one place a protocol is admitted. Everything else - javascript:, data:, blob:,
  // file: - is refused before it can reach an href or a src.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { kind: 'none' };
  }

  const path = parsed.pathname.toLowerCase();
  const isDirect = DIRECT_VIDEO_EXTENSIONS.some((extension) => path.endsWith(extension));

  return isDirect ? { kind: 'file', url: value } : { kind: 'link', url: value };
}
