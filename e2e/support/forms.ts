import { expect, type Page } from '@playwright/test';

/**
 * Pick an option from an `app-search-select`.
 *
 * The country and state controls are comboboxes, not text inputs: `fill()` cannot drive
 * them, and a test that tried would be asserting against a control that no longer
 * exists. This opens the panel, filters, and commits by clicking the option.
 */
export async function selectSearchOption(page: Page, testId: string, label: string): Promise<void> {
  await page.getByTestId(testId).click();
  await page.getByTestId(`${testId}-search`).fill(label);
  // Matched on the label span, not the accessible name: the name also carries the hint
  // ("Kenya KE", "Gujarat 24"), and a substring match would hit "British Indian Ocean
  // Territory" when asked for "India".
  await page
    .getByTestId(`${testId}-listbox`)
    .getByRole('option')
    .filter({ has: page.locator(`span:text-is(${JSON.stringify(label)})`) })
    .first()
    .click();
  await expect(page.getByTestId(testId)).toContainText(label);
}
