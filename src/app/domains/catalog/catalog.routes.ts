import type { Routes } from '@angular/router';

/**
 * Catalog routes.
 *
 * `:categorySlug` binds to the page's `categorySlug` signal input via
 * `withComponentInputBinding()`, so navigating between categories re-runs the page's
 * resource without any manual `paramMap` subscription.
 */
export const CATALOG_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/catalog-page').then((m) => m.CatalogPage),
    title: 'Catalog',
  },
  {
    path: ':categorySlug',
    loadComponent: () => import('./pages/category-page').then((m) => m.CategoryPage),
  },
];
