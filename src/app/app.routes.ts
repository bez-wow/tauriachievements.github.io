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
    path: 'outlaws-6b31f0ad',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'outlaws' }
  },
  {
    path: 'six-seven-d74a9e3c',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'six-seven' }
  },
  {
    path: '**',
    redirectTo: ''
  }
];
