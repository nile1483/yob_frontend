/**
 * The page container, in one place.
 *
 * Both shells and both header/footer bars use this, so the brand in the header, the
 * page title under it and the footer note all start at the same x-position at every
 * width. That sounds obvious and was not true before Phase 17: the public shell
 * centred a `max-w-5xl` container while the pages inside it centred their own
 * `max-w-sm` or `max-w-2xl`, so the sign-in form and the payment summary visibly did
 * not line up with the brand above them.
 *
 * Padding steps up with the viewport rather than staying at a phone's 16px, which is
 * what stops a 1440px page from looking like a mobile layout that was stretched.
 *
 * This is a shared constant, not a configuration system: there is one storefront width
 * and changing it means editing one rule. A copied client project that wants a wider
 * catalog edits `.yob-content-container` in `styles.css` and every page follows.
 *
 * ## Since Phase 25J it is a class, not a class list
 *
 * The width, padding and centring moved into `.yob-content-container` so that a page
 * column, a content block's column and these bars are the **same definition** rather
 * than three copies of one string. The rendered geometry is unchanged.
 */
export const SHELL_CONTAINER = 'yob-content-container';

/**
 * The storefront's one content column.
 *
 * Identical to {@link SHELL_CONTAINER} by design - a block inside a full-width band has
 * to line up with the page heading above it and the footer below it, and the only way
 * to guarantee that is for all three to be the same class.
 */
export const CONTENT_CONTAINER = 'yob-content-container';

/**
 * A full-width band inside `main`, with a semantic hook for later styling.
 *
 * ```ts
 * protected readonly section = pageSection('catalog-section');
 * ```
 *
 * The hook is **source-owned**: a Content Placement can style its own band through
 * `section_style`, but nothing a merchant configures may reach the cart, the product
 * page or the order list. That separation is the point of having two mechanisms.
 */
export function pageSection(hook: string): string {
  return `yob-page-section ${hook}`;
}
