import { Routes } from '@angular/router';

export const PVP_ROUTES: Routes = [
  {
    path: 'arena',
    loadComponent: () => import('./arena-games-page.component')
      .then(module => module.ArenaGamesPageComponent)
  },
  {
    path: '50-games-played-arenas',
    redirectTo: 'arena',
    pathMatch: 'full'
  },
  {
    path: 'battleground',
    loadComponent: () => import('./battleground-page.component')
      .then(module => module.BattlegroundPageComponent)
  },
  {
    path: 'rated-battleground',
    loadComponent: () => import('./rated-battleground-page.component')
      .then(module => module.RatedBattlegroundPageComponent)
  }
];
