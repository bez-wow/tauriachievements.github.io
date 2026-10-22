import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { setClassColorProperties } from './app/game/class-colors';

setClassColorProperties(document.documentElement.style);

bootstrapApplication(AppComponent, appConfig)
  .catch(err => console.error(err));

