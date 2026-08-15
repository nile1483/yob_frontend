/**
 * Reading a media reference out of a backend DTO.
 *
 * ## What the backend actually sends
 *
 * Frappe `Attach Image` fields arrive as **root-relative, same-origin** paths:
 *
 * ```text
 * /files/3502LFWashedBasil-9199118_10996554.jpg
 * ```
 *
 * Not absolute URLs, and not a media host. Wire-verified in Phase 18 against the
 * development bench for both `item.image` and `category.thumbnail`.
 *
 * That shape is already directly usable in an `src`, because the storefront is served
 * from the same origin that serves `/files` - the edge in production, and the dev
 * proxy's `/files` entry in development. So there is deliberately **no URL rewriting
 * here**: no base-URL prefixing, no CDN host, no environment-specific media root. Adding
 * one would break the moment the backend started emitting absolute URLs, and would be a
 * second place for the storefront's origin to be decided.
 *
 * ## Why this exists at all
 *
 * One thing does need normalizing. The DTOs type these fields as `string | null`, but a
 * Frappe `Attach Image` that has been cleared can arrive as an **empty string** rather
 * than null. `src=""` re-requests the current page and then fails as an image, which
 * renders the browser's broken-image icon - the exact thing the media fallback exists to
 * prevent. A whitespace-only value does the same.
 *
 * So absence is decided here, once, rather than by every template writing a slightly
 * different truthiness check.
 */
export function mediaUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
