import type { Routes } from '@angular/router';

/**
 * Catalog routes.
 *
 * Order is load-bearing: `item/:itemSlug` must precede `:categorySlug`, because a
 * single dynamic segment would otherwise swallow `item` and treat it as a category
 * slug. The static segment keeps the two apart with no ambiguity, at the cost of
 * reserving `item` as a category slug - an acceptable trade, and cheaper than
 * nesting items under a category the item API does not need.
 *
 * `:categorySlug` and `:itemSlug` bind to signal inputs on their pages via
 * `withComponentInputBinding()`.
 */
export const CATALOG_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/catalog-page').then((m) => m.CatalogPage),
    title: 'Catalog',
  },
  {
    // Must stay above ':categorySlug'.
    path: 'item/:itemSlug',
    loadComponent: () => import('./pages/item-page').then((m) => m.ItemPage),
  },
  {
    path: ':categorySlug',
    loadComponent: () => import('./pages/category-page').then((m) => m.CategoryPage),
  },
];
