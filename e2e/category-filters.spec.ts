import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';

const FASTENERS = '/catalog/fasteners';

function filterValue(page: Page, filterKey: string, valueKey: string) {
  return page.locator(
    `[data-testid="filter-value"][data-filter="${filterKey}"][data-value="${valueKey}"]`,
  );
}

/** Small screens hide the panel behind a disclosure; open it if this viewport has one. */
async function openFilterPanel(page: Page): Promise<void> {
  const toggle = page.getByTestId('filters-toggle');
  if ((await toggle.count()) > 0 && (await toggle.isVisible())) {
    const panel = page.getByTestId('filter-panel');
    if (!(await panel.isVisible())) {
      await toggle.click();
    }
  }
}

/** The selection currently in the address bar, parsed. */
async function urlSelection(page: Page): Promise<Record<string, string[]> | null> {
  const raw = new URL(page.url()).searchParams.get('storefront_filters');
  return raw === null ? null : (JSON.parse(raw) as Record<string, string[]>);
}

function cardCodes(page: Page) {
  return page
    .getByTestId('item-card')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node.textContent ?? '').match(/YOB-[A-Z0-9-]+/)?.[0] ?? ''),
    );
}

/**
 * Category merchandising filters in a real browser (Phase 25D).
 *
 * The selection lives in the URL, so these tests exercise it the way a buyer does: click,
 * reload, go back, share the link. What is asserted is the state and the listing that
 * came back for it - never that Angular computed a match, which it does not do.
 */
test.describe('category filters', () => {
  test('shows the configured filters, in order, with no counts', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FASTENERS });
    await openFilterPanel(page);

    await expect(page.getByTestId('filter-label')).toHaveText(['Material', 'Finish']);
    // Steel before Stainless - the merchant's order, which alphabetising would reverse.
    const values = await page
      .locator('[data-testid="filter-value"][data-filter="material"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-value')));
    expect(values).toEqual(['steel', 'stainless']);

    await expect(page.getByTestId('filter-panel')).not.toContainText('(');
  });

  test('shows no filter UI for a category with no Filter Set', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/safety-equipment' });

    await expect(page.getByTestId('category-filters')).toHaveCount(0);
    await expect(page.getByTestId('item-card').first()).toBeVisible();
  });

  test('selects one value, narrowing the listing and updating the URL', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FASTENERS });
    await openFilterPanel(page);
    await expect(page.getByTestId('item-card')).toHaveCount(4);

    await filterValue(page, 'material', 'steel').check();

    await expect(page.getByTestId('item-card')).toHaveCount(2);
    expect(await urlSelection(page)).toEqual({ material: ['steel'] });
  });

  test('selects several values of one filter', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FASTENERS });
    await openFilterPanel(page);

    await filterValue(page, 'material', 'steel').check();
    await expect(page.getByTestId('item-card')).toHaveCount(2);
    await filterValue(page, 'material', 'stainless').check();

    // OR within one filter - the backend's rule, not ours.
    await expect(page.getByTestId('item-card')).toHaveCount(4);
    expect(await urlSelection(page)).toEqual({ material: ['stainless', 'steel'] });
  });

  test('combines different filters', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FASTENERS });
    await openFilterPanel(page);

    await filterValue(page, 'material', 'steel').check();
    await filterValue(page, 'finish', 'black').check();

    await expect(page.getByTestId('item-card')).toHaveCount(1);
    expect(await cardCodes(page)).toEqual(['YOB-NUT-M10']);
    expect(await urlSelection(page)).toEqual({ finish: ['black'], material: ['steel'] });
  });

  test('restores the selection from a cold load of the same URL', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FASTENERS });
    await openFilterPanel(page);
    await filterValue(page, 'material', 'steel').check();
    await expect(page.getByTestId('item-card')).toHaveCount(2);

    const shared = page.url();

    // A fresh document at that URL - what a reload or a pasted link produces. It is
    // reached through sign-in because the mock session lives in memory and a real reload
    // would drop it; the guarantee under test is that the URL alone carries the
    // selection, which this proves either way.
    await signInAsMockBuyer(page, { goTo: new URL(shared).pathname + new URL(shared).search });
    await openFilterPanel(page);

    await expect(filterValue(page, 'material', 'steel')).toBeChecked();
    await expect(page.getByTestId('item-card')).toHaveCount(2);
  });

  test('goes back and forward through selections', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FASTENERS });
    await openFilterPanel(page);

    await filterValue(page, 'material', 'steel').check();
    await expect(page.getByTestId('item-card')).toHaveCount(2);

    await page.goBack();
    await expect(page.getByTestId('item-card')).toHaveCount(4);
    expect(await urlSelection(page)).toBeNull();

    await page.goForward();
    await expect(page.getByTestId('item-card')).toHaveCount(2);
    expect(await urlSelection(page)).toEqual({ material: ['steel'] });
  });

  test('clears one filter and clears everything', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: FASTENERS });
    await openFilterPanel(page);

    await filterValue(page, 'material', 'steel').check();
    await filterValue(page, 'finish', 'black').check();
    await expect(page.getByTestId('item-card')).toHaveCount(1);

    await page.locator('[data-testid="filter-clear"][data-filter="material"]').click();
    expect(await urlSelection(page)).toEqual({ finish: ['black'] });

    await page.getByTestId('filters-clear-all').click();
    // The parameter is removed, not left as an empty object.
    expect(await urlSelection(page)).toBeNull();
    await expect(page.getByTestId('item-card')).toHaveCount(4);
  });

  test('loads more under an active filter, without reusing a cursor', async ({ page }) => {
    await signInAsMockBuyer(page, {
      goTo: '/catalog/bulk-fasteners?storefront_filters=' + encodeURIComponent('{"grade":["a"]}'),
    });
    await openFilterPanel(page);

    await expect(page.getByTestId('item-card')).toHaveCount(24);
    await page.getByTestId('load-more').click();
    await expect(page.getByTestId('item-card')).toHaveCount(26);

    // Changing the selection starts over. The mock rejects a cursor issued under a
    // different selection, so a reused one would surface as an error here.
    await filterValue(page, 'grade', 'b').check();
    await expect(page.getByTestId('item-card')).toHaveCount(24);
    await expect(page.getByTestId('items-error')).toHaveCount(0);
    await expect(page.getByTestId('items-filter-error')).toHaveCount(0);
  });

  test('reconciles the selection when the category changes', async ({ page }) => {
    await signInAsMockBuyer(page, {
      goTo: FASTENERS + '?storefront_filters=' + encodeURIComponent('{"material":["steel"]}'),
    });
    await expect(page.getByTestId('item-card')).toHaveCount(2);

    // `material` belongs to the previous category; the new one publishes `grade` only.
    // Opened cold with the stale selection still in the link - the shared-URL case.
    await signInAsMockBuyer(page, {
      goTo:
        '/catalog/bulk-fasteners?storefront_filters=' + encodeURIComponent('{"material":["steel"]}'),
      expectUrl: false,
    });
    await openFilterPanel(page);

    await expect(page.getByTestId('filter-label')).toHaveText(['Grade']);
    expect(await urlSelection(page)).toBeNull();
    await expect(page.getByTestId('items-filter-error')).toHaveCount(0);
  });

  test('fails safely on a malformed selection in the URL', async ({ page }) => {
    await signInAsMockBuyer(page, {
      goTo: FASTENERS + '?storefront_filters=' + encodeURIComponent('{"material":'),
      // The page corrects its own URL by dropping the unusable parameter, so the landing
      // URL is deliberately not the requested one.
      expectUrl: false,
    });

    // Arbitrary URL text never becomes a query: the buyer gets the plain listing.
    await expect(page.getByTestId('item-card')).toHaveCount(4);
    await expect(page.getByTestId('items-filter-error')).toHaveCount(0);
    expect(await urlSelection(page)).toBeNull();
  });

  test('explains a refused selection and offers to clear it, without retrying', async ({
    page,
  }) => {
    await signInWithMockFlags(page, 'mockScenario=storefront-filter-refused', {
      goTo: FASTENERS + '?storefront_filters=' + encodeURIComponent('{"material":["steel"]}'),
    });

    await expect(page.getByTestId('items-filter-error')).toContainText('no longer available');
    await expect(page.getByTestId('items-retry')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('storefront_filter_unknown');

    await page.getByTestId('items-clear-filters').click();
    expect(await urlSelection(page)).toBeNull();
  });

  test('leaves simple and variant-family cards untouched', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/catalog/safety-equipment' });

    const family = page.getByTestId('item-card').filter({ hasText: 'Hi-Vis' });
    await expect(family.getByTestId('item-select-options')).toBeVisible();
    await expect(family).not.toContainText('₹');

    const simple = page.getByTestId('item-card').filter({ hasText: 'Goggles' });
    await expect(simple.getByTestId('item-rate')).toContainText('240');
  });
});
