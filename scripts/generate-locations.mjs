/**
 * Regenerates `src/app/foundation/locations/location.data.ts` from the bench.
 *
 * The country and Indian-subdivision names written into a Frappe Address are validated
 * server-side - `country` links to the Country doctype, and `state` is checked by India
 * Compliance - so the only safe source for them is the system doing the validating. This
 * reads the installed apps rather than a generic dataset, which is what keeps merged and
 * renamed territories correct.
 *
 * Run after a bench upgrade:
 *
 *   node scripts/generate-locations.mjs
 *
 * It is a developer tool, not part of the build: the generated file is committed so the
 * application never depends on a bench being present.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BENCH = process.env.YOB_BENCH ?? resolve(process.env.HOME ?? '', 'frappe_local/frappe-bench');
const COUNTRY_INFO = `${BENCH}/apps/frappe/frappe/geo/country_info.json`;
const GST_CONSTANTS = `${BENCH}/apps/india_compliance/india_compliance/gst_india/constants/__init__.py`;
const OUT = 'src/app/foundation/locations/location.data.ts';

/** GST filing artefacts, not places a buyer has a postal address in. */
const EXCLUDED_STATES = new Set(['Other Countries', 'Other Territory']);

const countries = JSON.parse(readFileSync(COUNTRY_INFO, 'utf8'));
const gst = readFileSync(GST_CONSTANTS, 'utf8');

const block = /STATE_NUMBERS = \{(.*?)\}/s.exec(gst)?.[1];
if (!block) throw new Error(`STATE_NUMBERS not found in ${GST_CONSTANTS}`);

const states = [...block.matchAll(/"([^"]+)":\s*"(\d+)"/g)]
  .map(([, name, code]) => ({ name, code }))
  .filter((s) => !EXCLUDED_STATES.has(s.name))
  .sort((a, b) => a.name.localeCompare(b.name));

const countryOptions = Object.keys(countries)
  .sort()
  .map((name) => ({ name, code: String(countries[name].code).toUpperCase() }));

const current = readFileSync(OUT, 'utf8');
const header = current.slice(0, current.indexOf('/** Every country Frappe knows'));
const row = (o) => `  { name: ${JSON.stringify(o.name)}, code: ${JSON.stringify(o.code)} },`;
const statesDoc = current.slice(current.indexOf('/**\n * Indian states'), current.indexOf('export const INDIA_STATES'));

writeFileSync(
  OUT,
  [
    header.trimEnd(),
    '',
    '/** Every country Frappe knows, spelled exactly as the Country doctype spells it. */',
    'export const COUNTRIES: readonly LocationOption[] = [',
    ...countryOptions.map(row),
    '];',
    '',
    statesDoc.trimEnd(),
    'export const INDIA_STATES: readonly LocationOption[] = [',
    ...states.map(row),
    '];',
    '',
  ].join('\n'),
);

console.log(`countries: ${countryOptions.length}, indian subdivisions: ${states.length}`);
