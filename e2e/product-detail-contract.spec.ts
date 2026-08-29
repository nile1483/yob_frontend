import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

/**
 * The Phase 27B product-detail merchandising contract, pinned before anything renders it.
 *
 * ## Why this exists now, with no feature attached
 *
 * Phase 27B publishes the contract; Phase 27C builds the Gallery and the content
 * renderer. Between the two there is a window where Angular has agreed to a shape it
 * does not yet read, and the agreement is the thing worth protecting: the locked
 * decisions - merchandising belongs to the public entity, order is the backend's, the
 * product union is not the CMS union - are only safe while the published document keeps
 * saying so.
 *
 * So this asserts the document, not the application. Nothing here mounts a page, and
 * every test is a pure read of the two mirrors from disk. It is a tripwire for a backend
 * release that quietly changes the deal, which is exactly the drift that would otherwise
 * be discovered halfway through building against it.
 *
 * It lives in the e2e project for the reason `route-content-contract.spec.ts` gives:
 * that is where this repository already reads the mirrored contract off the filesystem,
 * and unit tests run in a browser environment with no filesystem.
 */

interface Schema {
  readonly type?: string;
  readonly nullable?: boolean;
  readonly enum?: readonly string[];
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly items?: Schema;
  readonly $ref?: string;
  readonly allOf?: readonly Schema[];
  readonly oneOf?: readonly { readonly $ref?: string }[];
  readonly discriminator?: {
    readonly propertyName: string;
    readonly mapping?: Readonly<Record<string, string>>;
  };
}

interface OpenApiDocument {
  readonly info: { readonly version: string };
  readonly paths: Record<
    string,
    Record<string, { readonly responses?: Record<string, { readonly content?: Record<string, { readonly schema?: Schema }> }> }>
  >;
  readonly components: { readonly schemas: Record<string, Schema> };
}

function contract(file: string): OpenApiDocument {
  return JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8')) as OpenApiDocument;
}

const REFERENCE = contract('reference/api/openapi.json');
const HANDOFF = contract('docs/api-handoff/openapi.json');

/** The schema a `$ref` names, resolved in the reference mirror. */
function deref(ref: string): Schema {
  const name = ref.replace('#/components/schemas/', '');
  const schema = REFERENCE.components.schemas[name];
  expect(schema, `${name} is published`).toBeDefined();
  return schema!;
}

function schema(name: string): Schema {
  return deref(`#/components/schemas/${name}`);
}

/**
 * One schema with its `$ref`s followed and its `allOf` members merged in.
 *
 * ## Why composition has to be resolved rather than read
 *
 * 3.9.1 splits the product payload into composed parts: `ProductPageDetail` is
 * `allOf: [ProductDetail, ProductMerchandising]` and declares no property of its own, and
 * `VariantFamily` composes an inline family object with the same merchandising schema.
 *
 * So a flat `schema.required` read answers `undefined` for both, and a test written that
 * way would either fail on a correct contract or - worse - pass vacuously against
 * `.required ?? []`. Composition is the whole point of the correction; a guard that
 * cannot see through it is not guarding the thing that changed.
 *
 * Returns the effective property set and required set. Deliberately shallow in one
 * respect: it does not merge `oneOf`, because a union is a choice between shapes rather
 * than a shape, and flattening one would invent a payload no branch actually sends.
 */
function resolved(subject: Schema, seen: ReadonlySet<string> = new Set()): {
  properties: Record<string, Schema>;
  required: string[];
} {
  if (subject.$ref) {
    // A cycle would otherwise recur forever. No published schema has one today; this is
    // here so that a backend that introduces one fails an assertion rather than the run.
    expect(seen.has(subject.$ref), `${subject.$ref} is not a circular reference`).toBe(false);
    return resolved(deref(subject.$ref), new Set([...seen, subject.$ref]));
  }

  const properties: Record<string, Schema> = { ...(subject.properties ?? {}) };
  const required = new Set(subject.required ?? []);

  for (const member of subject.allOf ?? []) {
    const part = resolved(member, seen);
    Object.assign(properties, part.properties);
    for (const key of part.required) {
      required.add(key);
    }
  }

  return { properties, required: [...required].sort() };
}

/** A schema's effective property names, sorted, so an assertion reads as a set. */
function fields(subject: Schema): string[] {
  return Object.keys(resolved(subject).properties).sort();
}

/** A schema's effective required set, composition included. */
function requiredOf(subject: Schema): string[] {
  return resolved(subject).required;
}

/**
 * Every schema reachable from one subtree, by `$ref`, transitively.
 *
 * Used to state reachability rather than field absence: "`resolve_variant` cannot reach
 * `ProductMerchandising`" is the claim the architecture actually makes, and it survives a
 * rename of `gallery` or an extra layer of composition that a field-name check would not.
 */
function refsWithin(subject: Schema, seen = new Set<string>()): string[] {
  for (const value of Object.values(subject)) {
    for (const node of Array.isArray(value) ? value : [value]) {
      if (typeof node !== 'object' || node === null) {
        continue;
      }

      const child = node as Schema;
      if (child.$ref !== undefined && !seen.has(child.$ref)) {
        seen.add(child.$ref);
        refsWithin(deref(child.$ref), seen);
      }

      refsWithin(child, seen);
    }
  }

  return [...seen];
}

/** The 200 response schema of one published GET, whether a `$ref` or inline. */
function okSchema(method: string): Schema {
  const path = REFERENCE.paths[`/api/method/${method}`];
  expect(path, `${method} is published`).toBeDefined();

  const body = path!['get']?.responses?.['200']?.content?.['application/json']?.schema;
  expect(body, `${method} publishes a 200 body`).toBeDefined();
  return body!.$ref ? deref(body!.$ref) : body!;
}

/** What a response wrapper puts in `message.data`. */
function payloadOf(wrapper: Schema): Schema {
  const data = wrapper.properties?.['message']?.properties?.['data'];
  expect(data, 'the envelope publishes message.data').toBeDefined();
  return data!;
}

test.describe('Phase 27B product detail merchandising contract', () => {
  test('the mirrors are 3.9.1, identical, and the README agrees', () => {
    expect(REFERENCE.info.version).toBe('3.9.1');
    expect(HANDOFF.info.version).toBe(REFERENCE.info.version);
    expect(JSON.stringify(HANDOFF)).toBe(JSON.stringify(REFERENCE));

    // The README's version table went stale at 3.4.0 while the JSON was synced correctly
    // four times over, so nobody reading it could tell which contract was in the repo.
    // Asserted against the document rather than pinned to a literal: the row is now wrong
    // only if it disagrees with the file it describes.
    const readme = readFileSync(resolve(process.cwd(), 'reference/api/README.md'), 'utf8');
    const row = /\|\s*`openapi\.json`\s*\|\s*\*\*([\d.]+)\*\*\s*\|/.exec(readme)?.[1];

    expect(row, 'the README states a version for openapi.json').toBeDefined();
    expect(row).toBe(REFERENCE.info.version);
  });

  test('merchandising is one schema, composed into the two page branches', () => {
    // The 3.9.1 correction. 3.9.0 put gallery/sections directly on `ProductDetail`, which
    // is the serializer `resolve_variant` shares - so the document promised merchandising
    // on a resolved SKU that the runtime deliberately never sends. The fix is composition:
    // one merchandising schema, added to the two PAGE payloads and to nothing else.
    const merchandising = schema('ProductMerchandising');

    expect(fields(merchandising)).toEqual(['gallery', 'sections']);
    expect(requiredOf(merchandising)).toEqual(['gallery', 'sections']);
    expect(merchandising.properties?.['gallery']?.items?.$ref).toBe(
      '#/components/schemas/ProductGalleryImage',
    );
    expect(merchandising.properties?.['sections']?.items?.$ref).toBe(
      '#/components/schemas/ProductContentSection',
    );

    // Composed, not copied. Asserted on the raw `allOf` as well as on the resolution,
    // because "requires gallery" would also pass if someone re-inlined the two fields -
    // and that is precisely the arrangement 3.9.1 exists to undo.
    expect((schema('ProductPageDetail').allOf ?? []).map((member) => member.$ref)).toEqual([
      '#/components/schemas/ProductDetail',
      '#/components/schemas/ProductMerchandising',
    ]);
    expect(
      (schema('VariantFamily').allOf ?? []).map((member) => member.$ref),
      'VariantFamily composes the shared merchandising schema',
    ).toContain('#/components/schemas/ProductMerchandising');

    // The locked decision this protects: merchandising belongs to the PUBLIC entity, and
    // a variant family is one of them. If either branch stopped carrying the keys, a
    // family page would silently lose its gallery with nothing failing.
    for (const branch of ['ProductPageDetail', 'VariantFamily']) {
      const required = requiredOf(schema(branch));
      expect(required, `${branch} requires gallery`).toContain('gallery');
      expect(required, `${branch} requires sections`).toContain('sections');
    }
  });

  test('get_item maps to the page branches, and resolve_variant to the serializer', () => {
    // get_item answers one of the two PAGE payloads, discriminated on is_template.
    const branches = (payloadOf(okSchema('yob_storefront.api.catalog.get_item')).oneOf ?? []).map(
      (member) => member.$ref,
    );
    expect(branches).toEqual([
      '#/components/schemas/ProductPageDetail',
      '#/components/schemas/VariantFamily',
    ]);

    // A resolved SKU is the bare serializer. Asserted as an exact `$ref` rather than as a
    // property check: a wrapper that pointed at `ProductPageDetail` would carry
    // merchandising however the schema behind it were shaped.
    const resolvedPayload = payloadOf(okSchema('yob_storefront.api.catalog.resolve_variant'));
    expect(resolvedPayload.$ref).toBe('#/components/schemas/ProductDetail');
    expect(resolvedPayload.$ref).not.toBe('#/components/schemas/ProductPageDetail');
    expect(resolvedPayload.allOf, 'the resolved payload composes nothing').toBeUndefined();
  });

  test('ProductGalleryImage publishes exactly four fields, and no ordering key', () => {
    const gallery = schema('ProductGalleryImage');

    expect(fields(gallery)).toEqual(['alt_text', 'caption', 'image', 'is_primary']);
    expect([...(gallery.required ?? [])].sort()).toEqual([
      'alt_text',
      'caption',
      'image',
      'is_primary',
    ]);

    // Array order IS the order. A client that found a sort key would be entitled to sort
    // by it, and would then disagree with the merchant's arrangement.
    for (const forbidden of ['sort_order', 'idx', 'name', 'parent', 'parenttype', 'doctype', 'owner', 'modified']) {
      expect(fields(gallery), `gallery row published ${forbidden}`).not.toContain(forbidden);
    }

    expect(gallery.properties?.['image']?.nullable ?? false).toBe(false);
    expect(gallery.properties?.['alt_text']?.nullable).toBe(true);
    expect(gallery.properties?.['caption']?.nullable).toBe(true);
    expect(gallery.properties?.['is_primary']?.type).toBe('boolean');

    // The rows are the gallery, whole. `image` is a sibling field on the product and is
    // never folded in as a row, so an empty gallery means "fall back", not "no picture".
    // Read off the page payload rather than the serializer: since 3.9.1 the array reaches
    // a product through `ProductMerchandising`, and `ProductDetail` has no `gallery` at all.
    const page = resolved(schema('ProductPageDetail'));
    expect(page.properties['gallery']?.type).toBe('array');
    expect(page.properties['gallery']?.items?.$ref).toBe('#/components/schemas/ProductGalleryImage');
    expect(page.properties['image'], 'the product still carries its own single image').toBeDefined();
  });

  test('ProductContentSection is a title and ordered blocks, and nothing administrative', () => {
    const section = schema('ProductContentSection');

    expect(fields(section)).toEqual(['blocks', 'title']);
    expect([...(section.required ?? [])].sort()).toEqual(['blocks', 'title']);
    expect(section.properties?.['blocks']?.items?.$ref).toBe(
      '#/components/schemas/ProductContentBlock',
    );

    // Nothing about how the section is stored or administered reaches the storefront.
    for (const forbidden of [
      'name',
      'item',
      'sort_order',
      'idx',
      'enabled',
      'is_enabled',
      'published',
      'creation',
      'modified',
      'owner',
      'doctype',
    ]) {
      expect(fields(section), `section published ${forbidden}`).not.toContain(forbidden);
    }
  });

  test('the product content union is exactly six types, discriminated on type', () => {
    const union = schema('ProductContentBlock');

    expect(union.discriminator?.propertyName).toBe('type');
    expect(Object.keys(union.discriminator?.mapping ?? {})).toEqual([
      'rich_text',
      'key_value',
      'table',
      'image',
      'download',
      'video',
    ]);

    expect((union.oneOf ?? []).map((member) => member.$ref)).toEqual([
      '#/components/schemas/ProductRichTextBlock',
      '#/components/schemas/ProductKeyValueBlock',
      '#/components/schemas/ProductTableBlock',
      '#/components/schemas/ProductImageBlock',
      '#/components/schemas/ProductDownloadBlock',
      '#/components/schemas/ProductVideoBlock',
    ]);

    // Each member pins its own discriminant as a single-value enum, which is what makes
    // the union narrowable without reading whichever optional fields happen to be set.
    for (const [type, ref] of Object.entries(union.discriminator?.mapping ?? {})) {
      expect(deref(ref).properties?.['type']?.enum).toEqual([type]);
    }
  });

  test('the six block payloads publish exactly their documented fields', () => {
    const expected: Record<string, { fields: string[]; required: string[] }> = {
      ProductRichTextBlock: { fields: ['content', 'type'], required: ['content', 'type'] },
      ProductKeyValueBlock: { fields: ['items', 'type'], required: ['items', 'type'] },
      ProductTableBlock: {
        fields: ['columns', 'rows', 'type'],
        required: ['columns', 'rows', 'type'],
      },
      ProductImageBlock: {
        fields: ['alt_text', 'caption', 'image', 'type'],
        required: ['alt_text', 'caption', 'image', 'type'],
      },
      ProductDownloadBlock: {
        fields: ['description', 'file', 'label', 'type'],
        required: ['description', 'file', 'label', 'type'],
      },
      ProductVideoBlock: { fields: ['type', 'url'], required: ['type', 'url'] },
    };

    for (const [name, shape] of Object.entries(expected)) {
      const block = schema(name);
      expect(fields(block), `${name} fields`).toEqual(shape.fields);
      expect([...(block.required ?? [])].sort(), `${name} required`).toEqual(shape.required);
    }

    // Required and nullable are different claims, and the difference decides whether a
    // renderer needs an empty branch. These four are present-but-null-able.
    expect(schema('ProductImageBlock').properties?.['alt_text']?.nullable).toBe(true);
    expect(schema('ProductImageBlock').properties?.['caption']?.nullable).toBe(true);
    expect(schema('ProductDownloadBlock').properties?.['label']?.nullable).toBe(true);
    expect(schema('ProductDownloadBlock').properties?.['description']?.nullable).toBe(true);

    // ...and these are not, so a renderer may rely on them being real strings.
    expect(schema('ProductRichTextBlock').properties?.['content']?.nullable ?? false).toBe(false);
    expect(schema('ProductImageBlock').properties?.['image']?.nullable ?? false).toBe(false);
    expect(schema('ProductDownloadBlock').properties?.['file']?.nullable ?? false).toBe(false);
    expect(schema('ProductVideoBlock').properties?.['url']?.nullable ?? false).toBe(false);

    // key_value rows and table cells, spelled out rather than assumed.
    expect(fields(schema('ProductSpecEntry'))).toEqual(['key', 'value']);
    expect([...(schema('ProductSpecEntry').required ?? [])].sort()).toEqual(['key', 'value']);
    expect(schema('ProductKeyValueBlock').properties?.['items']?.items?.$ref).toBe(
      '#/components/schemas/ProductSpecEntry',
    );

    const table = schema('ProductTableBlock');
    expect(table.properties?.['columns']?.items?.type).toBe('string');
    expect(table.properties?.['rows']?.items?.type).toBe('array');
    expect(table.properties?.['rows']?.items?.items?.type).toBe('string');
  });

  test('the product union is structurally separate from the Phase 25 CMS union', () => {
    // The decision this guards: two merchant-authored block systems that share two type
    // NAMES and nothing else. Merging them would force one renderer to serve a page
    // builder and a product page, and the shapes below are why that cannot work.
    const cms = schema('ContentBlock');
    const product = schema('ProductContentBlock');

    // Different mechanisms entirely: the CMS union is one flat schema with a type enum,
    // the product union is a oneOf with a discriminator.
    expect(cms.oneOf, 'the CMS block is still a flat schema').toBeUndefined();
    expect(product.oneOf, 'the product block is still a oneOf').toBeDefined();

    expect(cms.properties?.['type']?.enum).toEqual([
      'image_banner',
      'rich_text',
      'banner_carousel',
      'product_grid',
      'promo_grid',
    ]);

    // `rich_text` exists in both and means different things: CMS carries title/html plus
    // placement presentation, product carries only content. Reading one as the other
    // would render an empty body.
    expect(fields(cms)).toContain('html');
    expect(fields(schema('ProductRichTextBlock'))).not.toContain('html');

    // Presentation belongs to the placement in the CMS union, and does not exist at all
    // in the product union - Angular owns product-page layout outright.
    for (const presentation of ['section_style', 'content_width', 'block_name']) {
      expect(cms.required ?? [], `CMS block requires ${presentation}`).toContain(presentation);

      for (const member of product.oneOf ?? []) {
        expect(
          fields(deref(member.$ref!)),
          `${member.$ref} published ${presentation}`,
        ).not.toContain(presentation);
      }
    }
  });

  test('the resolved-variant payload carries no merchandising, at any depth', () => {
    // ## What this test used to be
    //
    // Under 3.9.0 this pinned a defect rather than asserting a truth. `ProductDetail` was
    // the one schema for both `get_item` and `resolve_variant`, and gallery/sections were
    // added straight onto it - so the document promised a resolved SKU two keys the
    // runtime never sends. The pin was written to fail the moment the backend split the
    // schema, so the correction would arrive as a deliberate reconciliation. 3.9.1 is that
    // correction, and this is the assertion the pin was standing in for.
    //
    // ## The rule
    //
    // Selecting a variant changes price, UOM, stock and the SKU. It changes nothing a
    // buyer is looking at in the gallery, because merchandising belongs to the template
    // for a whole family. That is an architectural decision on the Angular side too: the
    // Phase 27C gallery must not reset on resolution, and it cannot be tempted to if the
    // resolved payload has nothing to reset it with.
    const detail = schema('ProductDetail');

    // Resolved, not flat: if `ProductDetail` ever grew an `allOf` pulling merchandising
    // back in, a plain `.required` read would report the old, clean answer.
    for (const key of ['gallery', 'sections']) {
      expect(fields(detail), `ProductDetail declares ${key}`).not.toContain(key);
      expect(requiredOf(detail), `ProductDetail requires ${key}`).not.toContain(key);
    }

    // Nor by composition of any kind: the serializer composes nothing at all.
    expect(detail.allOf, 'ProductDetail composes nothing').toBeUndefined();

    // And the merchandising schemas are unreachable from the whole resolve_variant
    // response, wrapper included - a stricter statement than checking two field names,
    // and the one that actually holds the endpoint to the decision.
    const wrapper = okSchema('yob_storefront.api.catalog.resolve_variant');
    for (const merchandising of [
      'ProductMerchandising',
      'ProductPageDetail',
      'ProductGalleryImage',
      'ProductContentSection',
      'ProductContentBlock',
    ]) {
      expect(
        refsWithin(wrapper),
        `resolve_variant reaches ${merchandising}`,
      ).not.toContain(`#/components/schemas/${merchandising}`);
    }
  });

  test('ProductSuggestion did not grow merchandising', () => {
    // The header typeahead is navigation. A gallery or a content section in an
    // autocomplete row would be a product page loading eight times over.
    const suggestion = schema('ProductSuggestion');

    expect(fields(suggestion)).toEqual(['image', 'is_template', 'item_code', 'item_name', 'slug']);
    expect([...(suggestion.required ?? [])].sort()).toEqual([
      'image',
      'is_template',
      'item_code',
      'item_name',
      'slug',
    ]);

    for (const forbidden of ['gallery', 'sections']) {
      expect(fields(suggestion), `ProductSuggestion published ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  test('the Angular types keep the same split the contract makes', () => {
    // Phase 27C wires this contract into the application. The distinction 3.9.1 exists to
    // draw must survive that: one DTO for the resolved SKU, another for the product page,
    // and merchandising on the second only. A single convenient interface serving both -
    // which is easy to reach for, since they share 29 fields - would reintroduce in
    // Angular the exact mistake the backend just corrected.
    const types = readFileSync(
      resolve(process.cwd(), 'src/app/domains/catalog/contracts/catalog.types.ts'),
      'utf8',
    );

    // The serializer DTO, and what it must not declare.
    const detail = /export interface ItemDetailDto \{([\s\S]*?)\n\}/.exec(types)?.[1] ?? '';
    expect(detail, 'ItemDetailDto is declared').not.toBe('');
    expect(detail, 'ItemDetailDto declares a gallery').not.toContain('gallery');
    expect(detail, 'ItemDetailDto declares sections').not.toContain('sections');

    // Merchandising is its own interface, composed - mirroring ProductMerchandising.
    expect(types).toContain('export interface ProductMerchandisingDto');
    expect(types).toMatch(
      /export interface ProductPageDetailDto extends ItemDetailDto, ProductMerchandisingDto/,
    );
    expect(types).toMatch(/export interface ItemFamilyDto extends ProductMerchandisingDto/);

    // get_item answers the page payloads; the resolver's DTO is not one of them.
    expect(types).toMatch(
      /export type ItemPayloadDto = ProductPageDetailDto \| ItemFamilyDto/,
    );
  });

  test('the gallery DTO spells exactly the published fields', () => {
    const published = Object.keys(schema('ProductGalleryImage').properties ?? {}).sort();

    const types = readFileSync(
      resolve(process.cwd(), 'src/app/domains/catalog/contracts/catalog.types.ts'),
      'utf8',
    );
    const declared =
      /export interface ProductGalleryImageDto \{([\s\S]*?)\n\}/.exec(types)?.[1] ?? '';
    const fieldNames = [...declared.matchAll(/readonly (\w+):/g)].map((match) => match[1]!).sort();

    expect(fieldNames).toEqual(published);
  });

  test('the resolver method still returns the serializer DTO, not the page one', () => {
    // The one line that would undo the whole split: typing resolveVariant's response as
    // the page payload would put a gallery back on a resolved SKU.
    const api = readFileSync(
      resolve(process.cwd(), 'src/app/domains/catalog/data/catalog.api.ts'),
      'utf8',
    );

    expect(api).toMatch(/resolveVariant\([\s\S]*?\): Observable<ItemDetailDto>/);
    expect(api).not.toMatch(/resolveVariant\([\s\S]*?\): Observable<ProductPageDetailDto>/);
    expect(api).toMatch(/getItem\([^)]*\): Observable<ItemPayloadDto>/);
  });

  test('the existing product fields are unchanged, so the sync is additive', () => {
    // Every field Angular already reads on a product page, asserted as still published.
    // A rename or a removal is a breaking change wearing an additive release number.
    const detail = fields(schema('ProductDetail'));
    for (const field of [
      'name',
      'item_name',
      'image',
      'item_group',
      'custom_slug',
      'qty',
      'is_template',
      'is_purchasable',
      'variant_of',
      'selected',
      'base_price',
      'rate',
      'discount_percentage',
      'discount_amount',
      'net_amount',
      'tax_amount',
      'tax_label',
      'total_amount',
      'uom',
      'stock_uom',
      'conversion_factor',
      'stock_qty',
      'is_stock_item',
      'warehouse',
      'actual_qty',
      'pricing',
      'pricing_rule_label',
      'pricing_rule_apply_on',
      'available_rules',
    ]) {
      expect(detail, `ProductDetail dropped ${field}`).toContain(field);
    }

    // The serializer is those 29 fields and nothing else - it did not gain merchandising
    // in 3.9.0, and it did not lose anything in the 3.9.1 split either.
    expect(detail.length).toBe(29);

    // The page payload is the same 29 plus exactly the two merchandising keys. Read
    // through composition, so this is what a client of `get_item` genuinely receives.
    expect(fields(schema('ProductPageDetail'))).toEqual([...detail, 'gallery', 'sections'].sort());

    const family = fields(schema('VariantFamily'));
    for (const field of [
      'name',
      'item_name',
      'item_group',
      'image',
      'custom_slug',
      'is_template',
      'is_purchasable',
      'variant_of',
      'attributes',
      'variants',
    ]) {
      expect(family, `VariantFamily dropped ${field}`).toContain(field);
    }
    expect(family.length).toBe(10 + 2);
  });
});
