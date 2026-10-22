import { Routes } from '@angular/router';

export const ACHIEVEMENTS_ROUTES: Routes = [
  {
    path: 'rare-achievements',
    loadComponent: () => import('./rare-achievements-page.component')
      .then(module => module.RareAchievementsPageComponent)
  },
  {
    path: 'new-rare-characters',
    loadComponent: () => import('./new-rare-characters-page.component')
      .then(module => module.NewRareCharactersPageComponent)
  },
  {
    path: 'ap-chest-looters',
    loadComponent: () => import('./ap-chest-looters-page.component')
      .then(module => module.ApChestLootersPageComponent),
    data: { backToTop: false }
  },
  {
    path: 'k7m2q9v4x8p3n6z',
    loadComponent: () => import('./rare-items-page.component')
      .then(module => module.RareItemsPageComponent),
    data: { header: false }
  }
];
