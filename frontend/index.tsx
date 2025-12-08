import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation } from '@angular/router';
import { LOCALE_ID, provideZonelessChangeDetection, APP_INITIALIZER, inject } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { AppComponent } from './src/app.component';
import { APP_ROUTES } from './src/app.routes';
import { authInterceptor } from './src/interceptors/auth.interceptor';
import { errorInterceptor } from './src/interceptors/error.interceptor';
import { AuthService } from './src/services/auth.service';
import { firstValueFrom, of, catchError } from 'rxjs';

registerLocaleData(localePt);

function initializeApp(authService: AuthService) {
  return () => authService.refreshToken().pipe(
    catchError(() => of(null)) // Ignore errors on startup (user just stays logged out)
  );
}

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(APP_ROUTES, withHashLocation()),
    { provide: LOCALE_ID, useValue: 'pt' },
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp,
      deps: [AuthService],
      multi: true
    }
  ],
}).catch((err) => console.error(err));