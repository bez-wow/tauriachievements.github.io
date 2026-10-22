import { Routes } from '@angular/router';

export const SUPPORT_ROUTES: Routes = [
  {
    path: 'support',
    loadComponent: () => import('./support-page.component')
      .then(module => module.SupportPageComponent)
  }
];
