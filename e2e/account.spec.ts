import { expect, test, type Page } from '@playwright/test';

import { signInAsMockBuyer, signInWithMockFlags } from './support/auth';
import { selectSearchOption } from './support/forms';
import { expectNoHorizontalOverflow, expectShellUsable } from './support/layout';

/**
 * Account address and contact management in a real browser, at every viewport.
 *
 * Mock-backed and deterministic. The development bench is never used here: these tests
 * create, edit and delete records, and the rule for this phase is that no real customer
 * data is mutated to prove a frontend behaviour.
 *
 * The destructive cases are worth stating plainly, because they are the ones a buyer
 * cannot undo. A delete is confirmed before it is sent, sent exactly once, and never
 * re-sent - so the assertions below care as much about what does *not* happen as what
 * does.
 */

const accountLink = (page: Page) =>
  page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Account' });

test.describe('reaching the account page', () => {
  test('login to account', async ({ page }) => {
    await signInAsMockBuyer(page);

    await accountLink(page).click();

    await expect(page).toHaveURL('/account');
    await expect(page.getByTestId('address-item')).toHaveCount(2);
    await expect(page.getByTestId('contact-item')).toHaveCount(2);
  });

  test('is not reachable without a session', async ({ page }) => {
    await page.goto('/account');

    await expect(page).toHaveURL(/login/);
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });

  test('renders inside the secure shell without overflowing', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/account' });

    await expect(page.getByTestId('secure-shell')).toBeVisible();
    await expectShellUsable(page);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('addresses', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/account' });
  });

  test('adds an address', async ({ page }) => {
    await page.getByTestId('account-add-address').click();

    await page.getByTestId('address-title').fill('Warehouse');
    await page.getByTestId('address-line1').fill('12 Dock Road');
    await page.getByTestId('address-city').fill('Kochi');
    // Country is not typed: a new address already starts on India.
    await expect(page.getByTestId('address-country')).toContainText('India');
    await page.getByTestId('address-form-submit').click();

    await expect(page.getByTestId('address-item')).toHaveCount(3);
    await expect(page.getByTestId('address-item-title').last()).toContainText('Warehouse');
    await expect(page.getByTestId('address-form')).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });

  test('opens the edit form already filled in', async ({ page }) => {
    await page.getByTestId('address-edit').first().click();

    // The stored values are in the inputs - an edit form that opened blank would be an
    // invitation to wipe the record by saving it.
    await expect(page.getByTestId('address-form')).toBeVisible();
    await expect(page.getByTestId('address-line1')).not.toHaveValue('');
    await expect(page.getByTestId('address-city')).not.toHaveValue('');
  });

  test('edits one field and leaves the rest alone', async ({ page }) => {
    await page.getByTestId('address-edit').first().click();
    const line1 = await page.getByTestId('address-line1').inputValue();

    await page.getByTestId('address-city').fill('Pune');
    await page.getByTestId('address-form-submit').click();

    await expect(page.getByTestId('address-form')).toBeHidden();
    await expect(page.getByTestId('address-item').first()).toContainText('Pune');
    // The untouched line survived: the request carried the change, not the whole form.
    await expect(page.getByTestId('address-item').first()).toContainText(line1);
  });

  test('cancelling an edit changes nothing', async ({ page }) => {
    const before = await page.getByTestId('address-item').first().textContent();

    await page.getByTestId('address-edit').first().click();
    await page.getByTestId('address-city').fill('Nowhere');
    await page.getByTestId('address-form-cancel').click();

    await expect(page.getByTestId('address-form')).toBeHidden();
    await expect(page.getByTestId('address-item').first()).toHaveText(before ?? '');
  });

  test('a new address starts on India and offers its states', async ({ page }) => {
    await page.getByTestId('account-add-address').click();

    await expect(page.getByTestId('address-country')).toContainText('India');

    await page.getByTestId('address-state').click();
    await page.getByTestId('address-state-search').fill('guj');
    await expect(page.getByTestId('address-state-listbox').getByRole('option')).toHaveCount(1);
    await page.getByTestId('address-state-listbox').getByRole('option').click();

    await expect(page.getByTestId('address-state')).toContainText('Gujarat');
    await expectNoHorizontalOverflow(page);
  });

  test('the state picker is usable from the keyboard', async ({ page }) => {
    await page.getByTestId('account-add-address').click();

    await page.getByTestId('address-state').focus();
    await page.keyboard.press('Enter');
    // Focus moves into the search box so typing filters immediately.
    await expect(page.getByTestId('address-state-search')).toBeFocused();

    await page.keyboard.type('ker');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('address-state')).toContainText('Kerala');
    await expect(page.getByTestId('address-state-listbox')).toBeHidden();
  });

  test('changing country away from India drops the Indian state', async ({ page }) => {
    await page.getByTestId('address-edit').first().click();
    await expect(page.getByTestId('address-state')).toContainText('Gujarat');

    await selectSearchOption(page, 'address-country', 'Kenya');

    // The state control becomes free text for a country with no bundled subdivisions,
    // and the Indian value does not come with it.
    await expect(page.getByTestId('address-state')).toHaveValue('');
  });

  test('deletes an address, but only after confirming', async ({ page }) => {
    await expect(page.getByTestId('address-item')).toHaveCount(2);

    await page.getByTestId('address-delete').first().click();

    // Nothing is gone yet - the row is still there, now asking.
    await expect(page.getByTestId('address-confirm')).toBeVisible();
    await expect(page.getByTestId('address-item')).toHaveCount(2);

    await page.getByTestId('address-confirm-confirm').click();

    await expect(page.getByTestId('address-item')).toHaveCount(1);
    await expect(page.getByTestId('account-notice')).toContainText('deleted');
  });

  test('keeping it cancels the delete', async ({ page }) => {
    await page.getByTestId('address-delete').first().click();
    await page.getByTestId('address-confirm-cancel').click();

    await expect(page.getByTestId('address-confirm')).toBeHidden();
    await expect(page.getByTestId('address-item')).toHaveCount(2);
    await expect(page.getByTestId('address-edit').first()).toBeVisible();
  });

  test('will not submit an incomplete address', async ({ page }) => {
    await page.getByTestId('account-add-address').click();
    await page.getByTestId('address-title').fill('Incomplete');
    await page.getByTestId('address-form-submit').click();

    // Still open, still nothing added.
    await expect(page.getByTestId('address-form')).toBeVisible();
    await expect(page.getByTestId('address-item')).toHaveCount(2);
  });
});

test.describe('contacts', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/account' });
  });

  test('adds a contact', async ({ page }) => {
    await page.getByTestId('account-add-contact').click();

    await page.getByTestId('contact-first-name').fill('Asha');
    await page.getByTestId('contact-last-name').fill('Rao');
    await page.getByTestId('contact-email').fill('asha@example.invalid');
    await page.getByTestId('contact-phone').fill('9000000000');
    await page.getByTestId('contact-form-submit').click();

    await expect(page.getByTestId('contact-item')).toHaveCount(3);
    await expect(page.getByTestId('contact-item-name').last()).toContainText('Asha Rao');
  });

  test('edits a contact partially', async ({ page }) => {
    await page.getByTestId('contact-edit').first().click();
    const email = await page.getByTestId('contact-email').inputValue();

    await page.getByTestId('contact-phone').fill('9111111111');
    await page.getByTestId('contact-form-submit').click();

    await expect(page.getByTestId('contact-form')).toBeHidden();
    await expect(page.getByTestId('contact-item').first()).toContainText('9111111111');
    await expect(page.getByTestId('contact-item').first()).toContainText(email);
  });

  test('deletes a contact after confirming', async ({ page }) => {
    await page.getByTestId('contact-delete').first().click();
    await page.getByTestId('contact-confirm-confirm').click();

    await expect(page.getByTestId('contact-item')).toHaveCount(1);
    await expect(page.getByTestId('account-notice')).toContainText('deleted');
  });
});

test.describe('records that are in use', () => {
  test.beforeEach(async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=account-record-in-use', { goTo: '/account' });
  });

  test('says an address is in use and keeps it', async ({ page }) => {
    await page.getByTestId('address-delete').first().click();
    await page.getByTestId('address-confirm-confirm').click();

    await expect(page.getByTestId('account-notice')).toContainText('used by an existing order');
    // The record survives, and nothing invites another attempt at something that can
    // never succeed.
    await expect(page.getByTestId('address-item')).toHaveCount(2);
    await expect(page.getByTestId('account-notice')).not.toContainText('try again');
    await expect(page.locator('body')).not.toContainText('address_in_use');
  });

  test('says a contact is in use and keeps it', async ({ page }) => {
    await page.getByTestId('contact-delete').first().click();
    await page.getByTestId('contact-confirm-confirm').click();

    await expect(page.getByTestId('account-notice')).toContainText('used by an existing order');
    await expect(page.getByTestId('contact-item')).toHaveCount(2);
    await expect(page.locator('body')).not.toContainText('contact_in_use');
  });

  test('the session survives a refused delete', async ({ page }) => {
    await page.getByTestId('address-delete').first().click();
    await page.getByTestId('address-confirm-confirm').click();
    await expect(page.getByTestId('account-notice')).toBeVisible();

    // A business refusal is not a lost login.
    await expect(page).toHaveURL('/account');
    await expect(page.getByRole('banner')).toContainText('Mock Buyer');
  });
});

test.describe('when the lists are empty or unavailable', () => {
  test('offers a way forward with nothing saved', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=empty', { goTo: '/account' });

    await expect(page.getByTestId('addresses-empty')).toBeVisible();
    await expect(page.getByTestId('contacts-empty')).toBeVisible();
    // The empty state is not a dead end.
    await expect(page.getByTestId('account-add-address')).toBeVisible();
    await expect(page.getByTestId('account-add-contact')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('explains a failed load without leaking the server error', async ({ page }) => {
    await signInWithMockFlags(page, 'mockScenario=server-error', { goTo: '/account' });

    await expect(page.getByTestId('addresses-error')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Traceback');
    await expect(page.locator('body')).not.toContainText('frappe.');
    await expectShellUsable(page);
  });
});

test.describe('keyboard', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/account' });
  });

  test('reaches and cancels a delete confirmation', async ({ page }) => {
    await page.getByTestId('address-delete').first().focus();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('address-confirm')).toBeVisible();

    // The confirmation replaced the button that was focused, so it has to take focus or
    // the buyer is dropped to the top of the page mid-action. It lands on Cancel, so
    // the reflexive Enter keeps the record.
    await expect(page.getByTestId('address-confirm-cancel')).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('address-confirm')).toBeHidden();
    await expect(page.getByTestId('address-item')).toHaveCount(2);

    // And focus comes back to where it started, rather than to `<body>`.
    await expect(page.getByTestId('address-delete').first()).toBeFocused();
  });

  test('confirming from the keyboard needs a deliberate move to Delete', async ({ page }) => {
    await page.getByTestId('address-delete').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('address-confirm-cancel')).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('address-confirm-confirm')).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('address-item')).toHaveCount(1);
  });

  test('completes an edit without a mouse', async ({ page }) => {
    await page.getByTestId('address-edit').first().focus();
    await page.keyboard.press('Enter');

    await page.getByTestId('address-city').focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Surat');
    await page.getByTestId('address-form-submit').focus();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('address-form')).toBeHidden();
    await expect(page.getByTestId('address-item').first()).toContainText('Surat');
  });

  test('every action keeps a visible focus ring', async ({ page }) => {
    // Tabbed to, not `.focus()`-ed: the ring is `:focus-visible`, which deliberately
    // does not match a button focused programmatically. Driving the keyboard is the
    // only way to assert what a keyboard user actually sees.
    for (const id of ['account-add-address', 'address-edit', 'address-delete']) {
      const target = page.getByTestId(id).first();

      await target.evaluate((el) => (el as HTMLElement).blur());
      await page.evaluate((testId) => {
        const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
        el?.previousElementSibling instanceof HTMLElement
          ? el.previousElementSibling.focus()
          : document.body.focus();
      }, id);
      await target.press('Tab');
      await target.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(target).toBeFocused();

      const outlined = await target.evaluate((el) => {
        const style = getComputedStyle(el);
        return (
          (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== 'none'
        );
      });
      expect(outlined, `${id} has no visible focus indicator`).toBe(true);
    }
  });
});

test.describe('layout', () => {
  test('an open form fits the viewport', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/account' });

    await page.getByTestId('account-add-address').click();
    await expect(page.getByTestId('address-form')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByTestId('address-form-cancel').click();
    await page.getByTestId('address-delete').first().click();
    await expect(page.getByTestId('address-confirm')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('a long address wraps instead of widening the page', async ({ page }) => {
    await signInAsMockBuyer(page, { goTo: '/account' });

    await page.getByTestId('account-add-address').click();
    await page.getByTestId('address-title').fill('Averyveryverylongunbrokenaddresstitlewithnospacesatallxxxxxxxxxxxx');
    await page.getByTestId('address-line1').fill('Unit-9876543210-Buildingnamewithoutanyspaces-Industrialestate');
    await page.getByTestId('address-city').fill('Ahmedabad');
    await page.getByTestId('address-form-submit').click();

    await expect(page.getByTestId('address-item')).toHaveCount(3);
    await expectNoHorizontalOverflow(page);
  });
});
