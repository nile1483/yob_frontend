import type { Routes } from '@angular/router';

export const CATALOG_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/catalog-page').then((m) => m.CatalogPage),
    title: 'Catalog',
  },
];
