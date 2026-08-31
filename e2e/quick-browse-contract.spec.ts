import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

/**
 * The Phase 28A quick-browse contract, as `/products` consumes it (API 3.12.0).
 *
 * Two claims are worth pinning against the document rather than against a restatement of
 * it, because the whole feature rests on them:
 *
 * 1. `get_items.scope_value` is **optional**. If it ever became required again, the
 *    catalogue-wide listing would start answering a validation error and the only signal
 *    would be an empty page.
 * 2. `get_browse_categories` publishes only what a chip may safely select, with no
 *    `is_group` and no synthetic `All`.
 *
 * A pure read of the mirrors from disk; nothing here mounts a page.
 */

interface Schema {
  readonly type?: string;
  readonly default?: unknown;
  readonly description?: string;
  readonly nullable?: boolean;
  readonly enum?: readonly string[];
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly items?: Schema;
  readonly $ref?: string;
}

interface Parameter {
  readonly name: string;
  readonly required?: boolean;
  readonly schema?: Schema;
}

interface OpenApiDocument {
  readonly info: { readonly version: string };
  readonly paths: Record<
    string,
    Record<
      string,
      {
        readonly parameters?: readonly Parameter[];
        readonly responses?: Record<
          string,
          { readonly content?: Record<string, { readonly schema?: Schema }> }
        >;
      }
    >
  >;
  readonly components: { readonly schemas: Record<string, Schema> };
}

function contract(file: string): OpenApiDocument {
  return JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8')) as OpenApiDocument;
}

const REFERENCE = contract('reference/api/openapi.json');
const HANDOFF = contract('docs/api-handoff/openapi.json');

function operation(method: string) {
  const path = REFERENCE.paths[`/api/method/${method}`];
  expect(path, `${method} is published`).toBeDefined();
  return path!['get']!;
}

function parameter(method: string, name: string): Parameter {
  const found = (operation(method).parameters ?? []).find((p) => p.name === name);
  expect(found, `${method} publishes ${name}`).toBeDefined();
  return found!;
}

test.describe('quick browse contract (Phase 28A)', () => {
  test('the mirrors are 3.12.0 and identical', () => {
    expect(REFERENCE.info.version).toBe('3.12.0');
    expect(HANDOFF.info.version).toBe(REFERENCE.info.version);
    expect(JSON.stringify(HANDOFF)).toBe(JSON.stringify(REFERENCE));
  });

  test('get_items browses the catalogue with scope_value omitted', () => {
    const scopeValue = parameter('yob_storefront.api.catalog.get_items', 'scope_value');

    // The whole of `/products` rests on this being optional.
    expect(scopeValue.required ?? false).toBe(false);
    expect(scopeValue.schema?.default ?? null).toBeNull();

    // `scope_type` is unaffected by browsing catalogue-wide - `all` and `collection`
    // remain reserved words that answer `unsupported_scope`, so Angular keeps sending
    // `category` either way.
    const scopeType = parameter('yob_storefront.api.catalog.get_items', 'scope_type');
    expect(scopeType.schema?.default).toBe('category');
  });

  test('the published page size is the 24 the page asks for', () => {
    const pageSize = parameter('yob_storefront.api.catalog.get_items', 'page_size');
    expect(String(pageSize.schema?.default)).toBe('24');

    // And the constant Angular sends is the same number, read from source rather than
    // restated - a drift here would silently request a different page.
    const types = readFileSync(
      resolve(process.cwd(), 'src/app/domains/catalog/contracts/catalog.types.ts'),
      'utf8',
    );
    expect(types).toContain('export const ITEM_PAGE_SIZE = 24;');
  });

  test('search is a listing parameter, shared with the category browse', () => {
    const search = parameter('yob_storefront.api.catalog.get_items', 'search');
    expect(search.required ?? false).toBe(false);
  });

  test('category filters still require a category', () => {
    // The reason `/products` hides the facet panel under All and sends no selection:
    // there is no catalogue-wide facet list, and the parameter is required here.
    const scopeValue = parameter('yob_storefront.api.catalog.get_category_filters', 'scope_value');
    expect(scopeValue.required).toBe(true);
  });

  test('get_browse_categories publishes a flat list of valid listing targets', () => {
    const op = operation('yob_storefront.api.catalog.get_browse_categories');

    // No parameters at all: it is one request for the whole chip row.
    expect(op.parameters ?? []).toEqual([]);

    const data =
      REFERENCE.components.schemas['BrowseCategoriesResponse']?.properties?.['message']
        ?.properties?.['data'];
    expect(data?.properties?.['categories']?.items?.$ref).toBe(
      '#/components/schemas/BrowseCategory',
    );
  });

  test('BrowseCategory publishes exactly the six fields the chips read', () => {
    const schema = REFERENCE.components.schemas['BrowseCategory']!;
    const fields = Object.keys(schema.properties ?? {}).sort();

    expect(fields).toEqual([
      'category_name',
      'display_order',
      'level',
      'name',
      'parent_category',
      'slug',
    ]);
    expect([...(schema.required ?? [])].sort()).toEqual(fields);

    // `parent_category` may name a category absent from the list, so it is nullable and
    // must never be treated as a guaranteed edge in a tree.
    expect(schema.properties?.['parent_category']?.nullable).toBe(true);
    expect(schema.properties?.['display_order']?.nullable).toBe(true);
  });

  test('there is no is_group field, because every row is listable by construction', () => {
    const fields = Object.keys(REFERENCE.components.schemas['BrowseCategory']!.properties ?? {});

    // A chip drawn from this cannot answer `category_not_listable`, so the storefront has
    // nothing to filter out and must not invent a reason to.
    for (const absent of ['is_group', 'disabled', 'items', 'item_count', 'price', 'thumbnail']) {
      expect(fields, `BrowseCategory published ${absent}`).not.toContain(absent);
    }
  });

  test('the Angular destination union is exactly the published enum (Phase 28D)', () => {
    // Two copies of one list: the contract publishes the destination types, and Angular
    // restates them as a union so a fixture cannot spell one that does not exist. This is
    // what keeps them equal - including `all_products`, added in 3.11.0.
    const published = [
      ...(REFERENCE.components.schemas['Destination']!.properties?.['type']?.enum ?? []),
    ].sort();
    expect(published).toContain('all_products');

    const types = readFileSync(
      resolve(process.cwd(), 'src/app/domains/content/contracts/cms.types.ts'),
      'utf8',
    );
    const declared = /export type MenuDestinationType =([\s\S]*?);/.exec(types)?.[1] ?? '';
    const values = [...declared.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!).sort();

    expect(values).toEqual(published);
  });

  test('all_products is a fixed route the merchant cannot retarget', () => {
    const destination = REFERENCE.components.schemas['Destination']!;

    // The contract's own words. `href` is backend-owned and always exactly `/products`,
    // and `target` is null - so there is no merchant input to validate and nothing for
    // the client to build. That is why the existing renderer needed no new branch.
    expect(destination.properties?.['type']?.description ?? '').toContain('all_products');
    expect(destination.properties?.['href']?.description ?? '').toContain('/products');

    // And it is additive: every type Angular already handled is still published.
    const published = destination.properties?.['type']?.enum ?? [];
    for (const existing of [
      'home',
      'catalog',
      'storefront_category',
      'storefront_page',
      'product',
      'external_url',
    ]) {
      expect(published, `the contract dropped ${existing}`).toContain(existing);
    }
  });

  test('the Angular DTO spells the same six fields, and no others', () => {
    const published = Object.keys(
      REFERENCE.components.schemas['BrowseCategory']!.properties ?? {},
    ).sort();

    const types = readFileSync(
      resolve(process.cwd(), 'src/app/domains/catalog/contracts/catalog.types.ts'),
      'utf8',
    );
    const declared = /export interface BrowseCategoryDto \{([\s\S]*?)\n\}/.exec(types)?.[1] ?? '';
    const fields = [...declared.matchAll(/readonly (\w+):/g)].map((m) => m[1]!).sort();

    expect(fields).toEqual(published);
  });
});
