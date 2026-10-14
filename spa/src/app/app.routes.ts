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
import { GUILD_PAGES, guildAnalysisResolver } from './guild-analysis';

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
    path: 'raid-logs',
    loadComponent: () => import('./raid-logs-page.component')
      .then(module => module.RaidLogsPageComponent)
  },
  {
    path: 'raid-logs/leaderboard',
    loadComponent: () => import('./raid-logs-leaderboard-page.component')
      .then(module => module.RaidLogsLeaderboardPageComponent)
  },
  {
    path: 'raid-logs/boss/:boss',
    loadComponent: () => import('./raid-logs-boss-page.component')
      .then(module => module.RaidLogsBossPageComponent)
  },
  {
    path: 'raid-logs/log/:realm/:id',
    loadComponent: () => import('./raid-log-page.component')
      .then(module => module.RaidLogPageComponent)
  },
  {
    path: 'raid-logs/guild/:realm/:name',
    loadComponent: () => import('./raid-logs-guild-page.component')
      .then(module => module.RaidLogsGuildPageComponent)
  },
  {
    path: 'raid-logs/character/:realm/:name',
    loadComponent: () => import('./raid-logs-character-page.component')
      .then(module => module.RaidLogsCharacterPageComponent)
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
    path: 'support',
    loadComponent: () => import('./support-page.component')
      .then(module => module.SupportPageComponent)
  },
  {
    path: 'k7m2q9v4x8p3n6z',
    loadComponent: () => import('./rare-items-page.component')
      .then(module => module.RareItemsPageComponent)
  },
  // Each guild page: its statistics, and its members' raid and Mythic+ scores.
  ...GUILD_PAGES.flatMap(({ key, path }): Routes => [
    {
      path,
      loadComponent: () => import('./endless6531-page.component')
        .then(module => module.Endless6531PageComponent),
      data: { guild: key },
      resolve: { analysis: guildAnalysisResolver }
    },
    {
      path: `${path}/scores`,
      loadComponent: () => import('./guild-scores-page.component')
        .then(module => module.GuildScoresPageComponent),
      data: { guild: key },
      resolve: { analysis: guildAnalysisResolver }
    }
  ]),
  {
    path: '**',
    redirectTo: ''
  }
];
