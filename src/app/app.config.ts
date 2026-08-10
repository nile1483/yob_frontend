import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { environment } from '../environments/environment';
import { SessionStore } from './foundation/session/session.store';
import { provideYobNetwork } from './foundation/network/yob-api.config';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideYobNetwork(environment.api),
    // Resolve the session before the first render so nothing has to cope with a
    // half-known state. `restore()` never errors, so a backend outage delays boot but
    // does not break it - the failure surfaces as `SessionStore.restoreError`.
    provideAppInitializer(() => inject(SessionStore).restore())
  ]
};
