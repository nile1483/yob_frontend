import type {
  CatalogItemDto,
  ItemDetailDto,
  CategoryDetailDto,
  CategoryListItemDto,
  CategoryPayloadDto,
  SubcategoryDto,
} from '../../app/domains/catalog/contracts/catalog.types';

/**
 * Catalog fixtures.
 *
 * Field names and value shapes mirror the verified contract exactly - snake_case,
 * `0`/`1` for check fields, prices as bare numbers with no currency. Realistic INR
 * figures and UOMs are taken from the examples in
 * `reference/api/live/verified-responses.json`.
 *
 * ## Images point at mock-only asset files, on purpose
 *
 * `thumbnail`, `banner` and `image` are Frappe `Attach Image` fields. The live bench
 * returns root-relative paths (`/files/…`), wire-verified in Phase 18 - but a fixture
 * cannot point at one, because those files exist only on a developer's bench and mock
 * mode has to work with the backend switched off.
 *
 * So the fixtures point at flat SVGs in `public/mock-media/`, which `angular.json`
 * includes only in the `mock` configuration. They are deterministic, need no backend,
 * and never reach a production bundle. Flat rectangles labelled with their ratio, not
 * photographs: a cropping or stretching bug is obvious at a glance in one and invisible
 * in the other.
 *
 * The set is chosen to break a naive image implementation:
 *
 * | Case | Why |
 * | --- | --- |
 * | portrait 2:3 | matches the real product photography |
 * | landscape 3:2 | the opposite extreme, in the same grid |
 * | square 1:1 | neither |
 * | very large 3000x2000 | a huge original rendered into a small card |
 * | `null` | a product with no photograph, which is normal |
 * | a path that 404s | a URL that exists in data but not on disk |
 *
 * A layout that survives all six is one where the source image genuinely cannot affect
 * the page, which is the entire Phase 18 standard.
 */

/**
 * Mock media paths.
 *
 * Root-relative paths, exactly like the real backend's `/files/…` values, rather than
 * data URIs - which keeps the fixtures faithful to the contract and is also what
 * `NgOptimizedImage` supports (it rejects Base64 sources outright).
 *
 * The files live in `public/mock-media/`, which `angular.json` includes **only** in the
 * `mock` configuration. Production and development builds never carry them, the same
 * structural guarantee `fileReplacements` gives the mock API itself.
 */
const IMAGE_PORTRAIT = '/mock-media/product-portrait.svg';
const IMAGE_LANDSCAPE = '/mock-media/product-landscape.svg';
const IMAGE_SQUARE = '/mock-media/product-square.svg';
/** Deliberately enormous, rendered into a card a few hundred pixels wide. */
const IMAGE_HUGE = '/mock-media/product-huge.svg';
const IMAGE_CATEGORY = '/mock-media/category-square.svg';
/**
 * A well-formed path that resolves to nothing.
 *
 * The broken-image case: the data says there is a picture and the network disagrees.
 * Must render the same neutral placeholder as a missing image, never the browser's
 * broken-image icon.
 */
const IMAGE_BROKEN = '/mock-media/deliberately-missing.svg';

const NULL_MEDIA = { thumbnail: null, banner: null } as const;

/** Deliberately long, to prove a name cannot widen a grid column off-screen. */
const LONG_CATEGORY_NAME = 'Industrial Fasteners, Fixings and Structural Connection Hardware';

export const MOCK_TOP_LEVEL_CATEGORIES: readonly CategoryListItemDto[] = [
  {
    name: 'Industrial Supplies',
    category_name: 'Industrial Supplies',
    slug: 'industrial-supplies',
    display_order: 1,
    meta_title: null,
    meta_description: null,
    parent_category: null,
    thumbnail: IMAGE_LANDSCAPE,
    banner: null,
  },
  {
    name: 'Fasteners',
    category_name: LONG_CATEGORY_NAME,
    slug: 'fasteners',
    display_order: 2,
    meta_title: null,
    meta_description: null,
    parent_category: null,
    thumbnail: IMAGE_PORTRAIT,
    banner: null,
  },
  {
    name: 'Safety Equipment',
    category_name: 'Safety Equipment',
    slug: 'safety-equipment',
    display_order: 3,
    meta_title: null,
    meta_description: null,
    parent_category: null,
    ...NULL_MEDIA,
  },
];

const INDUSTRIAL_SUPPLIES: CategoryDetailDto = {
  name: 'Industrial Supplies',
  category_name: 'Industrial Supplies',
  slug: 'industrial-supplies',
  meta_title: null,
  meta_description: null,
  description: 'Everything for the shop floor, available to approved B2B buyers.',
  is_group: 1,
  parent_category: null,
  ...NULL_MEDIA,
};

const INDUSTRIAL_SUPPLIES_CHILDREN: readonly SubcategoryDto[] = [
  {
    name: 'Fasteners',
    category_name: LONG_CATEGORY_NAME,
    slug: 'fasteners',
    display_order: 1,
    is_group: 0,
    thumbnail: IMAGE_CATEGORY,
  },
  {
    name: 'Abrasives',
    category_name: 'Abrasives',
    slug: 'abrasives',
    display_order: 2,
    is_group: 0,
    // The broken case, on a card: the data claims a picture, the network 404s.
    thumbnail: IMAGE_BROKEN,
  },
  {
    name: 'Bulk Fasteners',
    category_name: 'Bulk Fasteners',
    slug: 'bulk-fasteners',
    display_order: 3,
    is_group: 0,
    thumbnail: IMAGE_CATEGORY,
  },
];

/** A leaf category with a mix of discounted and undiscounted items. */
const FASTENERS: CategoryDetailDto = {
  name: 'Fasteners',
  category_name: LONG_CATEGORY_NAME,
  slug: 'fasteners',
  meta_title: null,
  meta_description: null,
  description: 'Fasteners available to approved B2B buyers.',
  is_group: 0,
  parent_category: 'Industrial Supplies',
  ...NULL_MEDIA,
};

const FASTENER_ITEMS: readonly CatalogItemDto[] = [
  {
    // Discounted, with a pricing rule label.
    name: 'YOB-BOLT-M10',
    item_name: 'Hex Bolt M10 x 50mm',
    slug: 'hex-bolt-m10-50',
    stock_uom: 'Nos',
    image: IMAGE_PORTRAIT,
    base_price: 12.5,
    rate: 11.25,
    discount_percentage: 10,
    discount_amount: 1.25,
    net_amount: 11.25,
    tax_amount: 0,
    total_amount: 11.25,
    pricing_rule_label: 'YOB Demo Bulk Discount',
  },
  {
    // Discounted, different figures.
    name: 'YOB-NUT-M10',
    item_name: 'Hex Nut M10',
    slug: 'hex-nut-m10',
    stock_uom: 'Nos',
    image: IMAGE_LANDSCAPE,
    base_price: 3.75,
    rate: 3.37,
    discount_percentage: 10,
    discount_amount: 0.38,
    net_amount: 3.37,
    tax_amount: 0,
    total_amount: 3.37,
    pricing_rule_label: 'YOB Demo Bulk Discount',
  },
  {
    // No discount, no pricing rule - rate equals base price.
    name: 'YOB-WASH-M10',
    item_name: 'Flat Washer M10',
    slug: 'flat-washer-m10',
    stock_uom: 'Nos',
    image: null,
    base_price: 1.2,
    rate: 1.2,
    discount_percentage: 0,
    discount_amount: 0,
    net_amount: 1.2,
    tax_amount: 0,
    total_amount: 1.2,
    pricing_rule_label: null,
  },
  {
    // Long name and a bulk UOM, to stress the card layout.
    name: 'YOB-ANCHOR-HD-12',
    item_name: 'Heavy Duty Through Bolt Anchor M12 x 120mm, Hot Dip Galvanised, Boxed Quantity',
    slug: 'through-bolt-anchor-m12-120',
    stock_uom: 'Box',
    image: IMAGE_HUGE,
    base_price: 480,
    rate: 432,
    discount_percentage: 10,
    discount_amount: 48,
    // The one item carrying tax, so the detail page's breakdown has something to show.
    net_amount: 432,
    tax_amount: 77.76,
    total_amount: 509.76,
    pricing_rule_label: 'YOB Demo Bulk Discount',
  },
];

/**
 * A leaf category with more items than one page holds.
 *
 * 30 rows against a page size of 24 gives a first page, a Load More, and a terminal
 * second page - the smallest set that exercises the whole pagination path. Names are
 * zero-padded so that ascending, descending and insertion order are all distinguishable
 * and deterministic, which is what lets an E2E assert a sort actually changed anything.
 */
const BULK_ITEMS: readonly CatalogItemDto[] = Array.from({ length: 30 }, (_, index) => {
  const n = String(index + 1).padStart(2, '0');
  return {
    name: `YOB-BULK-${n}`,
    item_name: `Bulk Fastener ${n}`,
    slug: `bulk-fastener-${n}`,
    stock_uom: 'Nos',
    image: null,
    base_price: 100 + index,
    rate: 100 + index,
    discount_percentage: 0,
    discount_amount: 0,
    net_amount: 100 + index,
    tax_amount: 0,
    total_amount: 100 + index,
    pricing_rule_label: null,
  };
});

const BULK: CategoryDetailDto = {
  name: 'Bulk Fasteners',
  category_name: 'Bulk Fasteners',
  slug: 'bulk-fasteners',
  meta_title: null,
  meta_description: null,
  description: 'A category large enough to need more than one page.',
  is_group: 0,
  parent_category: 'Industrial Supplies',
  ...NULL_MEDIA,
};

/** A leaf category that legitimately has nothing in it. */
const ABRASIVES: CategoryDetailDto = {
  name: 'Abrasives',
  category_name: 'Abrasives',
  slug: 'abrasives',
  meta_title: null,
  meta_description: null,
  description: null,
  is_group: 0,
  parent_category: 'Industrial Supplies',
  ...NULL_MEDIA,
};

const SAFETY: CategoryDetailDto = {
  name: 'Safety Equipment',
  category_name: 'Safety Equipment',
  slug: 'safety-equipment',
  meta_title: null,
  meta_description: null,
  description: null,
  is_group: 0,
  parent_category: null,
  ...NULL_MEDIA,
};

/** Every category the mock can serve, by slug. */
/**
 * `get_category` payloads.
 *
 * The legacy embedded `items` array is **gone**: backend Phase 22B-3 retired it, so a
 * mock still serving it would be modelling a wire that no longer exists. Item listing
 * comes from `get_items`; the per-category item fixtures below feed that handler.
 */
export const MOCK_CATEGORIES_BY_SLUG: Readonly<Record<string, CategoryPayloadDto>> = {
  'industrial-supplies': {
    category: INDUSTRIAL_SUPPLIES,
    subcategories: INDUSTRIAL_SUPPLIES_CHILDREN,
  },
  fasteners: {
    category: FASTENERS,
    subcategories: [],
  },
  'bulk-fasteners': {
    category: BULK,
    subcategories: [],
  },
  abrasives: {
    // Leaf with neither subcategories nor items.
    category: ABRASIVES,
    subcategories: [],
  },
  'safety-equipment': {
    category: SAFETY,
    subcategories: [],
  },
};

/**
 * Items per category, for the `get_items` listing endpoint.
 *
 * Separate from the category payloads since Phase 23B-2: `get_category` no longer carries
 * an item array, so keeping one inside those objects would model a wire that no longer
 * exists. This map is listing fixture data, addressed by the same slug `get_items` takes.
 */
export const MOCK_ITEMS_BY_CATEGORY: Readonly<Record<string, readonly CatalogItemDto[]>> = {
  'industrial-supplies': [],
  'fasteners': FASTENER_ITEMS,
  'bulk-fasteners': BULK_ITEMS,
  'abrasives': [],
  'safety-equipment': [],
};


/** Children of a given parent slug, for `get_categories?parent_slug=`. */
export function mockChildCategories(parentSlug: string): readonly CategoryListItemDto[] {
  const payload = MOCK_CATEGORIES_BY_SLUG[parentSlug];
  if (payload === undefined) {
    return [];
  }

  return payload.subcategories.map((child) => ({
    name: child.name,
    category_name: child.category_name,
    slug: child.slug,
    thumbnail: child.thumbnail,
    banner: null,
    display_order: child.display_order,
    meta_title: null,
    meta_description: null,
    parent_category: parentSlug,
  }));
}

/* ------------------------------------------------------------------ item detail */

/**
 * `get_item` fixtures, derived from the listing items above.
 *
 * Built from the same rows so clicking a listed item shows matching numbers - a
 * mismatch there would be a bug the mock invented rather than one worth finding.
 *
 * The detail shape is genuinely different from a listing row, and the differences are
 * reproduced faithfully: `custom_slug` not `slug`, `uom` not `stock_uom`, plus `qty`,
 * `item_group`, `tax_label`, `available_rules` and the duplicative nested `pricing`.
 */
const ITEM_GROUP = 'Fasteners';

const OFFERS_BY_SLUG: Readonly<Record<string, readonly string[]>> = {
  'hex-bolt-m10-50': ['10% off on 50 or more', 'Free delivery over 5,000'],
  'through-bolt-anchor-m12-120': ['10% off on 5 boxes or more'],
};

/**
 * Stock metadata per item, covering every case the availability UI must tell apart.
 *
 * | Slug | Case |
 * | --- | --- |
 * | hex bolt | stock item, warehouse resolved, plenty on hand |
 * | hex nut | stock item, warehouse resolved, genuinely **zero** on hand |
 * | flat washer | **non-stock** item - availability does not apply at all |
 * | anchor | stock item, **warehouse unresolved**, so quantity is unknown (`null`) |
 *
 * The last two both carry `actual_qty: null` for entirely different reasons, which is
 * exactly why the UI must branch on `is_stock_item` rather than on the number.
 */
interface MockStockMeta {
  readonly is_stock_item: number;
  readonly warehouse: string | null;
  readonly actual_qty: number | null;
}

const STOCK_BY_SLUG: Readonly<Record<string, MockStockMeta>> = {
  'hex-bolt-m10-50': { is_stock_item: 1, warehouse: 'Stores - ST', actual_qty: 25 },
  'hex-nut-m10': { is_stock_item: 1, warehouse: 'Stores - ST', actual_qty: 0 },
  'flat-washer-m10': { is_stock_item: 0, warehouse: null, actual_qty: null },
  'through-bolt-anchor-m12-120': { is_stock_item: 1, warehouse: null, actual_qty: null },
};

/** A stock item whose warehouse resolved but which nothing has been received into. */
const DEFAULT_STOCK: MockStockMeta = {
  is_stock_item: 1,
  warehouse: 'Stores - ST',
  actual_qty: 12,
};

function toItemDetail(listing: CatalogItemDto): ItemDetailDto {
  // Only the anchor item carries tax in these fixtures.
  const taxLabel = listing.tax_amount > 0 ? 'GST 18%' : null;

  return {
    name: listing.name,
    item_name: listing.item_name,
    image: listing.image,
    item_group: ITEM_GROUP,
    custom_slug: listing.slug,
    qty: 1,

    base_price: listing.base_price,
    rate: listing.rate,
    discount_percentage: listing.discount_percentage,
    discount_amount: listing.discount_amount,

    net_amount: listing.net_amount,
    tax_amount: listing.tax_amount,
    tax_label: taxLabel,
    total_amount: listing.total_amount,

    uom: listing.stock_uom,
    stock_uom: listing.stock_uom,

    ...(STOCK_BY_SLUG[listing.slug] ?? DEFAULT_STOCK),

    pricing: {
      item: {
        name: listing.name,
        item_name: listing.item_name,
        item_group: ITEM_GROUP,
        image: listing.image,
        stock_uom: listing.stock_uom,
      },
      selling_price_list: 'Standard Selling',
      qty: 1,
      base_price: listing.base_price,
      rate: listing.rate,
      discount_percentage: listing.discount_percentage,
      discount_amount: listing.discount_amount,
      total_discount: listing.discount_amount,
      net_amount: listing.net_amount,
      tax_amount: listing.tax_amount,
      tax_label: taxLabel,
      total_amount: listing.total_amount,
      pricing_rules: listing.pricing_rule_label === null ? [] : ['YOB-PRULE-0001'],
      pricing_rule_label: listing.pricing_rule_label,
      pricing_rule_apply_on: listing.pricing_rule_label === null ? null : 'Item Code',
      uom: listing.stock_uom,
    },

    pricing_rule_label: listing.pricing_rule_label,
    pricing_rule_apply_on: listing.pricing_rule_label === null ? null : 'Item Code',
    available_rules: OFFERS_BY_SLUG[listing.slug] ?? [],
  };
}

/** Every item the mock can serve in detail, keyed by its slug. */
export const MOCK_ITEM_DETAILS_BY_SLUG: Readonly<Record<string, ItemDetailDto>> =
  Object.fromEntries(FASTENER_ITEMS.map((listing) => [listing.slug, toItemDetail(listing)]));
