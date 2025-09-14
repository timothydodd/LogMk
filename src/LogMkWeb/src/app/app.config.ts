import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { BrowserAnimationsModule, provideAnimations } from '@angular/platform-browser/animations';
import { JwtModule } from '@auth0/angular-jwt';
import { BarController, BarElement, CategoryScale, Colors, Legend, LinearScale } from 'chart.js';
import { AlertTriangle, Box, Check, ChevronDown, Clock, Copy, Download, FilterX, Gauge, Info, LogOut, LucideAngularModule, RefreshCw, Search, Settings, User, X } from 'lucide-angular';
import { provideCharts } from 'ng2-charts';
import { provideToastr } from 'ngx-toastr';
import { environment } from '../environments/environment';
import { JwtInterceptor } from './_services/jwt-interceptor';
import { routes } from './app.routes';
export function tokenGetter() {
  return localStorage.getItem('authToken');
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptorsFromDi()),
    provideAnimations(),
    provideRouter(routes),
    importProvidersFrom([BrowserAnimationsModule]),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: JwtInterceptor,
      multi: true,
    },
    provideCharts({ registerables: [BarController, Legend, Colors, CategoryScale, LinearScale, BarElement] }),
    importProvidersFrom(
      JwtModule.forRoot({
        config: {
          tokenGetter: tokenGetter,
          allowedDomains: undefined, // Update with your API domain
          disallowedRoutes: [`${environment.apiUrl}/api/auth/login`], // Update with any routes you want to exclude
        },
      })
    ),
    importProvidersFrom(LucideAngularModule.pick({ X, User, Box, Gauge, Clock, Search, ChevronDown, Settings, LogOut, RefreshCw, Info, AlertTriangle, Copy, Check, FilterX, Download })),
    provideToastr(),
  ],
};
