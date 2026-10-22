import { Routes } from '@angular/router';
import { GUILD_PAGES, guildAnalysisResolver, guildPagePath } from './guild-analysis';

export const GUILD_ANALYSIS_ROUTES: Routes = GUILD_PAGES.map(guild => ({
  path: guildPagePath(guild),
  loadComponent: () => import('./guild-analysis-page.component')
    .then(module => module.GuildAnalysisPageComponent),
  data: { guild, backToTop: false },
  resolve: { analysis: guildAnalysisResolver }
}));
