import { Routes } from '@angular/router';
import { AchievementLadderComponent } from './ladder.component';

export const routes: Routes = [
  {
    path: '',
    component: AchievementLadderComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
