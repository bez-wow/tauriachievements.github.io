import { Routes } from '@angular/router';
import { AchievementLadderComponent } from './ladder.component';
import { GuildPresencePageComponent } from './guild-presence-page.component';
import { GuildRealmFirstsPageComponent } from './guild-realm-firsts-page.component';
import { RareAchievementsPageComponent } from './rare-achievements-page.component';
import { TopGainersPageComponent } from './rank-movement-page.component';

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
    path: 'guild-realm-firsts',
    component: GuildRealmFirstsPageComponent
  },
  {
    path: 'top-gainers',
    component: TopGainersPageComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
