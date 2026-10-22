import { Routes } from '@angular/router';

export const REALM_STATS_ROUTES: Routes = [
  {
    path: 'stats',
    loadComponent: () => import('./stats-page.component')
      .then(module => module.StatsPageComponent)
  }
];
