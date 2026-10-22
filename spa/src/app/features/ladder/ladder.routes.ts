import { Routes } from '@angular/router';
import { AchievementLadderComponent } from './ladder.component';

export const LADDER_ROUTES: Routes = [
  {
    path: '',
    component: AchievementLadderComponent
  },
  {
    path: 'guilds',
    loadComponent: () => import('./guild-presence-page.component')
      .then(module => module.GuildPresencePageComponent)
  },
  {
    path: 'top-gainers',
    loadComponent: () => import('./rank-movement-page.component')
      .then(module => module.TopGainersPageComponent)
  },
  {
    path: 'compare',
    loadComponent: () => import('./compare-page.component')
      .then(module => module.ComparePageComponent)
  }
];
