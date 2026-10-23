import { Routes } from '@angular/router';

export const RAIDS_ROUTES: Routes = [
  {
    path: 'raid-logs',
    loadComponent: () => import('./raid-logs-page.component')
      .then(module => module.RaidLogsPageComponent)
  },
  {
    path: 'raid-logs/guilds',
    loadComponent: () => import('./raid-logs-progression-page.component')
      .then(module => module.RaidLogsProgressionPageComponent)
  },
  {
    path: 'raid-logs/stats',
    loadComponent: () => import('./raid-logs-stats-page.component')
      .then(module => module.RaidLogsStatsPageComponent)
  },
  {
    path: 'raid-logs/tier-list',
    loadComponent: () => import('./raid-logs-tier-list-page.component')
      .then(module => module.RaidLogsTierListPageComponent)
  },
  {
    path: 'raid-logs/talents',
    loadComponent: () => import('./raid-logs-talents-page.component')
      .then(module => module.RaidLogsTalentsPageComponent)
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
    path: 'emerald-nightmare',
    loadComponent: () => import('./emerald-nightmare-page.component')
      .then(module => module.EmeraldNightmarePageComponent)
  },
  {
    path: 'raid-history',
    loadComponent: () => import('./guild-realm-firsts-page.component')
      .then(module => module.GuildRealmFirstsPageComponent)
  },
  {
    path: 'guild-realm-firsts',
    redirectTo: 'raid-history',
    pathMatch: 'full'
  }
];
