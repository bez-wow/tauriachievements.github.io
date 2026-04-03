import { Routes } from '@angular/router';
import { AchievementLadderComponent } from './ladder.component';
import { TopGainersPageComponent } from './rank-movement-page.component';

export const routes: Routes = [
  {
    path: '',
    component: AchievementLadderComponent
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
