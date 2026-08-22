import type {
  CategoryFiltersDto,
  CatalogItemDto,
  ItemDetailDto,
  ItemFamilyDto,
  ItemPricingDto,
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
export const IMAGE_PORTRAIT = '/mock-media/product-portrait.svg';
export const IMAGE_LANDSCAPE = '/mock-media/product-landscape.svg';
export const IMAGE_SQUARE = '/mock-media/product-square.svg';
/** Deliberately enormous, rendered into a card a few hundred pixels wide. */
export const IMAGE_HUGE = '/mock-media/product-huge.svg';
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

/**
 * What a listing row says when it is one ordinary salable item.
 *
 * Backend Phase 24B added both fields to every row: `has_variants` says whether the row
 * stands for a family, and `price_state` says whether the money on it means anything.
 */
const PRICED_SIMPLE = { has_variants: 0, price_state: 'priced' } as const;

const FASTENER_ITEMS: readonly CatalogItemDto[] = [
  {
    // Discounted, with a pricing rule label.
    //
    // Also the one item whose **selling UOM differs from its stock UOM**: ERPNext sells
    // it by the Box and stocks it in Nos, 25 to a Box. That split is what proves the
    // storefront labels a price with `uom` and a stock figure with `stock_uom`, and that
    // nothing multiplies either by `conversion_factor` on the way to the screen. The
    // prices are deliberately unchanged, so every existing pricing assertion still means
    // what it did.
    name: 'YOB-BOLT-M10',
    item_name: 'Hex Bolt M10 x 50mm',
    slug: 'hex-bolt-m10-50',
    ...PRICED_SIMPLE,
    uom: 'Box',
    conversion_factor: 25,
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
    ...PRICED_SIMPLE,
    uom: 'Nos',
    conversion_factor: 1,
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
    ...PRICED_SIMPLE,
    uom: 'Nos',
    conversion_factor: 1,
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
    ...PRICED_SIMPLE,
    uom: 'Box',
    conversion_factor: 1,
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
    ...PRICED_SIMPLE,
    uom: 'Nos',
    conversion_factor: 1,
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


/* ------------------------------------------------------- merchandising filters */

/**
 * The Filter projection each category publishes, and the tags its products carry.
 *
 * Two separate things on purpose, exactly as the backend has them:
 *
 * - `MOCK_FILTERS_BY_CATEGORY` is what `get_category_filters` returns - the **category's
 *   own** Filter Set, in the merchant's order, with no counts. A category absent from the
 *   map has no Filter Set and answers `{filters: []}`.
 * - `MOCK_ITEM_FILTER_TAGS` is what each product is tagged with, which only the "server"
 *   sees. The storefront never receives it and never matches on it; it exists so the mock
 *   can answer a filtered listing the way a real backend would.
 *
 * Deliberately **not** derived from ERPNext Item Group, and deliberately not the
 * admin-side Item Filter Set: neither is part of the storefront contract.
 */
export const MOCK_FILTERS_BY_CATEGORY: Readonly<Record<string, CategoryFiltersDto>> = {
  fasteners: {
    filters: [
      {
        key: 'material',
        label: 'Material',
        // Merchant order, not alphabetical: Steel before Stainless.
        values: [
          { key: 'steel', label: 'Steel' },
          { key: 'stainless', label: 'Stainless' },
        ],
      },
      {
        key: 'finish',
        label: 'Finish',
        values: [
          { key: 'zinc', label: 'Zinc' },
          { key: 'black', label: 'Black' },
        ],
      },
    ],
  },
  'bulk-fasteners': {
    filters: [
      {
        key: 'grade',
        label: 'Grade',
        values: [
          { key: 'a', label: 'Grade A' },
          { key: 'b', label: 'Grade B' },
        ],
      },
    ],
  },
  // `safety-equipment` is absent on purpose: a category with no Filter Set, which must
  // render no facet UI at all.
};

/** item code -> filter key -> value key. Server-side only. */
export const MOCK_ITEM_FILTER_TAGS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'YOB-BOLT-M10': { material: 'steel', finish: 'zinc' },
  'YOB-NUT-M10': { material: 'steel', finish: 'black' },
  'YOB-WASH-M10': { material: 'stainless', finish: 'zinc' },
  'YOB-ANCHOR-HD-12': { material: 'stainless', finish: 'black' },
  // 26 of the 30 bulk rows are Grade A, so a filtered listing still spans two pages at a
  // page size of 24 - which is what makes Load More testable *under* a filter.
  ...Object.fromEntries(
    Array.from({ length: 30 }, (_, index) => [
      `YOB-BULK-${String(index + 1).padStart(2, '0')}`,
      { grade: index < 26 ? 'a' : 'b' },
    ]),
  ),
};

/** The filters a category publishes, or none. */
export function mockCategoryFilters(slug: string): CategoryFiltersDto {
  return MOCK_FILTERS_BY_CATEGORY[slug] ?? { filters: [] };
}

/**
 * Whether one product satisfies a selection.
 *
 * The backend's documented semantics, reproduced only as far as the frontend needs to be
 * proven: values inside one filter are **OR**-ed, and different filters are **AND**-ed.
 * An item tagged with nothing for a selected filter cannot match it.
 */
export function mockItemMatchesFilters(
  itemCode: string,
  selection: Readonly<Record<string, readonly string[]>>,
): boolean {
  const tags = MOCK_ITEM_FILTER_TAGS[itemCode] ?? {};

  return Object.entries(selection).every(([filterKey, values]) => {
    const tag = tags[filterKey];
    return tag !== undefined && values.includes(tag);
  });
}

/* --------------------------------------------------------------- variant family */

/**
 * A variant family, and the two variants that actually exist under it.
 *
 * ## The matrix is deliberately incomplete
 *
 * Four attribute values are offered - Orange, Yellow, Medium, Large - and only **two**
 * combinations were ever created. `Orange/Large` and `Yellow/Medium` do not exist and
 * must never become selectable, which is the single most important thing a variant UI
 * can get wrong: offering the cross-product of the attribute lists.
 *
 * The two variants differ in more than colour, on purpose:
 *
 * | Variant | Sold in | Stocked in | Image |
 * | --- | --- | --- | --- |
 * | Orange / Medium | Box of 25 | Nos, 125 on hand | its own |
 * | Yellow / Large | Nos | Nos, 40 on hand | **none** - the family's is kept |
 *
 * So a resolved variant proves the selling UOM, the stock UOM and the image all come
 * from the resolver, and switching between them proves a quantity cannot carry across
 * two different selling units.
 */
export const MOCK_FAMILY_SLUG = 'hi-vis-safety-vest';
const FAMILY_CODE = 'YOB-VEST';

/** The quantity `resolve_variant` prices at when the caller sends the default. */
const VARIANT_QTY = 1;

/**
 * The duplicative nested `pricing` block, as the contract carries it.
 *
 * Present because the wire has it; the UI reads the top-level fields, so the figures
 * here are the same ones rather than a second set to drift from.
 */
function variantPricing(code: string, name: string, rate: number, uom: string): ItemPricingDto {
  return {
    item: { name: code, item_name: name, item_group: 'Safety Equipment', image: null, stock_uom: 'Nos' },
    selling_price_list: 'Standard Selling',
    qty: VARIANT_QTY,
    base_price: rate,
    rate,
    discount_percentage: 0,
    discount_amount: 0,
    total_discount: 0,
    net_amount: rate,
    tax_amount: 0,
    tax_label: null,
    total_amount: rate,
    pricing_rules: [],
    pricing_rule_label: null,
    pricing_rule_apply_on: null,
    uom,
  };
}

const VEST_FAMILY: ItemFamilyDto = {
  name: FAMILY_CODE,
  item_name: 'Hi-Vis Safety Vest',
  image: IMAGE_LANDSCAPE,
  item_group: 'Safety Equipment',
  custom_slug: MOCK_FAMILY_SLUG,
  is_template: 1,
  // A template is never itself salable; the buyer buys one of its variants.
  is_purchasable: 0,
  variant_of: null,
  // Backend order, preserved by the UI exactly as it arrives.
  attributes: [
    { attribute: 'Colour', numeric: 0, values: ['Orange', 'Yellow'] },
    { attribute: 'Size', numeric: 0, values: ['Medium', 'Large'] },
  ],
  variants: [
    { item_code: 'YOB-VEST-ORG-M', attributes: { Colour: 'Orange', Size: 'Medium' } },
    { item_code: 'YOB-VEST-YEL-L', attributes: { Colour: 'Yellow', Size: 'Large' } },
  ],
};

/**
 * A family the storefront cannot configure - ERPNext Manufacturer-based variants.
 *
 * It arrives with nothing to choose, and the resolver refuses it outright. There is no
 * bespoke UI for this by decision, so the fixture exists to prove the safe fallback.
 */
export const MOCK_UNSUPPORTED_FAMILY_SLUG = 'contractor-tool-kit';
const UNSUPPORTED_FAMILY_CODE = 'YOB-KIT';

const KIT_FAMILY: ItemFamilyDto = {
  name: UNSUPPORTED_FAMILY_CODE,
  item_name: 'Contractor Tool Kit',
  image: null,
  item_group: 'Safety Equipment',
  custom_slug: MOCK_UNSUPPORTED_FAMILY_SLUG,
  is_template: 1,
  is_purchasable: 0,
  variant_of: null,
  attributes: [],
  variants: [],
};

/** Every family the mock serves from `get_item`, by slug. */
export const MOCK_FAMILIES_BY_SLUG: Readonly<Record<string, ItemFamilyDto>> = {
  [MOCK_FAMILY_SLUG]: VEST_FAMILY,
  [MOCK_UNSUPPORTED_FAMILY_SLUG]: KIT_FAMILY,
};

/**
 * What `resolve_variant` answers for each real combination.
 *
 * A full item payload, exactly like `get_item` returns for a simple product - which is
 * the point: the page renders a resolved variant with the same markup it renders a
 * simple item with. Keyed by the backend's own attribute values, never by a constructed
 * item code: reproducing ERPNext's naming is the thing the frontend must not do, and a
 * fixture that did it would quietly license the application to do it too.
 */
const VEST_VARIANTS: readonly {
  readonly attributes: Readonly<Record<string, string>>;
  readonly detail: ItemDetailDto;
}[] = [
  {
    attributes: { Colour: 'Orange', Size: 'Medium' },
    detail: {
      name: 'YOB-VEST-ORG-M',
      item_name: 'Hi-Vis Safety Vest - Orange, Medium',
      image: IMAGE_PORTRAIT,
      item_group: 'Safety Equipment',
      custom_slug: MOCK_FAMILY_SLUG,
      qty: VARIANT_QTY,
      is_template: 0,
      is_purchasable: 1,
      variant_of: FAMILY_CODE,
      // Read from the variant's stored rows by the real backend, so the contract says it
      // is safe to trust over what the browser sent.
      selected: { Colour: 'Orange', Size: 'Medium' },
      base_price: 1200,
      rate: 1000,
      discount_percentage: 0,
      discount_amount: 0,
      net_amount: 1000,
      tax_amount: 0,
      tax_label: null,
      total_amount: 1000,
      // Sold by the Box, stocked in Nos - the Phase 23B-5U split, on a variant.
      uom: 'Box',
      stock_uom: 'Nos',
      conversion_factor: 25,
      stock_qty: 25,
      is_stock_item: 1,
      warehouse: 'Stores - ST',
      actual_qty: 125,
      pricing: variantPricing('YOB-VEST-ORG-M', 'Hi-Vis Safety Vest - Orange, Medium', 1000, 'Box'),
      pricing_rule_label: null,
      pricing_rule_apply_on: null,
      available_rules: [],
    },
  },
  {
    attributes: { Colour: 'Yellow', Size: 'Large' },
    detail: {
      name: 'YOB-VEST-YEL-L',
      item_name: 'Hi-Vis Safety Vest - Yellow, Large',
      // No photograph of its own: the family's must stay on screen.
      image: null,
      item_group: 'Safety Equipment',
      custom_slug: MOCK_FAMILY_SLUG,
      qty: VARIANT_QTY,
      is_template: 0,
      is_purchasable: 1,
      variant_of: FAMILY_CODE,
      selected: { Colour: 'Yellow', Size: 'Large' },
      base_price: 60,
      rate: 60,
      discount_percentage: 0,
      discount_amount: 0,
      net_amount: 60,
      tax_amount: 0,
      tax_label: null,
      total_amount: 60,
      // A different selling unit from its sibling, which is why a quantity may never
      // carry across a variant change.
      uom: 'Nos',
      stock_uom: 'Nos',
      conversion_factor: 1,
      stock_qty: 1,
      is_stock_item: 1,
      warehouse: 'Stores - ST',
      actual_qty: 40,
      pricing: variantPricing('YOB-VEST-YEL-L', 'Hi-Vis Safety Vest - Yellow, Large', 60, 'Nos'),
      pricing_rule_label: null,
      pricing_rule_apply_on: null,
      available_rules: [],
    },
  },
];

/** Resolve a selection the way the backend does: by matching the real matrix. */
export function mockResolveVariant(
  template: string,
  attributes: Readonly<Record<string, string>>,
): ItemDetailDto | undefined {
  if (template !== FAMILY_CODE) {
    return undefined;
  }

  return VEST_VARIANTS.find((variant) =>
    Object.entries(variant.attributes).every(([name, value]) => attributes[name] === value),
  )?.detail;
}

/** Which attributes a family requires, so the mock can refuse an incomplete selection. */
export function mockFamilyByCode(template: string): ItemFamilyDto | undefined {
  return Object.values(MOCK_FAMILIES_BY_SLUG).find((family) => family.name === template);
}

/** Every resolvable variant payload, for cart lookups by item code. */
export const MOCK_VARIANT_DETAILS: readonly ItemDetailDto[] = VEST_VARIANTS.map((v) => v.detail);

/**
 * The listing row for a family: one card, and **no price**.
 *
 * `price_state: 'select_options'` is the backend saying the money is not knowable yet.
 * The children are not listed separately - the family is the row.
 */
const SAFETY_ITEMS: readonly CatalogItemDto[] = [
  {
    name: 'YOB-GOGGLE-CLR',
    item_name: 'Clear Safety Goggles',
    slug: 'clear-safety-goggles',
    ...PRICED_SIMPLE,
    uom: 'Nos',
    conversion_factor: 1,
    stock_uom: 'Nos',
    image: IMAGE_SQUARE,
    base_price: 240,
    rate: 240,
    discount_percentage: 0,
    discount_amount: 0,
    net_amount: 240,
    tax_amount: 0,
    total_amount: 240,
    pricing_rule_label: null,
  },
  {
    name: FAMILY_CODE,
    item_name: VEST_FAMILY.item_name,
    slug: MOCK_FAMILY_SLUG,
    has_variants: 1,
    price_state: 'select_options',
    // **Every money field null**, exactly as API 3.3.0 specifies for a family card - and
    // deliberately not zero. ERPNext cannot price a template, so there is no answer; a
    // zero is an answer, and a fixture holding a plausible number is how one eventually
    // gets rendered. The selling unit and conversion are null for the same reason: they
    // describe a price that does not exist yet.
    uom: null,
    conversion_factor: null,
    stock_uom: 'Nos',
    image: VEST_FAMILY.image,
    base_price: null,
    rate: null,
    discount_percentage: null,
    discount_amount: null,
    net_amount: null,
    tax_amount: null,
    total_amount: null,
    pricing_rule_label: null,
  },
];

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
  'safety-equipment': SAFETY_ITEMS,
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
 * | hex bolt | stock item, warehouse resolved, plenty on hand - and counted in `Nos` while the item sells in `Box` |
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

/** What `get_item` prices when the caller asks for no particular quantity. */
const DEFAULT_QTY = 1;

/**
 * Read a money field off a **priced** listing row.
 *
 * The listing card's money is nullable because a family card carries none (API 3.3.0),
 * but `get_item` detail is only ever built here from priced rows. Asserting rather than
 * defaulting: a `?? 0` would let the mock quietly invent a price, which is the one thing
 * these fixtures exist to make impossible.
 */
function priced(value: number | null, field: string, listing: CatalogItemDto): number {
  if (value === null) {
    throw new Error(`Mock fixture: ${listing.name} has no ${field}; it is not a priced row.`);
  }
  return value;
}

function toItemDetail(listing: CatalogItemDto): ItemDetailDto {
  const taxAmount = priced(listing.tax_amount, 'tax_amount', listing);
  const conversionFactor = priced(listing.conversion_factor, 'conversion_factor', listing);
  // Only the anchor item carries tax in these fixtures.
  const taxLabel = taxAmount > 0 ? 'GST 18%' : null;

  return {
    name: listing.name,
    item_name: listing.item_name,
    image: listing.image,
    item_group: ITEM_GROUP,
    custom_slug: listing.slug,
    qty: DEFAULT_QTY,
    // A simple item is a resolved product: never a template, always purchasable, and it
    // came from no family. Required fields in API 3.3.0 `ProductDetail`.
    is_template: 0,
    is_purchasable: 1,
    variant_of: null,
    selected: null,

    base_price: priced(listing.base_price, 'base_price', listing),
    rate: priced(listing.rate, 'rate', listing),
    discount_percentage: priced(listing.discount_percentage, 'discount_percentage', listing),
    discount_amount: priced(listing.discount_amount, 'discount_amount', listing),

    net_amount: priced(listing.net_amount, 'net_amount', listing),
    tax_amount: taxAmount,
    tax_label: taxLabel,
    total_amount: priced(listing.total_amount, 'total_amount', listing),

    // The selling unit, the stock unit and the factor between them - the backend's own
    // three answers. `stock_qty` is the server's conversion of the default `qty`, present
    // precisely so the browser never has to do that multiplication itself.
    uom: listing.uom ?? listing.stock_uom,
    stock_uom: listing.stock_uom,
    conversion_factor: conversionFactor,
    stock_qty: DEFAULT_QTY * conversionFactor,

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
      base_price: priced(listing.base_price, 'base_price', listing),
      rate: priced(listing.rate, 'rate', listing),
      discount_percentage: priced(listing.discount_percentage, 'discount_percentage', listing),
      discount_amount: priced(listing.discount_amount, 'discount_amount', listing),
      total_discount: priced(listing.discount_amount, 'discount_amount', listing),
      net_amount: priced(listing.net_amount, 'net_amount', listing),
      tax_amount: taxAmount,
      tax_label: taxLabel,
      total_amount: priced(listing.total_amount, 'total_amount', listing),
      pricing_rules: listing.pricing_rule_label === null ? [] : ['YOB-PRULE-0001'],
      pricing_rule_label: listing.pricing_rule_label,
      pricing_rule_apply_on: listing.pricing_rule_label === null ? null : 'Item Code',
      uom: listing.uom ?? listing.stock_uom,
    },

    pricing_rule_label: listing.pricing_rule_label,
    pricing_rule_apply_on: listing.pricing_rule_label === null ? null : 'Item Code',
    available_rules: OFFERS_BY_SLUG[listing.slug] ?? [],
  };
}

/** Every item the mock can serve in detail, keyed by its slug. */
export const MOCK_ITEM_DETAILS_BY_SLUG: Readonly<Record<string, ItemDetailDto>> =
  Object.fromEntries(FASTENER_ITEMS.map((listing) => [listing.slug, toItemDetail(listing)]));
