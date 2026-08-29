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
      {
        readonly 'x-route-slots'?: Readonly<Record<string, readonly string[]>>;
        readonly enum?: readonly string[];
        readonly required?: readonly string[];
        readonly properties?: Readonly<Record<string, { readonly $ref?: string }>>;
      }
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

/**
 * A file's code, with its prose removed.
 *
 * These scans look for what the application *does*, and this repository documents its
 * decisions at length - `content-section.ts` explains at some length why it does not use
 * `100vw`, which a naive grep reads as an offence. Comments are stripped so a scan
 * cannot be tripped by a file describing the very rule it is obeying.
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

test.describe('system route content contract (API 3.9.1)', () => {
  test('the mirrored contract is present, versioned and identical in both locations', () => {
    expect(REFERENCE.info.version).toBe('3.9.1');
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

test.describe('placement style and width contract (Phase 25L)', () => {
  test('ContentWidth is published with exactly the two approved words', () => {
    const published = REFERENCE.components.schemas['ContentWidth'];
    expect(published, 'ContentWidth is published').toBeDefined();
    expect(published!.enum).toEqual(['contained', 'full_width']);
    expect(HANDOFF.components.schemas['ContentWidth']!.enum).toEqual(published!.enum);
  });

  test('content_width is a common, required field on every ContentBlock', () => {
    const block = REFERENCE.components.schemas['ContentBlock'];
    expect(block!.required).toContain('content_width');
    expect(block!.required).toContain('section_style');

    // Referenced, not inlined - so the enum has exactly one definition to agree with.
    expect(block!.properties?.['content_width']?.$ref).toBe('#/components/schemas/ContentWidth');
  });

  test('the Angular type spells the same two words, and no more', () => {
    // The DTO is a hand-written union, so it is asserted against the published enum
    // rather than trusted. A third value invented here would be a width no backend
    // could ever send; a missing one would be a placement Angular silently contains.
    const published = REFERENCE.components.schemas['ContentWidth']!.enum!;
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/domains/content/contracts/page.types.ts'),
      'utf8',
    );
    const declared = /export type ContentWidth =([^;]+);/.exec(source)?.[1] ?? '';
    const words = [...declared.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);

    expect(words.sort()).toEqual([...published].sort());
  });

  test('nothing builds a class or a request from the width', () => {
    const offenders = APP_FILES.filter(
      (file) =>
        !file.endsWith('.spec.ts') &&
        /(content-width-\$\{|width-\$\{|`full_width|w-\[100vw\]|w-screen)/.test(code(file)),
    ).map((file) => file.replace(`${process.cwd()}/`, ''));

    expect(offenders).toEqual([]);
  });

  test('only the content domain interprets a width', () => {
    // A placement decides its own containment. It must never reach the cart, the product
    // page or the order list, whose columns are source-owned.
    const offenders = APP_FILES.filter((file) => {
      if (file.includes('/domains/content/') || file.endsWith('.spec.ts')) {
        return false;
      }
      return /content_width|ContentWidth|isFullWidth/.test(code(file));
    }).map((file) => file.replace(`${process.cwd()}/`, ''));

    expect(offenders).toEqual([]);
  });
});

test.describe('product suggestion contract (Phase 26B)', () => {
  const PATH = '/api/method/yob_storefront.api.catalog.get_product_suggestions';

  test('the endpoint is published as a GET taking search', () => {
    const path = REFERENCE.paths[PATH];
    expect(path, 'the endpoint is published').toBeDefined();

    const params = (path!['get']?.parameters ?? []).map((parameter) => parameter.name);
    expect(params).toEqual(['search']);
  });

  test('ProductSuggestion publishes exactly the five fields Angular renders', () => {
    const schema = REFERENCE.components.schemas['ProductSuggestion'];
    expect(schema, 'ProductSuggestion is published').toBeDefined();

    expect([...(schema!.required ?? [])].sort()).toEqual([
      'image',
      'is_template',
      'item_code',
      'item_name',
      'slug',
    ]);
    expect(HANDOFF.components.schemas['ProductSuggestion']!.required).toEqual(schema!.required);
  });

  test('it carries nothing monetary, and no listing field', () => {
    const schema = REFERENCE.components.schemas['ProductSuggestion']!;
    const properties = Object.keys(schema.properties ?? {});

    // A price in a dropdown is a second place for money to be wrong. The contract says
    // these will never be here; this fails loudly if that ever changes.
    for (const forbidden of [
      'rate',
      'base_price',
      'discount_percentage',
      'net_amount',
      'tax_amount',
      'total_amount',
      'uom',
      'stock_uom',
      'conversion_factor',
      'stock_qty',
      'price_state',
      'pricing_rule_label',
    ]) {
      expect(properties, `ProductSuggestion published ${forbidden}`).not.toContain(forbidden);
    }
  });

  test('the Angular DTO spells the same five fields, and no others', () => {
    // The DTO is hand-written, so it is asserted against the published schema rather
    // than trusted. An invented field would be one no backend could ever send.
    const published = Object.keys(
      REFERENCE.components.schemas['ProductSuggestion']!.properties ?? {},
    ).sort();

    const source = readFileSync(
      resolve(process.cwd(), 'src/app/domains/catalog/contracts/catalog.types.ts'),
      'utf8',
    );
    const declared = /export interface ProductSuggestionDto \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? '';
    const fields = [...declared.matchAll(/readonly (\w+):/g)].map((match) => match[1]!).sort();

    expect(fields).toEqual(published);
  });

  test('the header never reaches for a listing endpoint', () => {
    // Discovery is the dedicated endpoint's job. A listing, item or resolver call from
    // the search widget would be a different feature leaking into the header.
    const search = readFileSync(
      resolve(process.cwd(), 'src/app/widgets/product-search/product-search.ts'),
      'utf8',
    );

    for (const forbidden of ['getItems', 'getItem(', 'resolveVariant']) {
      expect(code(resolve(process.cwd(), 'src/app/widgets/product-search/product-search.ts')),
        `product search calls ${forbidden}`).not.toContain(forbidden);
    }
    expect(search).toContain('getProductSuggestions');
  });
});

test.describe('the width architecture is source-controlled (Phase 25J)', () => {
  test('no section background is built from viewport units', () => {
    // `100vw` includes the scrollbar gutter, so a full-bleed band built from it is a few
    // pixels wider than the page on every desktop with a classic scrollbar - which is
    // precisely the horizontal overflow the layout suite fails on. `width: 100%` of a
    // full-width `main` is the correct primitive and the one this phase uses.
    // Scoped to how an element is SIZED. `100vw` inside an <img sizes> attribute is the
    // correct use of the unit - it tells the browser how wide the image will render -
    // and has nothing to do with a section background.
    // Specs excluded, as in the sibling scans: `content-section.spec.ts` asserts these
    // very strings are absent from the DOM, so it necessarily contains them.
    const offenders = APP_FILES.filter(
      (file) =>
        !file.endsWith('.spec.ts') &&
        (/\b(w-screen|min-w-screen)\b|w-\[100vw\]|width:\s*100vw/.test(code(file))),
    ).map((file) => file.replace(`${process.cwd()}/`, ''));

    expect(offenders).toEqual([]);
  });

  test('no section class is constructed from a backend value', () => {
    // Tailwind compiles the classes it can see. An interpolated `yob-section-${style}`
    // would name a class that exists in the DOM and nowhere in the stylesheet, and would
    // also hand a backend value straight into the class attribute.
    // Specs excluded, as elsewhere: `content-section.spec.ts` asserts this exact string
    // is absent from the DOM, so it necessarily contains it.
    const offenders = APP_FILES.filter(
      (file) => !file.endsWith('.spec.ts') && /yob-section-\$\{|section-\$\{/.test(code(file)),
    ).map((file) => file.replace(`${process.cwd()}/`, ''));

    expect(offenders).toEqual([]);
  });

  test('the five published styles are the five the SPA maps', () => {
    const published = REFERENCE.components.schemas['SectionStyle'] as unknown as {
      enum?: readonly string[];
    };
    expect(published.enum).toEqual(['default', 'muted', 'brand_soft', 'accent', 'dark']);

    // Every non-default style needs a surface in the stylesheet, or a merchant could
    // select a band that renders as nothing.
    const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
    for (const style of published.enum!.filter((s) => s !== 'default')) {
      expect(styles, `no surface defined for ${style}`).toContain(
        `.yob-section-${style.replace('_', '-')}`,
      );
    }
  });

  test('the content column is defined exactly once', () => {
    const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
    const definitions = styles.match(/^\s*\.yob-content-container\s*\{/gm) ?? [];

    // One definition, so the header, the footer, a page column and a block's column
    // cannot drift into three slightly different widths.
    expect(definitions).toHaveLength(1);
    expect(styles).toContain('max-w-6xl');
  });

  test('only the content domain decides a band style', () => {
    // An application page may open a band, but the surface on it must never come from a
    // merchant. Nothing outside the content domain should mention a section style at all.
    const offenders = APP_FILES.filter((file) => {
      if (file.includes('/domains/content/') || file.endsWith('.spec.ts')) {
        return false;
      }
      return /yob-section-|section_style|SectionStyle/.test(code(file));
    }).map((file) => file.replace(`${process.cwd()}/`, ''));

    expect(offenders).toEqual([]);
  });
});
