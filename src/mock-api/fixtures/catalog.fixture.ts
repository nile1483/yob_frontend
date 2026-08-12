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
 * ## Every image is null, on purpose
 *
 * `thumbnail`, `banner` and `image` are Frappe `Attach Image` fields, and the backend
 * currently returns the raw stored value because its `get_url()` calls are commented
 * out. Stored values are normally root-relative (`/files/…`), which the browser
 * resolves same-origin and the dev proxy already forwards - but no non-null value has
 * ever been observed from this bench, and inventing `/files/hex-bolt.png` would point
 * at a file that does not exist and render a broken image in every test.
 *
 * So the fixtures exercise the null path, which is the one the real bench produces
 * today, and the components' non-null path is covered by unit tests that pass a path
 * directly. Recorded as an open item rather than guessed.
 */

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
    ...NULL_MEDIA,
  },
  {
    name: 'Fasteners',
    category_name: LONG_CATEGORY_NAME,
    slug: 'fasteners',
    display_order: 2,
    meta_title: null,
    meta_description: null,
    parent_category: null,
    ...NULL_MEDIA,
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
    thumbnail: null,
  },
  {
    name: 'Abrasives',
    category_name: 'Abrasives',
    slug: 'abrasives',
    display_order: 2,
    is_group: 0,
    thumbnail: null,
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
    image: null,
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
    image: null,
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
    image: null,
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
export const MOCK_CATEGORIES_BY_SLUG: Readonly<Record<string, CategoryPayloadDto>> = {
  'industrial-supplies': {
    category: INDUSTRIAL_SUPPLIES,
    subcategories: INDUSTRIAL_SUPPLIES_CHILDREN,
    items: [],
  },
  fasteners: {
    category: FASTENERS,
    subcategories: [],
    items: FASTENER_ITEMS,
  },
  abrasives: {
    // Leaf with neither subcategories nor items.
    category: ABRASIVES,
    subcategories: [],
    items: [],
  },
  'safety-equipment': {
    category: SAFETY,
    subcategories: [],
    items: [],
  },
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
