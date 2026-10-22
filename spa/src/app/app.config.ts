import { ApplicationConfig } from '@angular/core';
import {
  provideRouter,
  withEnabledBlockingInitialNavigation,
  withInMemoryScrolling,
  withNavigationErrorHandler,
  withRouterConfig,
  withViewTransitions
} from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { reloadOnNewDeploy } from './core/new-deploy-reload';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes,
      withRouterConfig({
        onSameUrlNavigation: 'reload'
      }),
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled'
      }),
      withEnabledBlockingInitialNavigation(),
      withNavigationErrorHandler(reloadOnNewDeploy),
      withViewTransitions()
    ),
    provideHttpClient()
  ]
};

