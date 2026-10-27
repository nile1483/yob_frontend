import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';

import { Badge, type BadgeTone } from '../../../design/badge/badge';
import { CATALOG_CURRENCY } from '../../catalog/catalog.currency';
import type {
  TargetProgressBlockDto,
  TargetProgressEntryDto,
  TargetStatus,
} from '../contracts/page.types';

/**
 * A customer's own sales targets, as the backend resolved them (Phase 30C).
 *
 * ## Display only
 *
 * Every figure on this card arrived decided: eligibility, the display window,
 * achievement, UOM conversion, slab selection, incentive, status, how much remains and
 * what the next milestone takes. Nothing here recalculates any of it, and nothing asks
 * the backend to recalculate - the widget reads values a background job produced.
 *
 * The one calculation this component performs is cosmetic: {@link barWidth} clamps a
 * bar's **width** to 100%. The percentage printed beside it stays the backend's own.
 *
 * ## 125% is 125%
 *
 * `achievement_percentage` is explicitly not capped by the contract. A bar that stops
 * drawing at 100 is a drawing limit; printing "100% achieved" because of it would be
 * the storefront contradicting the number it was handed. So the bar caps and the text
 * does not, and a test pins exactly that pair.
 *
 * ## Which figures a card shows
 *
 * `target_type` decides. An Amount target reads `currency`/`target_amount`/
 * `remaining_amount`; a Quantity target reads `uom`/`target_quantity`/
 * `achieved_quantity`/`remaining_quantity`. The currency is the payload's own, as the
 * cart does it - never a hardcoded symbol, and never the catalogue's token, because this
 * block states its own.
 *
 * ## What is deliberately absent
 *
 * The block's Show From / Show Until are configuration and never rendered: the dates on
 * the card are the **target period**, the range whose sales counted. Nothing shows
 * reward approval state, report windows or calculation errors - none of which the public
 * contract carries in the first place.
 *
 * Empty `targets` renders nothing at all: no heading, no empty state, no bordered box.
 * The band around it comes from `ContentSection` like every other block, so a block with
 * nothing to say occupies nothing.
 */
@Component({
  selector: 'app-target-progress-block',
  imports: [Badge, CurrencyPipe, DatePipe],
  template: `
    @if (targets().length > 0) {
      <section data-testid="block-target-progress" [attr.data-block-name]="block().block_name">
        <!-- One column on a phone, two from md. A target card is dense text rather than
             imagery, so three across would set the measure too narrow to read. -->
        <ul class="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="target-grid">
          @for (target of targets(); track target.customer_target) {
            <li
              class="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4"
              data-testid="target-card"
              [attr.data-target-type]="target.target_type"
              [attr.data-status]="target.status"
            >
              <header class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h3 class="text-sm font-semibold break-words text-slate-900" data-testid="target-title">
                    {{ target.title }}
                  </h3>

                  @if (target.description) {
                    <p class="mt-1 text-sm break-words text-slate-600" data-testid="target-description">
                      {{ target.description }}
                    </p>
                  }
                </div>

                <!-- Status as a word, never as colour alone: the tone decorates text that
                     already says what it means. -->
                <app-badge [tone]="statusTone(target.status)" data-testid="target-status">
                  {{ target.status }}
                </app-badge>
              </header>

              <!-- The figures, in the unit the target is measured in. -->
              <p class="text-sm text-slate-900" data-testid="target-progress-figures">
                @if (target.target_type === 'Amount') {
                  <span data-testid="target-achieved">{{
                    target.achieved_amount | currency: target.currency
                  }}</span>
                  <span aria-hidden="true"> / </span>
                  <span class="sr-only" i18n="@@target.of">of</span>
                  <span data-testid="target-goal">{{
                    target.target_amount | currency: target.currency
                  }}</span>
                } @else {
                  <span data-testid="target-achieved">{{ target.achieved_quantity }}</span>
                  <span aria-hidden="true"> / </span>
                  <span class="sr-only" i18n="@@target.of">of</span>
                  <span data-testid="target-goal">{{ target.target_quantity }}</span>
                  <span data-testid="target-uom">&ngsp;{{ target.uom }}</span>
                }
              </p>

              <!-- The bar is decoration; the figure below it is the information. The
                   role/aria pair carries the REAL percentage, so a screen reader is told
                   125 even though the fill stops at 100. -->
              <div class="flex flex-col gap-1">
                <div
                  class="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  [attr.aria-valuenow]="target.achievement_percentage"
                  [attr.aria-valuetext]="percentLabel(target.achievement_percentage)"
                  [attr.aria-label]="target.title"
                  data-testid="target-progress-bar"
                >
                  <div
                    class="h-full rounded-full transition-[width]"
                    [class]="barTone(target.status)"
                    [style.width.%]="barWidth(target.achievement_percentage)"
                    data-testid="target-progress-fill"
                  ></div>
                </div>

                <p class="text-sm font-medium text-slate-900" data-testid="target-percentage">
                  {{ percentLabel(target.achievement_percentage) }}
                </p>
              </div>

              <!-- Shown only when something is genuinely left. The backend floors these at
                   zero, so an over-achieved target simply has nothing to say here. -->
              @if (remaining(target); as left) {
                <p class="text-sm text-slate-600" data-testid="target-remaining">
                  @if (target.target_type === 'Amount') {
                    {{ left | currency: target.currency }}
                  } @else {
                    {{ left }}&ngsp;{{ target.uom }}
                  }
                  <ng-container i18n="@@target.remaining">remaining</ng-container>
                </p>
              }

              @if (incentive(target); as reward) {
                <p class="text-sm text-slate-700" data-testid="target-incentive">
                  <ng-container i18n="@@target.incentive">Current reward</ng-container>:
                  {{ reward | currency: incentiveCurrency(target) }}
                </p>
              }

              <!-- The backend already worked out what the next slab takes. Nothing here
                   reads slab configuration or compares percentages. -->
              @if (target.next_milestone; as milestone) {
                <p class="text-sm text-slate-700" data-testid="target-next-milestone">
                  @if (target.target_type === 'Amount') {
                    {{ milestone.remaining_amount | currency: target.currency }}
                  } @else {
                    {{ milestone.remaining_quantity }}&ngsp;{{ target.uom }}
                  }
                  <ng-container i18n="@@target.milestone"
                    >more to reach the {{ percentLabel(milestone.achievement_percentage, false) }}
                    reward level</ng-container
                  >
                </p>
              }

              <footer class="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-slate-500">
                <!-- The TARGET period - the range whose sales counted. Never the block's
                     own Show From / Show Until, which are configuration. -->
                @if (target.target_period_start || target.target_period_end) {
                  <!-- The TARGET period - the range whose sales counted. Angular's
                       DatePipe reads a date-only string as a local calendar day, so a
                       period never shifts by a day west of Greenwich. -->
                  <span data-testid="target-period">
                    @if (target.target_period_start) {
                      {{ target.target_period_start | date: 'mediumDate' }}
                    }
                    @if (target.target_period_start && target.target_period_end) {
                      <span aria-hidden="true">&ngsp;&ndash;&ngsp;</span>
                      <span class="sr-only" i18n="@@target.to">to</span>
                    }
                    @if (target.target_period_end) {
                      {{ target.target_period_end | date: 'mediumDate' }}
                    }
                  </span>
                }

                @if (target.last_calculated_on) {
                  <span data-testid="target-updated">
                    <ng-container i18n="@@target.updated">Updated</ng-container>
                    {{ target.last_calculated_on | date: 'mediumDate' }}
                  </span>
                }
              </footer>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class TargetProgressBlock {
  readonly block = input.required<TargetProgressBlockDto>();

  /**
   * The targets to draw, in the merchant's order.
   *
   * Read through a guard rather than straight off the payload: a malformed block that
   * somehow arrived without the array must render nothing, in keeping with how every
   * other block degrades by omission instead of taking the page down.
   */
  protected readonly targets = computed<readonly TargetProgressEntryDto[]>(() => {
    const rows = this.block().targets;
    return Array.isArray(rows) ? rows : [];
  });

  /**
   * How much of the bar to fill.
   *
   * The **only** calculation in this component, and a cosmetic one: a bar cannot draw
   * past its own track. Clamped at both ends so a stray negative cannot produce a
   * backwards fill. The number beside it is never clamped - see {@link percentLabel}.
   */
  protected barWidth(percentage: number): number {
    if (!Number.isFinite(percentage)) {
      return 0;
    }
    return Math.min(Math.max(percentage, 0), 100);
  }

  /**
   * The achievement as the buyer reads it, uncapped.
   *
   * Trailing zeros are dropped so 76.5 stays 76.5 and 100.0 reads 100 - formatting, not
   * rounding: the value is never altered, only printed without noise.
   */
  protected percentLabel(percentage: number, achieved = true): string {
    if (!Number.isFinite(percentage)) {
      return '';
    }

    const formatted = `${Number(percentage.toFixed(2))}%`;
    return achieved ? $localize`:@@target.achieved:${formatted}:percent: achieved` : formatted;
  }

  /** What is left, or `null` when the backend says nothing is. */
  protected remaining(target: TargetProgressEntryDto): number | null {
    const left =
      target.target_type === 'Amount' ? target.remaining_amount : target.remaining_quantity;

    return typeof left === 'number' && left > 0 ? left : null;
  }

  /**
   * The reward worth showing, or `null`.
   *
   * **`final_incentive`, never `eligible_incentive`.** Final is the authoritative value:
   * post-slab, post-cap, and what the customer actually receives. The two are identical
   * today and exist separately so a later settlement workflow can reduce one against the
   * other without a contract change - at which point a card reading the eligible figure
   * would start promising a reward nobody gets. Reading the right one now costs nothing
   * and means that change needs no storefront edit.
   *
   * Zero is omitted rather than printed: a row reading "Current reward: ₹0.00" is
   * clutter on a target that has not reached its first slab, and the progress above
   * already says so.
   */
  protected incentive(target: TargetProgressEntryDto): number | null {
    const value = target.final_incentive;
    return typeof value === 'number' && value > 0 ? value : null;
  }

  /**
   * The currency a reward is printed in: **the entry's own**.
   *
   * The contract carries one on every entry, both target types - a Quantity target is
   * counted in `uom` and still states a currency, because its incentive is money. So
   * this is the backend's answer, not a storefront preference.
   *
   * The `??` is malformed-payload resilience only, in keeping with how every other
   * block degrades rather than crashing: left to itself `CurrencyPipe` falls back to
   * USD, which once printed `$15,000.00` on a rupee storefront. **No valid payload and
   * no fixture reaches it** - the DTO types `currency` as required, so a fixture that
   * omitted one would not compile.
   */
  protected incentiveCurrency(target: TargetProgressEntryDto): string {
    return target.currency || this.defaultCurrency;
  }

  private readonly defaultCurrency = inject(CATALOG_CURRENCY);

  /** Status tone. Decoration on text that already says the status. */
  protected statusTone(status: TargetStatus): BadgeTone {
    return STATUS_TONES[status] ?? 'neutral';
  }

  /** The fill's tone, matching the badge so the card reads as one state. */
  protected barTone(status: TargetStatus): string {
    return BAR_TONES[status] ?? BAR_TONES['In Progress'];
  }
}

/**
 * The five published statuses, mapped to tones this project already owns.
 *
 * A fixed table rather than anything derived from the string: an unrecognised status
 * falls back to neutral instead of reaching a class name, and no sixth status is
 * invented here.
 */
const STATUS_TONES: Readonly<Record<TargetStatus, BadgeTone>> = {
  'Not Started': 'neutral',
  'In Progress': 'info',
  Achieved: 'success',
  Completed: 'success',
  // Closed rather than failed: the window passed, which is not the buyer's error.
  Expired: 'neutral',
};

const BAR_TONES: Readonly<Record<TargetStatus, string>> = {
  'Not Started': 'bg-slate-300',
  'In Progress': 'bg-blue-500',
  Achieved: 'bg-green-500',
  Completed: 'bg-green-500',
  Expired: 'bg-slate-400',
};
