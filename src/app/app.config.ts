import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { environment } from '../environments/environment';
import { SessionStore } from './foundation/session/session.store';
import { provideYobNetwork } from './foundation/network/yob-api.config';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Route parameters bind straight to signal inputs, so pages read `:categorySlug`
    // as an input rather than subscribing to paramMap.
    provideRouter(routes, withComponentInputBinding()),
    // `environment.httpInterceptors` is empty in production. In development it carries
    // the mock API interceptor when mock mode is on - the only place the application
    // is aware such a thing exists.
    provideYobNetwork(environment.api, environment.httpInterceptors),
    // Resolve the session before the first render so nothing has to cope with a
    // half-known state. `restore()` never errors, so a backend outage delays boot but
    // does not break it - the failure surfaces as `SessionStore.restoreError`.
    provideAppInitializer(() => inject(SessionStore).restore())
  ]
};
