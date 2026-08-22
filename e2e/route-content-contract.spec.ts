import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { ROUTE_SLOTS } from '../src/app/domains/content/contracts/route-content.types';

/**
 * The route/slot registry, checked against the contract that publishes it.
 *
 * ## Why this test exists
 *
 * Phase 25H depends on a table that lives in two repositories: the backend decides which
 * `(route, slot)` positions it will accept, and Angular hard-codes the same table so a
 * merchant cannot invent a position at runtime. Two copies of one truth is exactly the
 * drift the Phase 25F review warned about, and a transcription slip would not fail
 * anything - the slot would simply render nothing, for ever, silently.
 *
 * So the local registry is asserted against `x-route-slots` in the published document
 * rather than being trusted. This is a guard, not a generator: nothing here writes code,
 * and the repository gains no build step.
 *
 * It runs in the e2e project because that is where the repository already reads the
 * mirrored contract from disk (`variant-contract.spec.ts`); unit tests run in a browser
 * environment with no filesystem.
 */

interface OpenApiDocument {
  readonly info: { readonly version: string };
  readonly paths: Record<
    string,
    Record<string, { readonly parameters?: readonly { readonly name: string }[] }>
  >;
  readonly components: {
    readonly schemas: Record<
      string,
      { readonly 'x-route-slots'?: Readonly<Record<string, readonly string[]>> }
    >;
  };
}

function contract(file: string): OpenApiDocument {
  return JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8')) as OpenApiDocument;
}

const REFERENCE = contract('reference/api/openapi.json');
const HANDOFF = contract('docs/api-handoff/openapi.json');

/** The published registry lives on the response schema that returns it. */
function publishedSlots(doc: OpenApiDocument): Readonly<Record<string, readonly string[]>> {
  const table = doc.components.schemas['RouteContentResponse']?.['x-route-slots'];
  expect(table, 'x-route-slots is published on RouteContentResponse').toBeDefined();
  return table!;
}

/** Every `.ts` file under a directory, recursively. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (path.endsWith('.ts')) {
      out.push(path);
    }
  }
  return out;
}

const APP_FILES = sourceFiles(resolve(process.cwd(), 'src/app'));

test.describe('system route content contract (API 3.5.0)', () => {
  test('the mirrored contract is present, versioned and identical in both locations', () => {
    expect(REFERENCE.info.version).toBe('3.5.0');
    expect(HANDOFF.info.version).toBe(REFERENCE.info.version);
    expect(publishedSlots(HANDOFF)).toEqual(publishedSlots(REFERENCE));
  });

  test('get_route_content is published as a GET taking route_key', () => {
    const path = REFERENCE.paths['/api/method/yob_storefront.api.cms.get_route_content'];
    expect(path, 'the endpoint is published').toBeDefined();

    const params = (path!['get']?.parameters ?? []).map((parameter) => parameter.name);
    expect(params).toEqual(['route_key']);
  });

  test('the Angular registry is exactly the published route/slot table', () => {
    // Not a subset and not a superset. A route Angular knows about that the backend
    // would refuse is a guaranteed `content_route_unknown`; a route the backend offers
    // that Angular omits is a position no merchant can ever fill.
    expect(ROUTE_SLOTS).toEqual(publishedSlots(REFERENCE));
  });

  test('the excluded flows are absent from the published table too', () => {
    const published = Object.keys(publishedSlots(REFERENCE));

    for (const excluded of ['login', 'access', 'checkout', 'payment', 'payment_callback']) {
      expect(published).not.toContain(excluded);
    }
  });
});

test.describe('one block renderer, not one per host', () => {
  test('the block-type dispatch exists in exactly one file', () => {
    // The Phase 25H acceptance condition: adding a sixth block type must be a change to
    // the shared renderer and to nothing else. A second `@case ('image_banner')`
    // anywhere - in a slot, in a page, on the cart - is that condition breaking.
    const dispatchers = APP_FILES.filter((file) =>
      readFileSync(file, 'utf8').includes("@case ('image_banner')"),
    ).map((file) => file.replace(`${process.cwd()}/`, ''));

    expect(dispatchers).toEqual(['src/app/domains/content/parts/content-blocks.ts']);
  });

  test('no host page names a block type at all', () => {
    // A cart, an order or an account page must not learn that carousels exist.
    const hosts = APP_FILES.filter(
      (file) => !file.includes('/domains/content/') && !file.endsWith('.spec.ts'),
    );

    for (const file of hosts) {
      const source = readFileSync(file, 'utf8');
      for (const blockType of ['banner_carousel', 'promo_grid', 'image_banner', 'rich_text']) {
        expect(source, `${file} names the block type ${blockType}`).not.toContain(blockType);
      }
    }
  });
});

test.describe('every declared slot usage is a real position', () => {
  /** Every `<yob-content-slot routeKey="…" slotKey="…" />` written in application source. */
  function declaredUsages(): readonly { file: string; route: string; slot: string }[] {
    const pattern = /<yob-content-slot\s+routeKey="([a-z_]+)"\s+slotKey="([a-z_]+)"/g;
    const found: { file: string; route: string; slot: string }[] = [];

    for (const file of APP_FILES) {
      if (file.endsWith('.spec.ts')) {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        found.push({
          file: file.replace(`${process.cwd()}/`, ''),
          route: match[1]!,
          slot: match[2]!,
        });
      }
    }
    return found;
  }

  test('each usage names a pair the backend publishes', () => {
    const published = publishedSlots(REFERENCE);
    const usages = declaredUsages();

    expect(usages.length).toBeGreaterThan(0);
    for (const usage of usages) {
      expect(published[usage.route], `${usage.file} uses route ${usage.route}`).toBeDefined();
      expect(published[usage.route], `${usage.file} uses ${usage.route}.${usage.slot}`).toContain(
        usage.slot,
      );
    }
  });

  test('every published position is actually rendered somewhere', () => {
    const published = publishedSlots(REFERENCE);
    const usages = declaredUsages();
    const rendered = new Set(usages.map((usage) => `${usage.route}.${usage.slot}`));

    // A position the backend offers and Angular never draws is one a merchant can
    // configure and never see.
    const missing: string[] = [];
    for (const [route, slots] of Object.entries(published)) {
      for (const slot of slots) {
        if (!rendered.has(`${route}.${slot}`)) {
          missing.push(`${route}.${slot}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  test('no excluded flow declares one', () => {
    const excludedAreas = ['/domains/access/', '/domains/checkout/', '/domains/payment/'];
    const offenders = declaredUsages().filter((usage) =>
      excludedAreas.some((area) => usage.file.includes(area)),
    );

    expect(offenders).toEqual([]);
  });
});
