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

/** Fields every block carries, whatever its type. */
interface ContentBlockBase {
  /** The merchant's own name for this block. Diagnostic, never rendered as content. */
  readonly block_name: string;
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

/** Every block type this release renders. */
export type ContentBlockDto =
  | ImageBannerBlockDto
  | RichTextBlockDto
  | BannerCarouselBlockDto
  | ProductGridBlockDto
  | PromoGridBlockDto;

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
