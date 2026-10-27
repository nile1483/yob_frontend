import type { CatalogItemDto } from '../../catalog/contracts/catalog.types';
import type { MenuDestinationDto } from './cms.types';

/**
 * Storefront page contracts (API 3.4.0 `PageResponse` / `ContentBlock`).
 *
 * ## A union, not one wide optional shape
 *
 * The published `ContentBlock` schema lists every block's fields side by side with
 * everything nullable, and its own description says why that is a description rather than
 * a model: *"Each block carries ONLY its own type's fields - never infer the kind from
 * which nullable fields are set."* Typing it that way in Angular would invite exactly
 * that inference, and would make `block.html` readable on a product grid.
 *
 * So each block is its own interface, discriminated on `type`. A renderer that switches
 * on `type` gets the right fields and cannot reach the others.
 *
 * ## Slide and card shapes came from the backend, not from the schema
 *
 * `slides` and `cards` are `array<object>` in the OpenAPI document - untyped. The shapes
 * below are taken from the backend's own projector (`content_service._media_row`), which
 * is the canonical source when the published schema is silent. A slide and a promo card
 * are deliberately the same shape there, and are the same type here.
 */

/**
 * One slide or promo card. The backend projects both through one function.
 *
 * `destination` may be `null`, which means the same thing it means everywhere else:
 * render it, do not make it clickable.
 */
export interface ContentMediaRowDto {
  readonly desktop_image: string | null;
  readonly mobile_image: string | null;
  readonly title: string | null;
  readonly alt_text: string | null;
  readonly destination: MenuDestinationDto | null;
}

/**
 * The semantic band a block sits in (API 3.6.0 `SectionStyle`).
 *
 * **Semantic, never a class name.** The backend publishes one of five approved words
 * and defines none of what they look like - no colour, no padding, no text colour, no
 * breakpoint and no width. Angular owns that mapping entirely, in
 * `styles.css`.
 *
 * It belongs to the **placement**, not to the Block: the same reusable Block can come
 * back `muted` on a page and `dark` on a route, so nothing may key styling off
 * `block_name` or cache a style against one.
 */
export type SectionStyle = 'default' | 'muted' | 'brand_soft' | 'accent' | 'dark';

/**
 * Whether a block is held in the fixed content column or spans its section (API 3.7.0
 * `ContentWidth`).
 *
 * **Horizontal containment only.** It does not decide the section's background - that is
 * {@link SectionStyle} - nor vertical spacing, block or image height, which responsive
 * asset is chosen, or any padding value. Those stay in source-controlled CSS.
 *
 * Independent of the style: all ten combinations are valid and neither is derived from
 * the other. Valid for **all five block types**, not only banners.
 *
 * Like the style, it belongs to the **placement**: the same hero Banner can run full
 * width on one route and contained on a page.
 */
export type ContentWidth = 'contained' | 'full_width';

/** Fields every block carries, whatever its type. */
interface ContentBlockBase {
  /** The merchant's own name for this block. Diagnostic, never rendered as content. */
  readonly block_name: string;
  /**
   * Always present - rows written before the field existed project as `default` - so
   * this is read without a null check.
   */
  readonly section_style: SectionStyle;
  /**
   * Always present - rows predating the field project as `contained`, which is what
   * every placement did before it existed.
   */
  readonly content_width: ContentWidth;
}

/** A single image, optionally linking somewhere. */
export interface ImageBannerBlockDto extends ContentBlockBase {
  readonly type: 'image_banner';
  readonly desktop_image: string | null;
  readonly mobile_image: string | null;
  readonly alt_text: string | null;
  /** Bounded presentation values. Rendered as a height, never as arbitrary CSS. */
  readonly desktop_height_px: number | null;
  readonly mobile_height_px: number | null;
  readonly destination: MenuDestinationDto | null;
}

/**
 * Merchant prose.
 *
 * `html` is sanitised server-side on save. That is the first boundary, not a licence to
 * skip the second: it is still rendered through Angular's own sanitiser.
 */
export interface RichTextBlockDto extends ContentBlockBase {
  readonly type: 'rich_text';
  readonly title: string | null;
  readonly html: string;
  /** Lower-cased by the backend. Mapped to controlled classes, never used as one. */
  readonly text_alignment: 'left' | 'center';
}

export interface BannerCarouselBlockDto extends ContentBlockBase {
  readonly type: 'banner_carousel';
  readonly auto_play: boolean;
  readonly interval_ms: number | null;
  readonly desktop_height_px: number | null;
  readonly mobile_height_px: number | null;
  /** In the merchant's row order, which is the only order there is. */
  readonly slides: readonly ContentMediaRowDto[];
}

/**
 * Products the **backend** selected and priced.
 *
 * `items` are the same `ListingCard` rows the catalogue returns, produced by the same
 * service under the buyer's own pricing context. There is no second query to run: the
 * card type, category, limit and sort were applied server-side.
 *
 * `category` is `null` when the configured category became unusable, and `items` is then
 * empty - **never a fallback listing**. Substituting other products would merchandise
 * something nobody chose.
 */
export interface ProductGridBlockDto extends ContentBlockBase {
  readonly type: 'product_grid';
  readonly card_type: 'square' | 'portrait';
  readonly item_limit: number;
  readonly category: string | null;
  readonly items: readonly CatalogItemDto[];
}

/** Promotional content cards. Merchandising only - no offer or pricing semantics. */
export interface PromoGridBlockDto extends ContentBlockBase {
  readonly type: 'promo_grid';
  /** A bounded column count, mapped to a fixed set of grid classes. */
  readonly cards_per_row: number | null;
  readonly desktop_height_px: number | null;
  readonly mobile_height_px: number | null;
  readonly cards: readonly ContentMediaRowDto[];
}

/**
 * The next slab worth reaching, already worked out by the backend (API 3.13.0).
 *
 * Every figure here is the server's answer, including how much more is needed. Angular
 * does not inspect slab configuration, compare percentages or pick a slab: the backend
 * chose one and said what it takes to reach it.
 *
 * `null` on the entry when the incentive is not slab-based, or when the customer is
 * already past the highest configured slab.
 */
export interface TargetNextMilestoneDto {
  /** The achievement % that reaches the next slab. */
  readonly achievement_percentage: number;
  /** How much more is needed. Amount targets only. */
  readonly remaining_amount?: number | null;
  /** How much more is needed. Quantity targets only. */
  readonly remaining_quantity?: number | null;
  readonly incentive_amount?: number | null;
  readonly incentive_percentage?: number | null;
  /** That slab's cap; `null` means uncapped. */
  readonly max_incentive?: number | null;
}

/** What a target is measured in. Decides which half of the entry carries figures. */
export type TargetType = 'Amount' | 'Quantity';

/**
 * How a target is progressing, as the backend resolved it (API 3.13.0
 * `TargetProgressEntry`).
 *
 * ## Every number here is already decided
 *
 * Eligibility, the display window, achievement, UOM conversion, slab selection,
 * incentive and status are all the backend's. Angular renders them. The one calculation
 * the storefront may do is cosmetic - clamping a bar's **width** to 100% - and even then
 * the figure it prints beside the bar stays the real one.
 *
 * ## `achievement_percentage` is NOT capped
 *
 * 125% achievement arrives as `125`. The contract says so explicitly: a progress bar may
 * stop drawing at 100, and the value stays truthful. Printing 100 because the bar
 * stopped there would be the storefront lying about a number it was given.
 *
 * ## Which fields carry figures
 *
 * `target_type` decides. `Amount` populates `currency`, `target_amount` and
 * `remaining_amount`; `Quantity` populates `uom`, `target_quantity`,
 * `achieved_quantity` and `remaining_quantity`. `achieved_amount` is present for
 * **both**, because a percentage incentive applies to the sales value either way.
 *
 * The two `remaining_*` fields are `max(target - achieved, 0)` server-side and are
 * never negative, so an over-achieved target has `0` rather than a negative figure.
 */
export interface TargetProgressEntryDto {
  /** Identifier of this customer's calculated target. Identity for tracking only. */
  readonly customer_target: string;
  readonly target_rule: string;
  readonly title: string;
  readonly description?: string | null;

  /**
   * The first and last dates whose sales counted.
   *
   * **The target's own period, not the block's display window.** Show From / Show Until
   * decide when this card appears and are configuration the buyer never sees; a closed
   * target period is still displayed when the merchant configured it to be.
   */
  readonly target_period_start?: string | null;
  readonly target_period_end?: string | null;

  /** `Item` | `Item Group` | `Brand` | `Total Sales Order`. */
  readonly target_scope: string;
  /** The scoped Item/Item Group/Brand; `null` for Total Sales Order. */
  readonly scope_value?: string | null;

  readonly target_type: TargetType;

  /**
   * The company's base currency, present on **every** entry - both target types.
   *
   * A Quantity target is counted in {@link uom} and still carries a currency, because
   * its incentive is money: a percentage incentive applies to the achieved *amount*. So
   * every card has something to label its reward with, and the storefront never needs a
   * currency default of its own to print one.
   *
   * Derived from the Company and never chosen. Achievement is summed from
   * `Sales Order Item.base_net_amount`, which ERPNext stores in base currency, so no
   * other currency could honestly label the figures.
   */
  readonly currency: string;

  /** Quantity targets only; `achieved_quantity` is already converted into it. */
  readonly uom?: string | null;

  readonly target_amount?: number | null;
  /** Qualifying sales value. Present for BOTH target types. */
  readonly achieved_amount: number;
  readonly target_quantity?: number | null;
  readonly achieved_quantity?: number | null;

  /** **Not capped at 100.** See the note above. */
  readonly achievement_percentage: number;

  readonly remaining_amount?: number | null;
  readonly remaining_quantity?: number | null;

  /**
   * Decided by the target period and the achievement, never by the display window.
   * `Completed` is an administrative settlement state.
   */
  readonly status: TargetStatus;

  readonly incentive_type?: string | null;

  /**
   * The calculated figure before any settlement reduction.
   *
   * Equal to {@link final_incentive} today, and retained for administrative and future
   * use. **Not the value a buyer is shown** - see below.
   */
  readonly eligible_incentive: number;

  /**
   * The customer-facing reward: the authoritative post-slab, post-cap value.
   *
   * The two incentive fields are identical today and exist separately so a later
   * settlement workflow can reduce one against the other without a contract change. A
   * storefront showing {@link eligible_incentive} would, at that point, start promising
   * a reward nobody receives - so the card reads this one and only this one.
   */
  readonly final_incentive: number;
  /** The applicable slab as a label, e.g. `50% - 74.99%`. */
  readonly current_slab?: string | null;

  readonly next_milestone: TargetNextMilestoneDto | null;
  readonly last_calculated_on?: string | null;
}

/** The five statuses the contract publishes, and no others. */
export type TargetStatus = 'Not Started' | 'In Progress' | 'Achieved' | 'Expired' | 'Completed';

/**
 * A customer's own target progress, as a block.
 *
 * ## Reachable only through a block
 *
 * There is no endpoint that accepts a customer or a list of Target Rules. The customer
 * comes from the authenticated session and the rules come from what a merchant
 * configured, so a browser cannot widen what it is shown - and nothing here asks for
 * more than the block already carries.
 *
 * `targets` holds the targets this block exposes that are inside their display window
 * **and** that this customer actually has. Empty is an ordinary answer, not a failure,
 * and the row order is the merchant's.
 */
export interface TargetProgressBlockDto extends ContentBlockBase {
  readonly type: 'target_progress';
  readonly targets: readonly TargetProgressEntryDto[];
}

/** Every block type this release renders. */
export type ContentBlockDto =
  | ImageBannerBlockDto
  | RichTextBlockDto
  | BannerCarouselBlockDto
  | ProductGridBlockDto
  | PromoGridBlockDto
  | TargetProgressBlockDto;

/**
 * A block whose `type` this release does not know.
 *
 * Typed deliberately. A backend that adds a sixth block type must not take a page down:
 * the renderer skips what it cannot draw and draws everything else, so an old client
 * degrades by omission rather than by crashing.
 */
export interface UnknownBlockDto extends ContentBlockBase {
  readonly type: string;
}

/** What `blocks` actually contains once an unknown type is admitted as possible. */
export type AnyContentBlockDto = ContentBlockDto | UnknownBlockDto;

/** The `data` payload of `cms.get_page`. */
export interface StorefrontPageDto {
  readonly slug: string;
  readonly title: string;
  readonly meta_title?: string | null;
  readonly meta_description?: string | null;
  readonly blocks: readonly AnyContentBlockDto[];
}

/** The block types this release can render. */
const RENDERABLE_TYPES = new Set<ContentBlockDto['type']>([
  'image_banner',
  'rich_text',
  'banner_carousel',
  'product_grid',
  'promo_grid',
  // 3.13.0. Added here and to the union above; the dispatcher's `@switch` is the only
  // other place that learns a new type exists.
  'target_progress',
]);

/**
 * Whether this release knows how to draw this block.
 *
 * The one place the union is narrowed. Everything downstream switches on `type` with the
 * narrowing already done, so no renderer has to defend itself against a shape it was
 * never given.
 */
export function isRenderableBlock(block: AnyContentBlockDto): block is ContentBlockDto {
  return RENDERABLE_TYPES.has(block.type as ContentBlockDto['type']);
}
