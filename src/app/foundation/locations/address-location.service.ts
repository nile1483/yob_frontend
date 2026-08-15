import { Service } from '@angular/core';

import { COUNTRIES, DEFAULT_COUNTRY, INDIA_STATES, type LocationOption } from './location.data';

/**
 * Country and subdivision lookup, entirely client-side.
 *
 * ## No request, ever
 *
 * The data is compiled into the bundle. There is deliberately no endpoint and no
 * third-party geography service: a dropdown that cannot populate without a network
 * round-trip turns a slow connection into an unfillable address form, and an external
 * API would make a checkout depend on somebody else's uptime and privacy policy.
 *
 * ## Only India ships subdivisions
 *
 * India is the storefront's operating market and the one whose subdivisions the backend
 * actually validates, so its list is complete and canonical. Bundling the world's
 * subdivisions would add a large payload for values nothing checks.
 *
 * {@link subdivisionsFor} therefore returns an empty list for every other country, and
 * that is a *supported* answer rather than a gap: the form falls back to a free-text
 * State field, which is exactly what the backend accepts for those countries. A picker
 * offering nothing would be a broken control; a text box is a working one.
 */
@Service()
export class AddressLocationService {
  /** Every country, in the backend's own spelling. */
  readonly countries: readonly LocationOption[] = COUNTRIES;

  /** The country a new address starts on when the caller does not override it. */
  readonly defaultCountry = DEFAULT_COUNTRY;

  /**
   * Subdivisions for a country, or an empty list when none are bundled.
   *
   * Matching is exact and case-insensitive against the backend's spelling; a value that
   * does not correspond to a known country simply has no subdivisions.
   */
  subdivisionsFor(country: string | null | undefined): readonly LocationOption[] {
    return this.isIndia(country) ? INDIA_STATES : [];
  }

  /** Whether this country has a controlled subdivision list at all. */
  hasSubdivisions(country: string | null | undefined): boolean {
    return this.subdivisionsFor(country).length > 0;
  }

  /**
   * Whether a state is valid for a country.
   *
   * Used to decide if a stored state survives a country change. A country with no
   * bundled subdivisions accepts anything, because nothing here is in a position to
   * judge it - the backend is.
   */
  isValidSubdivision(country: string | null | undefined, state: string | null | undefined): boolean {
    const options = this.subdivisionsFor(country);
    if (options.length === 0) {
      return true;
    }
    const candidate = (state ?? '').trim().toLowerCase();
    return candidate !== '' && options.some((o) => o.name.toLowerCase() === candidate);
  }

  /**
   * The canonical spelling of a country, if it is one we know.
   *
   * Lets a stored value that differs only in case be matched to its option without
   * rewriting what the backend already holds.
   */
  canonicalCountry(country: string | null | undefined): string | null {
    const candidate = (country ?? '').trim().toLowerCase();
    return this.countries.find((c) => c.name.toLowerCase() === candidate)?.name ?? null;
  }

  private isIndia(country: string | null | undefined): boolean {
    return (country ?? '').trim().toLowerCase() === DEFAULT_COUNTRY.toLowerCase();
  }
}
