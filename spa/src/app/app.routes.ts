import { Routes } from '@angular/router';
import { ACHIEVEMENTS_ROUTES } from './features/achievements/achievements.routes';
import { GUILD_ANALYSIS_ROUTES } from './features/guild-analysis/guild-analysis.routes';
import { LADDER_ROUTES } from './features/ladder/ladder.routes';
import { MYTHIC_PLUS_ROUTES } from './features/mythic-plus/mythic-plus.routes';
import { PVP_ROUTES } from './features/pvp/pvp.routes';
import { RAIDS_ROUTES } from './features/raids/raids.routes';
import { REALM_STATS_ROUTES } from './features/realm-stats/realm-stats.routes';
import { SUPPORT_ROUTES } from './features/support/support.routes';

export const routes: Routes = [
  ...LADDER_ROUTES,
  ...ACHIEVEMENTS_ROUTES,
  ...PVP_ROUTES,
  ...RAIDS_ROUTES,
  ...MYTHIC_PLUS_ROUTES,
  ...REALM_STATS_ROUTES,
  ...SUPPORT_ROUTES,
  ...GUILD_ANALYSIS_ROUTES,
  {
    path: '**',
    redirectTo: ''
  }
];
