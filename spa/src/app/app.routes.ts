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
import { guildAnalysisResolver } from './guild-analysis';

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
    path: 'mythic-plus/character/:realm/:name',
    loadComponent: () => import('./mythic-plus-profile-page.component')
      .then(module => module.MythicPlusProfilePageComponent)
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
    path: 'rated-battleground',
    loadComponent: () => import('./rated-battleground-page.component')
      .then(module => module.RatedBattlegroundPageComponent)
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
    data: { guild: 'endless' },
    resolve: { analysis: guildAnalysisResolver }
  },
  {
    path: 'competence-optional-a47d9c2e',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'competence-optional' },
    resolve: { analysis: guildAnalysisResolver }
  },
  {
    path: 'miracle-6e2d8f14',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'miracle' },
    resolve: { analysis: guildAnalysisResolver }
  },
  {
    path: 'entropy-3e8f1a62',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'entropy' },
    resolve: { analysis: guildAnalysisResolver }
  },
  {
    path: 'outlaws-34c1426b',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'outlaws' },
    resolve: { analysis: guildAnalysisResolver }
  },
  {
    path: 'impaired-c18e7b42',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'impaired' },
    resolve: { analysis: guildAnalysisResolver }
  },
  {
    path: 'impact-94fd2a61',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'impact' },
    resolve: { analysis: guildAnalysisResolver }
  },
  {
    path: 'six-seven-d74a9e3c',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'six-seven' },
    resolve: { analysis: guildAnalysisResolver }
  },
  {
    path: 'temerite-b93e7a41',
    loadComponent: () => import('./endless6531-page.component')
      .then(module => module.Endless6531PageComponent),
    data: { guild: 'temerite' },
    resolve: { analysis: guildAnalysisResolver }
  },
  {
    path: '**',
    redirectTo: ''
  }
];
