import type { StorefrontFilterDto } from './contracts/catalog.types';

/**
 * The buyer's merchandising selection: filter key to chosen value keys.
 *
 * Keys on both levels are the backend's **stable machine keys** from
 * `get_category_filters`, never labels. Values inside one filter are OR-ed by the
 * backend and different filters are AND-ed; Angular does none of that matching and
 * knows none of those rules - it carries the grouped keys and sends them back.
 */
export type StorefrontFilterSelection = Readonly<Record<string, readonly string[]>>;

/** Nothing selected. A shared frozen value, so identity comparisons stay cheap. */
export const NO_FILTERS: StorefrontFilterSelection = Object.freeze({});

/**
 * Put a selection into its one canonical form.
 *
 * Two selections that mean the same query must produce the same URL and the same
 * request, so that a shared link, a reload and a re-click all land on one cursor
 * fingerprint. The rules, all from the published contract:
 *
 * - filter keys sorted, so click order is not application state;
 * - values sorted within each filter, for the same reason;
 * - duplicate values dropped - "reordering or duplicating values does not change the
 *   query", so they must not change the URL either;
 * - empty arrays dropped entirely, because a filter with nothing chosen is not a
 *   constraint and an empty array in the request is noise the backend must interpret.
 *
 * Deliberately total: any object shape goes in, a valid selection comes out. That is
 * what lets the URL parser hand it arbitrary parsed JSON without a second guard.
 */
export function normalizeSelection(selection: StorefrontFilterSelection): StorefrontFilterSelection {
  const normalized: Record<string, readonly string[]> = {};

  for (const key of Object.keys(selection).sort()) {
    const raw = selection[key];
    if (!Array.isArray(raw)) {
      continue;
    }

    const values = [
      ...new Set(raw.filter((value: unknown): value is string => typeof value === 'string' && value !== '')),
    ].sort();
    if (values.length > 0) {
      normalized[key] = values;
    }
  }

  return normalized;
}

/** Whether anything is selected at all. */
export function hasSelection(selection: StorefrontFilterSelection): boolean {
  return Object.keys(selection).length > 0;
}

/** Whether this exact value is chosen. */
export function isValueSelected(
  selection: StorefrontFilterSelection,
  filterKey: string,
  valueKey: string,
): boolean {
  return (selection[filterKey] ?? []).includes(valueKey);
}

/**
 * Add or remove one value, returning a new normalized selection.
 *
 * A pure function rather than a mutation so the caller can compare the result with what
 * the URL already holds and decide whether a navigation is even needed.
 */
export function toggleValue(
  selection: StorefrontFilterSelection,
  filterKey: string,
  valueKey: string,
): StorefrontFilterSelection {
  const current = selection[filterKey] ?? [];
  const next = current.includes(valueKey)
    ? current.filter((value) => value !== valueKey)
    : [...current, valueKey];

  return normalizeSelection({ ...selection, [filterKey]: next });
}

/** Drop one filter entirely, keeping the rest. */
export function clearFilter(
  selection: StorefrontFilterSelection,
  filterKey: string,
): StorefrontFilterSelection {
  const { [filterKey]: _removed, ...rest } = selection;
  return normalizeSelection(rest);
}

/**
 * Serialise for the `storefront_filters` query parameter and request.
 *
 * `null` when nothing is selected, so the caller can drop the parameter rather than
 * send `{}` - an empty selection is the absence of a constraint, and a URL carrying
 * `storefront_filters={}` would be a different string for the same state.
 */
export function serializeSelection(selection: StorefrontFilterSelection): string | null {
  const normalized = normalizeSelection(selection);
  return hasSelection(normalized) ? JSON.stringify(normalized) : null;
}

/**
 * Read a selection out of untrusted URL text.
 *
 * The query string is attacker-controlled and survives copy-paste, so this **never
 * throws and never passes anything through unexamined**: bad JSON, a JSON array, a
 * string, `null`, nested objects, numeric values - all collapse to "nothing selected",
 * and the page renders the plain category listing.
 *
 * What comes out is a selection of strings and nothing else. Arbitrary URL JSON must
 * never become query grammar, and the narrowing happens here, once, at the boundary.
 */
export function parseSelection(raw: string | null | undefined): StorefrontFilterSelection {
  if (raw === null || raw === undefined || raw === '') {
    return NO_FILTERS;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NO_FILTERS;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return NO_FILTERS;
  }

  const candidate: Record<string, readonly string[]> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      candidate[key] = value.filter((entry): entry is string => typeof entry === 'string');
    }
  }

  return normalizeSelection(candidate);
}

/**
 * Keep only what this category actually offers.
 *
 * A selection can outlive the category it was made in - a shared link, the browser's
 * back button, or a merchant who retired a filter since the tab was opened. Sending a
 * key this category does not expose answers `storefront_filter_unknown`, so the
 * selection is trimmed to the projection **before** it is used, rather than after the
 * backend refuses it.
 *
 * Trimming, never substituting: an unavailable value is dropped and nothing is chosen
 * in its place. The buyer gets a valid listing they can see the state of, not a
 * different query than the one they asked for.
 */
export function reconcileSelection(
  selection: StorefrontFilterSelection,
  filters: readonly StorefrontFilterDto[],
): StorefrontFilterSelection {
  const available = new Map(
    filters.map((filter) => [filter.key, new Set(filter.values.map((value) => value.key))]),
  );

  const kept: Record<string, readonly string[]> = {};
  for (const [key, values] of Object.entries(selection)) {
    const allowed = available.get(key);
    if (allowed === undefined) {
      continue;
    }
    const survivors = values.filter((value) => allowed.has(value));
    if (survivors.length > 0) {
      kept[key] = survivors;
    }
  }

  return normalizeSelection(kept);
}

/** Whether two selections describe the same query. Both are normalized first. */
export function sameSelection(
  a: StorefrontFilterSelection,
  b: StorefrontFilterSelection,
): boolean {
  return JSON.stringify(normalizeSelection(a)) === JSON.stringify(normalizeSelection(b));
}
