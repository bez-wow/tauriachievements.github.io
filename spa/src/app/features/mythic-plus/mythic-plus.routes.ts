import { Routes } from '@angular/router';

export const MYTHIC_PLUS_ROUTES: Routes = [
  {
    path: 'mythic-plus',
    loadComponent: () => import('./mythic-plus-page.component')
      .then(module => module.MythicPlusPageComponent)
  },
  {
    path: 'mythic-plus/scoring',
    loadComponent: () => import('./mythic-plus-scoring-page.component')
      .then(module => module.MythicPlusScoringPageComponent)
  },
  {
    path: 'mythic-plus/stats',
    loadComponent: () => import('./mythic-plus-stats-page.component')
      .then(module => module.MythicPlusStatsPageComponent)
  },
  {
    path: 'mythic-plus/records',
    loadComponent: () => import('./mythic-plus-records-page.component')
      .then(module => module.MythicPlusRecordsPageComponent)
  },
  {
    path: 'mythic-plus/compare',
    loadComponent: () => import('./mythic-plus-compare-page.component')
      .then(module => module.MythicPlusComparePageComponent)
  },
  {
    path: 'mythic-plus/character/:realm/:name',
    loadComponent: () => import('./mythic-plus-profile-page.component')
      .then(module => module.MythicPlusProfilePageComponent)
  },
  {
    path: 'mythic-plus/guild/:realm/:guild',
    loadComponent: () => import('./mythic-plus-guild-page.component')
      .then(module => module.MythicPlusGuildPageComponent)
  },
  {
    path: 'legion-key-history-addon',
    loadComponent: () => import('./legion-key-history-page.component')
      .then(module => module.LegionKeyHistoryPageComponent)
  }
];
