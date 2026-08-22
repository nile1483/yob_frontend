import type { MenuDto } from '../../app/domains/content/contracts/cms.types';
import type { StorefrontPageDto } from '../../app/domains/content/contracts/page.types';
import type { RouteContentDto } from '../../app/domains/content/contracts/route-content.types';
import {
  IMAGE_HUGE,
  IMAGE_LANDSCAPE,
  IMAGE_PORTRAIT,
  IMAGE_SQUARE,
  MOCK_ITEMS_BY_CATEGORY,
} from './catalog.fixture';

/**
 * The merchant-configured navigation tree, shaped from API 3.4.0 `MenuResponse`.
 *
 * Everything the frontend has to get right is represented once:
 *
 * | Node | Proves |
 * | --- | --- |
 * | Catalog | a `catalog` destination with a ready-made `href` |
 * | Tools (group) | organisational only - `destination: null`, holds children |
 * | Fasteners / Safety | `storefront_category` destinations inside a group |
 * | About Us | `storefront_page`, whose `href` is **null** and route is client-built |
 * | Supplier site | `external_url`, external, opens in a new tab |
 * | Price list PDF | external, same tab - `open_in_new_tab` is not implied by `external` |
 * | Seasonal | a published node whose destination went away: rendered, not clickable |
 *
 * The tree is two levels because the backend publishes no more. Ordering is the
 * merchant's and the mock preserves it exactly - a frontend that sorted would pass
 * against an alphabetised fixture and fail against a real store.
 */
export const MOCK_MENU_KEY = 'main';

/* --------------------------------------------------------------- storefront pages */

/**
 * Merchant pages, shaped from API 3.4.0 `PageResponse` and the backend's own projector.
 *
 * `about-us` carries **all five block types** in a deliberate order, so one page proves
 * ordering, every renderer and the shared destination handling at once. Each block also
 * carries the case its renderer most easily gets wrong:
 *
 * | Block | The trap it covers |
 * | --- | --- |
 * | image banner | a destination, and both a desktop and a mobile asset |
 * | rich text | markup that must be sanitised, and centre alignment |
 * | carousel | three slides, autoplay on, one slide with no destination |
 * | product grid | a simple priced card **and** a variant family with null money |
 * | promo grid | three cards, an external destination, one inert |
 *
 * `support` is a second, minimal page: proof that navigating slug to slug replaces the
 * content rather than merging into it.
 */
const PAGE_MEDIA_DESKTOP = IMAGE_LANDSCAPE;
const PAGE_MEDIA_MOBILE = IMAGE_SQUARE;

/** The unsafe markup a client must neutralise even though the backend sanitises on save. */
const RICH_TEXT_HTML =
  '<p>Trusted by <strong>industrial buyers</strong> since 1998.</p>' +
  '<p><a href="/catalog">Browse the catalogue</a></p>' +
  '<script>window.__yobXss = true;</script>' +
  '<img src="x" onerror="window.__yobXss = true">';

const ABOUT_PAGE: StorefrontPageDto = {
  slug: 'about-us',
  title: 'About Us',
  meta_title: 'About Your Order Book',
  meta_description: 'Who we are and what we stock.',
  blocks: [
    {
      type: 'image_banner',
      block_name: 'Hero banner',
      desktop_image: PAGE_MEDIA_DESKTOP,
      mobile_image: PAGE_MEDIA_MOBILE,
      alt_text: 'Our warehouse',
      desktop_height_px: 400,
      mobile_height_px: 220,
      destination: {
        type: 'storefront_category',
        target: 'fasteners',
        href: '/catalog/fasteners',
        external: false,
        open_in_new_tab: false,
      },
    },
    {
      type: 'rich_text',
      block_name: 'Intro copy',
      title: 'Who we are',
      html: RICH_TEXT_HTML,
      text_alignment: 'center',
    },
    {
      type: 'banner_carousel',
      block_name: 'Seasonal carousel',
      auto_play: true,
      interval_ms: 3000,
      desktop_height_px: 320,
      mobile_height_px: 200,
      slides: [
        {
          desktop_image: PAGE_MEDIA_DESKTOP,
          mobile_image: PAGE_MEDIA_MOBILE,
          title: 'Winter safety',
          alt_text: 'Hi-vis clothing',
          destination: {
            type: 'storefront_category',
            target: 'safety-equipment',
            href: '/catalog/safety-equipment',
            external: false,
            open_in_new_tab: false,
          },
        },
        {
          desktop_image: IMAGE_PORTRAIT,
          mobile_image: null,
          title: 'Supplier of the year',
          alt_text: 'Award',
          destination: {
            type: 'external_url',
            target: null,
            href: 'https://awards.example.invalid/2026',
            external: true,
            open_in_new_tab: true,
          },
        },
        {
          desktop_image: IMAGE_HUGE,
          mobile_image: null,
          title: 'Coming soon',
          alt_text: 'Placeholder',
          // Published, and going nowhere: rendered, not clickable.
          destination: null,
        },
      ],
    },
    {
      type: 'product_grid',
      block_name: 'Featured safety',
      card_type: 'square',
      item_limit: 12,
      category: 'safety-equipment',
      // The catalogue's own rows: a priced simple item, and a family with null money.
      items: MOCK_ITEMS_BY_CATEGORY['safety-equipment'] ?? [],
    },
    {
      type: 'promo_grid',
      block_name: 'Promotions',
      cards_per_row: 3,
      desktop_height_px: 240,
      mobile_height_px: 180,
      cards: [
        {
          desktop_image: PAGE_MEDIA_DESKTOP,
          mobile_image: null,
          title: 'Free delivery',
          alt_text: 'Delivery van',
          destination: {
            type: 'storefront_page',
            target: 'support',
            // Always null for this type: the SPA owns /pages/:slug.
            href: null,
            external: false,
            open_in_new_tab: false,
          },
        },
        {
          desktop_image: IMAGE_SQUARE,
          mobile_image: null,
          title: 'Trade accounts',
          alt_text: 'Handshake',
          destination: {
            type: 'external_url',
            target: null,
            href: 'https://accounts.example.invalid/apply',
            external: true,
            open_in_new_tab: true,
          },
        },
        {
          desktop_image: IMAGE_PORTRAIT,
          mobile_image: null,
          title: 'Coming soon',
          alt_text: 'Placeholder',
          destination: null,
        },
      ],
    },
  ],
};

const SUPPORT_PAGE: StorefrontPageDto = {
  slug: 'support',
  title: 'Support',
  meta_title: null,
  // No description at all, so a client that left the previous page's behind is caught.
  meta_description: null,
  blocks: [
    {
      type: 'rich_text',
      block_name: 'Support copy',
      title: 'Contact us',
      html: '<p>Call the trade desk on 0800 000 000.</p>',
      text_alignment: 'left',
    },
  ],
};

/**
 * A page carrying a block type this release does not know.
 *
 * The forward-compatibility case: an old client meeting a newer backend must render what
 * it understands and skip the rest, not take the page down.
 */
const FUTURE_PAGE: StorefrontPageDto = {
  slug: 'future',
  title: 'Future',
  meta_title: null,
  meta_description: null,
  blocks: [
    { type: 'video_hero', block_name: 'Video hero' } as unknown as StorefrontPageDto['blocks'][number],
    {
      type: 'rich_text',
      block_name: 'Still rendered',
      title: 'Still here',
      html: '<p>This block renders even though the one above it is unknown.</p>',
      text_alignment: 'left',
    },
  ],
};

export const MOCK_PAGES_BY_SLUG: Readonly<Record<string, StorefrontPageDto>> = {
  'about-us': ABOUT_PAGE,
  support: SUPPORT_PAGE,
  future: FUTURE_PAGE,
};


/* --------------------------------------------------- system route content (25H) */

/**
 * Merchant content placed into application routes, shaped from API 3.5.0
 * `RouteContentResponse`.
 *
 * ## What this fixture has to prove, and what it deliberately does not
 *
 * The blocks here are the **same** union the page fixture above already exercises, and
 * every renderer is already covered there. So this does not restate the whole page
 * fixture in a second place - it proves the things that are *new*:
 *
 * | Route | Proves |
 * | --- | --- |
 * | `home` | three regions at once, and a Product Grid arriving already priced |
 * | `cart` | content on a route that has its own business behaviour |
 * | `category` | a route whose content is generic, not per-category |
 * | `product` | content coexisting with variant resolution |
 * | `orders` / `order_detail` | one filled slot, one empty, on the same route |
 * | `catalog` / `account` | declared and entirely empty - the ordinary case |
 *
 * **Every declared slot is present, empty ones included**, exactly as the backend
 * answers. A client that only rendered keys it found would pass against a fixture that
 * omitted them and fail against the real thing.
 *
 * Slot order matches `x-route-slots`, because the backend returns slots in render order.
 */
const ROUTE_MEDIA = IMAGE_LANDSCAPE;

export const MOCK_ROUTE_CONTENT: Readonly<Record<string, RouteContentDto>> = {
  home: {
    route_key: 'home',
    slots: [
      {
        key: 'hero',
        blocks: [
          {
            type: 'image_banner',
            block_name: 'Home hero',
            desktop_image: ROUTE_MEDIA,
            mobile_image: IMAGE_SQUARE,
            alt_text: 'Everything for the trade',
            desktop_height_px: 420,
            mobile_height_px: 240,
            destination: {
              type: 'storefront_category',
              target: 'fasteners',
              href: '/catalog/fasteners',
              external: false,
              open_in_new_tab: false,
            },
          },
        ],
      },
      {
        key: 'main',
        // Two blocks in one slot: the merchant's sequence is the only order there is.
        blocks: [
          {
            type: 'rich_text',
            block_name: 'Home welcome',
            title: 'Welcome back',
            html: '<p>Your trade prices, ready to order.</p>',
            text_alignment: 'left',
          },
          {
            type: 'product_grid',
            block_name: 'Home featured',
            card_type: 'square',
            item_limit: 12,
            category: 'safety-equipment',
            // Already selected and priced by the backend: a simple item with its own
            // rate and selling UOM, and a family that must show no money at all.
            items: MOCK_ITEMS_BY_CATEGORY['safety-equipment'] ?? [],
          },
        ],
      },
      {
        key: 'bottom',
        blocks: [
          {
            type: 'promo_grid',
            block_name: 'Home promos',
            cards_per_row: 2,
            desktop_height_px: 220,
            mobile_height_px: 160,
            cards: [
              {
                desktop_image: ROUTE_MEDIA,
                mobile_image: null,
                title: 'Trade accounts',
                alt_text: 'Handshake',
                destination: {
                  type: 'storefront_page',
                  target: 'support',
                  href: null,
                  external: false,
                  open_in_new_tab: false,
                },
              },
              {
                desktop_image: IMAGE_SQUARE,
                mobile_image: null,
                title: 'Coming soon',
                alt_text: 'Placeholder',
                destination: null,
              },
            ],
          },
        ],
      },
    ],
  },

  cart: {
    route_key: 'cart',
    slots: [
      {
        key: 'above_cart',
        blocks: [
          {
            type: 'rich_text',
            block_name: 'Delivery notice',
            title: null,
            html: '<p>Free delivery on orders over 5000.</p>',
            text_alignment: 'center',
          },
        ],
      },
      {
        key: 'below_cart',
        blocks: [
          {
            type: 'image_banner',
            block_name: 'Cart footer banner',
            desktop_image: ROUTE_MEDIA,
            mobile_image: null,
            alt_text: 'Bulk order desk',
            desktop_height_px: 180,
            mobile_height_px: 140,
            destination: null,
          },
        ],
      },
    ],
  },

  category: {
    route_key: 'category',
    slots: [
      {
        key: 'above_listing',
        blocks: [
          {
            type: 'rich_text',
            block_name: 'Category notice',
            title: null,
            html: '<p>Bulk pricing applies from 100 units.</p>',
            text_alignment: 'left',
          },
        ],
      },
      { key: 'below_listing', blocks: [] },
    ],
  },

  product: {
    route_key: 'product',
    slots: [
      { key: 'above_product', blocks: [] },
      {
        key: 'below_product',
        blocks: [
          {
            type: 'rich_text',
            block_name: 'Product footer',
            title: 'Need a different size?',
            html: '<p>Call the trade desk on 0800 000 000.</p>',
            text_alignment: 'left',
          },
        ],
      },
    ],
  },

  orders: {
    route_key: 'orders',
    slots: [
      {
        key: 'above_list',
        blocks: [
          {
            type: 'rich_text',
            block_name: 'Orders notice',
            title: null,
            html: '<p>Orders placed before 3pm ship the same day.</p>',
            text_alignment: 'left',
          },
        ],
      },
      { key: 'below_list', blocks: [] },
    ],
  },

  order_detail: {
    route_key: 'order_detail',
    slots: [
      { key: 'above_order', blocks: [] },
      {
        key: 'below_order',
        blocks: [
          {
            type: 'rich_text',
            block_name: 'Order footer',
            title: null,
            html: '<p>Questions about this order? Quote its number.</p>',
            text_alignment: 'left',
          },
        ],
      },
    ],
  },

  // Declared, and entirely empty. The ordinary case for a store that has configured
  // nothing here, and the one a client is most likely to get wrong by rendering a gap.
  catalog: {
    route_key: 'catalog',
    slots: [
      { key: 'above_listing', blocks: [] },
      { key: 'below_listing', blocks: [] },
    ],
  },

  account: {
    route_key: 'account',
    slots: [
      { key: 'above_content', blocks: [] },
      { key: 'below_content', blocks: [] },
    ],
  },
};



export const MOCK_MENU: MenuDto = {
  key: MOCK_MENU_KEY,
  label: 'Main Menu',
  items: [
    {
      label: 'Catalog',
      type: 'catalog',
      destination: {
        type: 'catalog',
        target: null,
        href: '/catalog',
        external: false,
        open_in_new_tab: false,
      },
      children: [],
    },
    {
      label: 'Tools',
      type: 'group',
      // A group goes nowhere. It exists to hold the two categories below it.
      destination: null,
      children: [
        {
          label: 'Fasteners',
          type: 'storefront_category',
          destination: {
            type: 'storefront_category',
            target: 'fasteners',
            href: '/catalog/fasteners',
            external: false,
            open_in_new_tab: false,
          },
          children: [],
        },
        {
          label: 'Safety Equipment',
          type: 'storefront_category',
          destination: {
            type: 'storefront_category',
            target: 'safety-equipment',
            href: '/catalog/safety-equipment',
            external: false,
            open_in_new_tab: false,
          },
          children: [],
        },
      ],
    },
    {
      label: 'About Us',
      type: 'storefront_page',
      destination: {
        type: 'storefront_page',
        target: 'about-us',
        // Always null for this type - the SPA owns `/pages/:slug` and builds it from
        // `target`. The backend deliberately stores no route.
        href: null,
        external: false,
        open_in_new_tab: false,
      },
      children: [],
    },
    {
      label: 'Supplier site',
      type: 'external_url',
      destination: {
        type: 'external_url',
        target: null,
        href: 'https://supplier.example.invalid/catalogue',
        external: true,
        open_in_new_tab: true,
      },
      children: [],
    },
    {
      label: 'Price list PDF',
      type: 'external_url',
      destination: {
        type: 'external_url',
        target: null,
        href: 'https://files.example.invalid/catalogue.pdf',
        external: true,
        // External but same tab: the two flags are independent, and a frontend that
        // inferred one from the other would be wrong on exactly this node.
        open_in_new_tab: false,
      },
      children: [],
    },
    {
      label: 'Seasonal',
      type: 'storefront_category',
      // The backend keeps a node whose destination no longer resolves and publishes it
      // with `destination: null`. It renders, and it is not clickable.
      destination: null,
      children: [],
    },
  ],
};
