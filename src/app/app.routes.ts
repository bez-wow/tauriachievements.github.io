import { Routes } from '@angular/router';
import { AchievementLadderComponent } from './ladder.component';
import { BattlegroundPageComponent } from './battleground-page.component';
import { ComparePageComponent } from './compare-page.component';
import { GuildPresencePageComponent } from './guild-presence-page.component';
import { GuildRealmFirstsPageComponent } from './guild-realm-firsts-page.component';
import { NewRareCharactersPageComponent } from './new-rare-characters-page.component';
import { RareAchievementsPageComponent } from './rare-achievements-page.component';
import { TopGainersPageComponent } from './rank-movement-page.component';
import { StatsPageComponent } from './stats-page.component';
import { ApChestLootersPageComponent } from './ap-chest-looters-page.component';

export const routes: Routes = [
  {
    path: '',
    component: AchievementLadderComponent
  },
  {
    path: 'guilds',
    component: GuildPresencePageComponent
  },
  {
    path: 'rare-achievements',
    component: RareAchievementsPageComponent
  },
  {
    path: 'raid-history',
    component: GuildRealmFirstsPageComponent
  },
  {
    path: 'emerald-nightmare',
    loadComponent: () => import('./emerald-nightmare-page.component')
      .then(module => module.EmeraldNightmarePageComponent)
  },
  {
    path: 'guild-realm-firsts',
    redirectTo: 'raid-history',
    pathMatch: 'full'
  },
  {
    path: 'top-gainers',
    component: TopGainersPageComponent
  },
  {
    path: 'new-rare-characters',
    component: NewRareCharactersPageComponent
  },
  {
    path: 'stats',
    component: StatsPageComponent
  },
  {
    path: 'battleground',
    component: BattlegroundPageComponent
  },
  {
    path: 'ap-chest-looters',
    component: ApChestLootersPageComponent
  },
  {
    path: 'compare',
    component: ComparePageComponent
  },
  {
    path: 'k7m2q9v4x8p3n6z',
    loadComponent: () => import('./rare-items-page.component')
      .then(module => module.RareItemsPageComponent)
  },
  {
    path: 'endless-f8c2a91d',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'endless' }
  },
  {
    path: 'competence-optional-a47d9c2e',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'competence-optional' }
  },
  {
    path: 'entropy-3e8f1a62',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'entropy' }
  },
  {
    path: 'outlaws-6b31f0ad',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'outlaws' }
  },
  {
    path: 'impaired-c18e7b42',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'impaired' }
  },
  {
    path: 'impact-94fd2a61',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'impact' }
  },
  {
    path: 'six-seven-d74a9e3c',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'six-seven' }
  },
  {
    path: 'temerite-b93e7a41',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'temerite' }
  },
  {
    path: '**',
    redirectTo: ''
  }
];
