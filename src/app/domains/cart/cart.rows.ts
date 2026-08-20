import type { CartLineDto, CartPricingRowDto } from './contracts/cart.types';

/**
 * A priced projection row, plus the presentation details only the intent row carries.
 *
 * ## Why a view model rather than template lookups
 *
 * `cart.pricing_rows` is the priced truth, but it is deliberately commercial: it has no
 * thumbnail, no product slug and no buyer-friendly rule wording, because none of those
 * affect what is owed. Those live on `cart.items`, the persistent intent.
 *
 * Joining them once here keeps the rule clear - **prices come from the projection, and
 * only decoration comes from the intent** - where doing it in a template would invite
 * exactly the mix-up this split exists to prevent: reading `rate` from whichever object
 * happened to be in scope.
 *
 * A promotion row for a SKU the buyer never asked for simply has no intent row, so it
 * renders without a thumbnail or a link. That is correct rather than degraded: there is
 * no product page state to link to on behalf of a gift.
 */
export interface CartRowView {
  readonly row: CartPricingRowDto;
  /** From the intent row, when one exists for this SKU. */
  readonly image: string | null;
  readonly slug: string | null;
  /** The backend's readable offer wording, when the intent row has one. */
  readonly ruleLabel: string | null;
  /**
   * Whether this row may offer mutation controls.
   *
   * True only for a `Paid` row that maps to something the buyer owns. A promotion row is
   * ERPNext output: it can vanish or change after any cart mutation, so offering Remove
   * on one would imply an ownership the buyer does not have.
   */
  readonly mutable: boolean;
}

/**
 * Join the priced projection to the intent rows.
 *
 * Matching is by `item_code`. The contract also supplies `source_line_ids`, and it is
 * typed on the row - but `cart.items` exposes no row `name` for those ids to resolve
 * against, so they cannot be used for lookup today. `item_code` is unambiguous while the
 * backend keeps one intent line per SKU, which is the behaviour this phase preserves.
 */
export function toCartRowViews(
  rows: readonly CartPricingRowDto[],
  items: readonly CartLineDto[],
): readonly CartRowView[] {
  const byCode = new Map(items.map((item) => [item.item_code, item]));

  return rows.map((row) => {
    const intent = byCode.get(row.item_code);
    const paid = row.line_role === 'Paid';

    return {
      row,
      image: intent?.image ?? null,
      slug: intent?.item_slug ?? null,
      // Only a paid row shows offer wording; a promotion row says what it is instead.
      ruleLabel: paid ? (intent?.pricing_rule_label ?? null) : null,
      mutable: paid && intent !== undefined,
    };
  });
}
