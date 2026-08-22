import type { MenuDto } from '../../app/domains/content/contracts/cms.types';

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
