import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { TargetProgressBlock } from './parts/target-progress-block';
import {
  isRenderableBlock,
  type AnyContentBlockDto,
  type TargetProgressBlockDto,
  type TargetProgressEntryDto,
} from './contracts/page.types';

/**
 * Target progress rendering (Phase 30C).
 *
 * The rule the whole feature rests on: **every figure arrived decided.** The storefront
 * prints what the backend resolved and performs exactly one calculation of its own - the
 * width of a bar, which is drawing rather than business.
 *
 * The pair worth stating twice: an over-achieved target caps the BAR at 100% and leaves
 * the TEXT at 125%. Printing 100 because the bar stopped there would be the storefront
 * contradicting a number it was handed, and the contract says the number is not capped.
 *
 * No HTTP provider is configured anywhere here: a block whose data arrives inside the
 * page payload must not be able to fetch anything.
 */
describe('target progress block', () => {
  let fixture: ComponentFixture<TargetProgressBlock>;

  const BASE: TargetProgressEntryDto = {
    customer_target: 'CTGT-0001',
    target_rule: 'TRUL-0001',
    title: 'Quarterly sales target',
    description: null,
    target_period_start: '2026-01-01',
    target_period_end: '2026-01-25',
    target_scope: 'Total Sales Order',
    scope_value: null,
    target_type: 'Amount',
    currency: 'INR',
    uom: null,
    target_amount: 1000000,
    achieved_amount: 765000,
    target_quantity: null,
    achieved_quantity: null,
    achievement_percentage: 76.5,
    remaining_amount: 235000,
    remaining_quantity: null,
    status: 'In Progress',
    incentive_type: 'Percentage',
    eligible_incentive: 7650,
    final_incentive: 7650,
    current_slab: '75% - 99.99%',
    next_milestone: null,
    last_calculated_on: '2026-01-25',
  };

  const QUANTITY: TargetProgressEntryDto = {
    ...BASE,
    customer_target: 'CTGT-0002',
    title: 'Safety vest volume',
    target_type: 'Quantity',
    // Every entry carries one: a Quantity target's incentive is still money.
    currency: 'INR',
    uom: 'Boxes',
    target_amount: null,
    target_quantity: 500,
    achieved_quantity: 325,
    achievement_percentage: 65,
    remaining_amount: null,
    remaining_quantity: 175,
  };

  function block(targets: readonly TargetProgressEntryDto[]): TargetProgressBlockDto {
    return {
      type: 'target_progress',
      block_name: 'Your targets',
      section_style: 'default',
      content_width: 'contained',
      targets,
    };
  }

  function open(targets: readonly TargetProgressEntryDto[]): void {
    fixture = TestBed.createComponent(TargetProgressBlock);
    fixture.componentRef.setInput('block', block(targets));
    fixture.detectChanges();
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function el(testId: string): HTMLElement | null {
    return host().querySelector(`[data-testid="${testId}"]`);
  }

  function all(testId: string): HTMLElement[] {
    return Array.from(host().querySelectorAll(`[data-testid="${testId}"]`));
  }

  function text(testId: string): string {
    return (el(testId)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  // ------------------------------------------------------------------- renderer

  describe('block registration', () => {
    function row(type: string): AnyContentBlockDto {
      return {
        type,
        block_name: 'x',
        section_style: 'default',
        content_width: 'contained',
      } as AnyContentBlockDto;
    }

    it('recognises target_progress as renderable', () => {
      expect(isRenderableBlock(row('target_progress'))).toBe(true);
    });

    it('keeps the five existing block types renderable', () => {
      for (const type of [
        'image_banner',
        'rich_text',
        'banner_carousel',
        'product_grid',
        'promo_grid',
      ]) {
        expect(isRenderableBlock(row(type)), type).toBe(true);
      }
    });

    it('still skips a type this release does not know', () => {
      expect(isRenderableBlock(row('hologram'))).toBe(false);
    });
  });

  // ---------------------------------------------------------------------- empty

  describe('nothing to show', () => {
    it('renders nothing at all for an empty target list', () => {
      open([]);

      expect(el('block-target-progress')).toBeNull();
      expect(el('target-card')).toBeNull();
      // No heading, no empty state, no bordered box: an absent block occupies nothing.
      expect(host().textContent?.trim()).toBe('');
    });

    it('survives a malformed payload without a targets array', () => {
      fixture = TestBed.createComponent(TargetProgressBlock);
      fixture.componentRef.setInput('block', {
        ...block([]),
        targets: undefined,
      } as unknown as TargetProgressBlockDto);

      expect(() => fixture.detectChanges()).not.toThrow();
      expect(el('target-card')).toBeNull();
    });
  });

  // --------------------------------------------------------------------- amount

  describe('an Amount target', () => {
    it('shows achieved and target in the payload currency', () => {
      open([BASE]);

      // The block's own currency, as the cart does it - never a hardcoded symbol and
      // never the catalogue token.
      // Grouping follows the app's locale through CurrencyPipe - the assertion checks
      // the SYMBOL came from the payload's currency, not that a particular locale's
      // digit grouping was hardcoded here.
      expect(text('target-achieved')).toContain('765,000');
      expect(text('target-goal')).toContain('1,000,000');
      expect(text('target-achieved')).toContain('₹');
    });

    it('shows the backend percentage', () => {
      open([BASE]);

      expect(text('target-percentage')).toContain('76.5%');
    });

    it('shows what remains, in currency', () => {
      open([BASE]);

      expect(text('target-remaining')).toContain('235,000');
      expect(text('target-remaining')).toContain('remaining');
    });

    it('shows the title and an optional description', () => {
      open([{ ...BASE, description: 'Across all products.' }]);

      expect(text('target-title')).toBe('Quarterly sales target');
      expect(text('target-description')).toBe('Across all products.');

      open([BASE]);
      expect(el('target-description')).toBeNull();
    });
  });

  // ------------------------------------------------------------------- quantity

  describe('a Quantity target', () => {
    it('shows achieved and target with the UOM', () => {
      open([QUANTITY]);

      expect(text('target-achieved')).toBe('325');
      expect(text('target-goal')).toBe('500');
      expect(text('target-uom')).toBe('Boxes');
      // No currency symbol anywhere on a quantity card.
      expect(text('target-progress-figures')).not.toContain('₹');
    });

    it('shows what remains, in the UOM', () => {
      open([QUANTITY]);

      expect(text('target-remaining')).toContain('175');
      expect(text('target-remaining')).toContain('Boxes');
      expect(text('target-remaining')).toContain('remaining');
    });
  });

  // -------------------------------------------------------------- overachievement

  describe('over-achievement', () => {
    const OVER: TargetProgressEntryDto = {
      ...QUANTITY,
      achieved_quantity: 625,
      achievement_percentage: 125,
      remaining_quantity: 0,
      status: 'Achieved',
    };

    it('prints the real percentage, uncapped', () => {
      open([OVER]);

      expect(text('target-percentage')).toContain('125%');
      expect(text('target-percentage')).not.toContain('100%');
    });

    it('caps the bar width at 100', () => {
      open([OVER]);

      const fill = el('target-progress-fill') as HTMLElement;
      expect(fill.style.width).toBe('100%');
    });

    it('tells assistive technology the real figure, not the capped one', () => {
      open([OVER]);

      const bar = el('target-progress-bar') as HTMLElement;
      expect(bar.getAttribute('role')).toBe('progressbar');
      expect(bar.getAttribute('aria-valuenow')).toBe('125');
      expect(bar.getAttribute('aria-valuetext')).toContain('125%');
    });

    it('shows no remaining row when the backend floored it to zero', () => {
      open([OVER]);

      expect(el('target-remaining')).toBeNull();
      // And certainly no negative figure anywhere.
      expect(host().textContent).not.toContain('-125');
      expect(host().textContent).not.toContain('-');
    });

    it('draws a partial bar for a partial target', () => {
      open([BASE]);

      expect((el('target-progress-fill') as HTMLElement).style.width).toBe('76.5%');
    });

    it('draws nothing for an unstarted target', () => {
      open([{ ...BASE, achievement_percentage: 0 }]);

      expect((el('target-progress-fill') as HTMLElement).style.width).toBe('0%');
      expect(text('target-percentage')).toContain('0%');
    });
  });

  // ------------------------------------------------------------- multiple targets

  describe('multiple targets', () => {
    it('renders every one, in the backend order', () => {
      // Deliberately not alphabetical and not sorted by progress: the merchant's row
      // order is the only order there is.
      const rows = [
        { ...BASE, customer_target: 'C1', title: 'Zulu' },
        { ...QUANTITY, customer_target: 'C2', title: 'Alpha' },
        { ...BASE, customer_target: 'C3', title: 'Mike' },
      ];
      open(rows);

      expect(all('target-card')).toHaveLength(3);
      expect(all('target-title').map((n) => n.textContent?.trim())).toEqual([
        'Zulu',
        'Alpha',
        'Mike',
      ]);
    });

    it('stacks on one column and pairs from md up', () => {
      open([BASE, QUANTITY]);

      const grid = el('target-grid')?.className ?? '';
      expect(grid).toContain('grid-cols-1');
      expect(grid).toContain('md:grid-cols-2');
    });
  });

  // -------------------------------------------------------------------- statuses

  describe('status', () => {
    for (const status of [
      'Not Started',
      'In Progress',
      'Achieved',
      'Expired',
      'Completed',
    ] as const) {
      it(`renders ${status} as readable text, not colour alone`, () => {
        open([{ ...BASE, status }]);

        expect(text('target-status')).toBe(status);
        expect(el('target-card')?.getAttribute('data-status')).toBe(status);
      });
    }

    it('still draws an Expired target, because visibility is the backend decision', () => {
      // Phase 30B decides whether a closed target appears. If it arrived, it is drawn.
      open([{ ...BASE, status: 'Expired' }]);

      expect(el('target-card')).not.toBeNull();
      expect(text('target-status')).toBe('Expired');
    });

    it('invents no status of its own', () => {
      open([{ ...BASE, status: 'Reconciling' as never }]);

      // Rendered as given, with the neutral fallback tone - never remapped or hidden.
      expect(text('target-status')).toBe('Reconciling');
    });
  });

  // ------------------------------------------------------------------- incentive

  describe('incentive', () => {
    it('shows the reward in the target currency', () => {
      open([BASE]);

      expect(text('target-incentive')).toContain('7,650');
      expect(text('target-incentive')).toContain('Current reward');
    });

    it('prints a Quantity target reward in the backend currency', () => {
      // A Quantity target is counted in `uom` and still states a currency, because its
      // incentive is money. The figure comes from the payload, not from a storefront
      // default - which once printed `$15,000.00` on a rupee storefront.
      open([{ ...QUANTITY, eligible_incentive: 15000, final_incentive: 15000 }]);

      const incentive = text('target-incentive');
      expect(incentive).toContain('15,000');
      expect(incentive).toContain('₹');
      expect(incentive).not.toContain('$');
    });

    it('honours a currency the payload states, whatever it is', () => {
      // Proof the symbol is read from the entry rather than from the app's default:
      // a target in another base currency prints that one.
      open([{ ...QUANTITY, currency: 'USD', final_incentive: 15000 }]);

      expect(text('target-incentive')).toContain('$');
      expect(text('target-incentive')).not.toContain('₹');
    });

    it('shows the capped final incentive, never the larger eligible figure', () => {
      // The case that matters once a settlement workflow exists: `final_incentive` is
      // the authoritative post-slab, post-cap reward and `eligible_incentive` is the
      // pre-settlement calculation. A card reading the eligible one would promise a
      // reward nobody receives.
      open([
        {
          ...BASE,
          incentive_type: 'Slab Percentage',
          eligible_incentive: 200,
          final_incentive: 75,
          current_slab: '100% - 150%',
        },
      ]);

      const incentive = text('target-incentive');
      expect(incentive).toContain('75');
      expect(incentive).not.toContain('200');
      // And the uncapped figure appears nowhere else on the card either.
      expect(host().textContent).not.toContain('200.00');
    });

    it('omits the row when the final reward is nothing, even if eligible is not', () => {
      open([{ ...BASE, eligible_incentive: 500, final_incentive: 0 }]);

      expect(el('target-incentive')).toBeNull();
      expect(host().textContent).not.toContain('500');
    });

    it('omits the row entirely when there is nothing to show', () => {
      for (const final_incentive of [0, -1]) {
        open([{ ...BASE, eligible_incentive: 0, final_incentive }]);
        expect(el('target-incentive')).toBeNull();
      }
    });

    it('exposes no administrative incentive detail', () => {
      open([
        {
          ...BASE,
          incentive_type: 'Percentage',
          eligible_incentive: 7650,
          final_incentive: 7650,
          current_slab: '75% - 99.99%',
        },
      ]);

      const rendered = host().textContent ?? '';
      // The slab label and the incentive type are carried in the payload and
      // deliberately not shown: they are administration, not buyer information.
      expect(rendered).not.toContain('75% - 99.99%');
      expect(rendered).not.toContain('Percentage');
    });
  });

  // -------------------------------------------------------------- next milestone

  describe('next milestone', () => {
    it('states what an Amount target needs, using the backend figures', () => {
      open([
        {
          ...BASE,
          next_milestone: {
            achievement_percentage: 80,
            remaining_amount: 35000,
            remaining_quantity: null,
            incentive_amount: null,
            incentive_percentage: 1.5,
            max_incentive: null,
          },
        },
      ]);

      const milestone = text('target-next-milestone');
      expect(milestone).toContain('35,000');
      expect(milestone).toContain('80%');
      expect(milestone).toContain('reward level');
    });

    it('states what a Quantity target needs, in its UOM', () => {
      open([
        {
          ...QUANTITY,
          next_milestone: {
            achievement_percentage: 100,
            remaining_amount: null,
            remaining_quantity: 25,
            incentive_amount: 5000,
            incentive_percentage: null,
            max_incentive: null,
          },
        },
      ]);

      const milestone = text('target-next-milestone');
      expect(milestone).toContain('25');
      expect(milestone).toContain('Boxes');
      expect(milestone).toContain('100%');
    });

    it('shows nothing when there is no next milestone', () => {
      open([{ ...BASE, next_milestone: null }]);

      expect(el('target-next-milestone')).toBeNull();
    });
  });

  // ----------------------------------------------------------------------- dates

  describe('dates', () => {
    it('shows the target period as one range', () => {
      open([BASE]);

      const period = text('target-period');
      expect(period).toContain('Jan');
      expect(period).toContain('2026');
      expect(period).toContain('–');
    });

    it('renders a date from its calendar parts, not as a UTC instant', () => {
      // `new Date('2026-01-01')` is midnight UTC and prints as 31 Dec west of Greenwich.
      // A target period is a plain calendar range, so the day must not shift.
      open([{ ...BASE, target_period_start: '2026-01-01', target_period_end: '2026-01-01' }]);

      // The exact wording is the locale's; what matters is that the day did not shift
      // back to 31 Dec 2025, which is what a UTC-parsed date-only string would give.
      expect(text('target-period')).toContain('Jan 1, 2026');
      expect(text('target-period')).not.toContain('Dec');
      expect(text('target-period')).not.toContain('2025');
    });

    it('shows whichever end exists for an open-ended period', () => {
      open([{ ...BASE, target_period_end: null }]);
      expect(text('target-period')).toContain('Jan');

      open([{ ...BASE, target_period_start: null, target_period_end: null }]);
      expect(el('target-period')).toBeNull();
    });

    it('shows a subtle updated stamp when one is available', () => {
      open([BASE]);
      expect(text('target-updated')).toContain('Updated');

      open([{ ...BASE, last_calculated_on: null }]);
      expect(el('target-updated')).toBeNull();
    });

    it('shows no storefront visibility or report window dates', () => {
      // Show From / Show Until are configuration and are not even in the public
      // contract. Nothing resembling them may appear on the card.
      open([BASE]);

      const rendered = (host().textContent ?? '').toLowerCase();
      for (const phrase of ['show from', 'show until', 'report', 'visible from', 'window']) {
        expect(rendered, `the card shows ${phrase}`).not.toContain(phrase);
      }
    });
  });

  // ------------------------------------------------------------------- isolation

  describe('isolation', () => {
    it('constructs with no HTTP provider, so it can issue no request', () => {
      // The targets arrive inside the page payload. A block that fetched would fail to
      // construct here rather than quietly asking for more than the merchant configured.
      expect(() => open([BASE])).not.toThrow();
      expect(el('target-card')).not.toBeNull();
    });

    it('exposes no internal identifiers to the buyer', () => {
      open([BASE]);

      const rendered = host().textContent ?? '';
      expect(rendered).not.toContain('CTGT-0001');
      expect(rendered).not.toContain('TRUL-0001');
    });
  });
});
