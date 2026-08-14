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
 * and changing it means editing this line. A copied client project that wants a wider
 * catalog edits `max-w-6xl` here and every page follows.
 */
export const SHELL_CONTAINER = 'mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8';
