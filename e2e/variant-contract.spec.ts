import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer } from './support/auth';

const FAMILY = '/catalog/item/hi-vis-safety-vest';
const TEMPLATE_CODE = 'YOB-VEST';
const RESOLVED_SKU = 'YOB-VEST-ORG-M';

const RESOLVE_METHOD = 'yob_storefront.api.catalog.resolve_variant';
const ADD_METHOD = 'yob_storefront.api.cart.add_to_cart';

/**
 * The backend-owned contract, read from the mirror the backend publishes into this repo.
 *
 * Read rather than restated: a test that repeated the parameter names from memory would
 * pass forever after the contract changed. `docs/api-handoff/` and `reference/api/` are
 * byte-identical copies of the same package, and neither is edited here.
 */
interface OpenApiParameter {
  readonly name: string;
  readonly required?: boolean;
}
interface OpenApiDocument {
  readonly info: { readonly version: string };
  readonly paths: Record<string, Record<string, { readonly parameters?: OpenApiParameter[] }>>;
}

function contract(file: string): OpenApiDocument {
  return JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8')) as OpenApiDocument;
}

const REFERENCE = contract('reference/api/openapi.json');
const HANDOFF = contract('docs/api-handoff/openapi.json');

function option(page: Page, attribute: string, value: string) {
  return page.locator(
    `[data-testid="item-attribute-value"][data-attribute="${attribute}"][data-value="${value}"]`,
  );
}

/**
 * One RPC as Angular composed it, read from the mock's request log.
 *
 * The mock answers **inside** `HttpClient`, so nothing reaches the network and
 * `page.waitForRequest` would wait forever. The log records each call at the mock's
 * server boundary - after `YobApiClient`, the CSRF interceptor and `HttpClient`, one step
 * before the socket - which is exactly the request under test.
 */
interface MockRequestRecord {
  readonly method: string;
  readonly rpcMethod: string;
  readonly urlWithParams: string;
  readonly params: Record<string, string>;
  readonly body: unknown;
}

async function requestsTo(page: Page, rpcMethod: string): Promise<MockRequestRecord[]> {
  return page.evaluate((method) => {
    const log = (globalThis as Record<string, unknown>)['__yobMockRequests'] as
      | MockRequestRecord[]
      | undefined;
    return (log ?? []).filter((record) => record.rpcMethod === method);
  }, rpcMethod);
}

/** The single call to this method, failing loudly if there is not exactly one. */
async function onlyRequestTo(page: Page, rpcMethod: string): Promise<MockRequestRecord> {
  const found = await requestsTo(page, rpcMethod);
  expect(found).toHaveLength(1);
  return found[0] as MockRequestRecord;
}

/**
 * Angular against the published contract, in a real browser (Phase 24D-2).
 *
 * The unit suite pins the request Angular *builds*; this pins the request the browser
 * actually *sends*, and checks its shape against the OpenAPI document the backend
 * published rather than against a restatement of it.
 */
test.describe('published contract, as the browser uses it', () => {
  test('the mirrored contract is present, versioned and identical in both locations', () => {
    // Pinned on purpose, and bumped by hand. A backend release that changes the contract
    // should stop the gate until someone has reconciled Angular against it - which is
    // what Phase 25D did for 3.4.0, and what this line records.
    expect(REFERENCE.info.version).toBe('3.11.0');
    expect(HANDOFF.info.version).toBe(REFERENCE.info.version);
    expect(JSON.stringify(HANDOFF)).toBe(JSON.stringify(REFERENCE));

    // The endpoints Angular calls are all published.
    for (const method of [
      'yob_storefront.api.catalog.get_item',
      'yob_storefront.api.catalog.get_items',
      // Added in 3.4.0 and consumed since Phase 25D.
      'yob_storefront.api.catalog.get_category_filters',
      'yob_storefront.api.cms.get_menu',
      RESOLVE_METHOD,
      ADD_METHOD,
    ]) {
      expect(Object.keys(REFERENCE.paths)).toContain(`/api/method/${method}`);
    }
  });

  test('resolve_variant is published as a GET taking template, attributes and qty', () => {
    const operations = REFERENCE.paths[`/api/method/${RESOLVE_METHOD}`];

    expect(Object.keys(operations)).toEqual(['get']);
    const names = (operations['get'].parameters ?? []).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['template', 'attributes', 'qty']));

    const required = (operations['get'].parameters ?? [])
      .filter((p) => p.required)
      .map((p) => p.name)
      .sort();
    expect(required).toEqual(['attributes', 'template']);
  });

  test('the browser sends exactly the published resolver request', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });

    await option(page, 'Colour', 'Orange').click();
    await option(page, 'Size', 'Medium').click();
    await expect(page.getByTestId('item-rate')).toBeVisible();

    const request = await onlyRequestTo(page, RESOLVE_METHOD);

    expect(request.method).toBe('GET');
    expect(request.body).toBeNull();

    // Every parameter sent is one the published document declares.
    const published = (REFERENCE.paths[`/api/method/${RESOLVE_METHOD}`]['get'].parameters ?? [])
      .map((p) => p.name);
    for (const key of Object.keys(request.params)) {
      expect(published).toContain(key);
    }

    expect(request.params['template']).toBe(TEMPLATE_CODE);
    expect(request.params['qty']).toBe('1');
    expect(JSON.parse(request.params['attributes'] ?? '{}')).toEqual({
      Colour: 'Orange',
      Size: 'Medium',
    });

    // The attributes travelled percent-encoded, as the contract's example shows.
    expect(request.urlWithParams).toContain('attributes=%7B%22');

    // Nothing Angular is not entitled to decide: no SKU, no unit, no warehouse, no price.
    expect(request.urlWithParams).not.toContain(RESOLVED_SKU);
    for (const forbidden of [
      'item_code',
      'uom',
      'stock_uom',
      'conversion_factor',
      'warehouse',
      'rate',
      'price_list',
    ]) {
      expect(request.params[forbidden]).toBeUndefined();
    }
  });

  test('the browser sends exactly item_code and qty when adding the resolved variant', async ({
    page,
  }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });
    await option(page, 'Colour', 'Orange').click();
    await option(page, 'Size', 'Medium').click();
    await expect(page.getByTestId('item-rate')).toBeVisible();

    await page.getByTestId('item-quantity').fill('3');
    await page.getByTestId('item-quantity').blur();

    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('add-to-cart-success')).toBeVisible();

    const request = await onlyRequestTo(page, ADD_METHOD);
    const body = (request.body ?? {}) as Record<string, unknown>;

    expect(request.method).toBe('POST');
    expect(Object.keys(body).sort()).toEqual(['item_code', 'qty']);
    expect(body['item_code']).toBe(RESOLVED_SKU);
    expect(body['item_code']).not.toBe(TEMPLATE_CODE);
    expect(body['qty']).toBe(3);
  });

  test('the resolver is called once per complete selection, and never for a partial one', async ({
    page,
  }) => {
    await signInAsMockBuyer(page, { goTo: FAMILY });

    await option(page, 'Colour', 'Orange').click();
    await expect(page.getByTestId('item-variant-prompt')).toBeVisible();
    expect(await requestsTo(page, RESOLVE_METHOD)).toHaveLength(0);

    await option(page, 'Size', 'Medium').click();
    await expect(page.getByTestId('item-rate')).toBeVisible();
    expect(await requestsTo(page, RESOLVE_METHOD)).toHaveLength(1);

    // Re-anchoring to an incompatible colour clears Size and resolves nothing until the
    // buyer answers again - Angular never picks the replacement value for them.
    await option(page, 'Colour', 'Yellow').click();
    await expect(page.getByTestId('item-variant-prompt')).toBeVisible();
    await expect(page.getByTestId('item-rate')).toHaveCount(0);
    expect(await requestsTo(page, RESOLVE_METHOD)).toHaveLength(1);

    await option(page, 'Size', 'Large').click();
    await expect(page.getByTestId('item-rate')).toBeVisible();
    const calls = await requestsTo(page, RESOLVE_METHOD);
    expect(calls).toHaveLength(2);

    // The second call carried the new selection, not a patched copy of the first.
    expect(JSON.parse(calls[1]?.params['attributes'] ?? '{}')).toEqual({
      Colour: 'Yellow',
      Size: 'Large',
    });
  });

  test('a family card carries no money at all, as the contract requires', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/safety-equipment' });

    const family = page.getByTestId('item-card').filter({ hasText: 'Hi-Vis' });

    // API 3.3.0: every money field is null on a `select_options` card. Nothing renders a
    // zero, a "from" price, or a cheapest variant.
    await expect(family.getByTestId('item-select-options')).toBeVisible();
    await expect(family).not.toContainText('₹');
    await expect(family).not.toContainText('0.00');
    await expect(family.getByTestId('item-uom')).toHaveCount(0);
  });
});
