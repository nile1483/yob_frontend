import { InjectionToken, inject } from '@angular/core';

import { environment } from '../../../environments/environment';

/**
 * The currency code catalog prices are rendered in.
 *
 * ## Why this exists at all
 *
 * The catalog endpoints do not return a currency. `get_category` gives `rate`,
 * `base_price` and the rest as bare numbers, and no field names the currency they are
 * in. `get_cart` does return one, and `get_config` exposes `default_currency`, so the
 * value is knowable - just not from this endpoint.
 *
 * Rather than invent a field or hardcode a symbol in a template, the code comes from
 * environment configuration, which `CLAUDE.md` allows for exactly this ("locale/
 * currency defaults when technically required"). It feeds Angular's `CurrencyPipe`, so
 * formatting stays locale-aware instead of string concatenation.
 *
 * ## To be replaced
 *
 * `get_config.default_currency` is the authoritative source. When the store-context
 * phase loads that config, this token should be provided from it and the environment
 * value dropped to a fallback. Injecting it as a token rather than reading
 * `environment` directly is what makes that a one-line change instead of a hunt
 * through templates.
 */
export const CATALOG_CURRENCY = new InjectionToken<string>('CATALOG_CURRENCY', {
  providedIn: 'root',
  factory: () => environment.locale.defaultCurrency,
});

/** Convenience for components that only need the code. */
export function injectCatalogCurrency(): string {
  return inject(CATALOG_CURRENCY);
}
