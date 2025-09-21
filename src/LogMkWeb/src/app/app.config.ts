import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { BrowserAnimationsModule, provideAnimations } from '@angular/platform-browser/animations';
import { JwtModule } from '@auth0/angular-jwt';
import { Chart, BarController, BarElement, CategoryScale, Colors, Filler, Legend, LineController, LineElement, LinearScale, PointElement } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Activity, AlertTriangle, AreaChart, BarChart3, Bookmark, Box, Check, ChevronDown, ChevronRight, Clock, Copy, Database, Download, Eye, EyeOff, Filter, FilterX, Gauge, Group, Hash, Info, LogOut, LucideAngularModule, Maximize2, Minimize2, MoreVertical, Pause, Play, RefreshCw, RotateCcw, Save, Search, Settings, Trash2, TrendingUp, User, Volume2, VolumeX, X, ZoomIn, ZoomOut } from 'lucide-angular';
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
    provideCharts({ registerables: [BarController, LineController, Legend, Colors, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler] }),
    importProvidersFrom(
      JwtModule.forRoot({
        config: {
          tokenGetter: tokenGetter,
          allowedDomains: undefined, // Update with your API domain
          disallowedRoutes: [`${environment.apiUrl}/api/auth/login`], // Update with any routes you want to exclude
        },
      })
    ),
    importProvidersFrom(LucideAngularModule.pick({ X, User, Box, Gauge, Clock, Search, ChevronDown, ChevronRight, Settings, LogOut, RefreshCw, Info, AlertTriangle, Copy, Check, FilterX, Download, MoreVertical, Save, Bookmark, Play, Pause, Trash2, Filter, Eye, EyeOff, Maximize2, Minimize2, Group, Hash, Volume2, VolumeX, BarChart3, TrendingUp, AreaChart, Activity, Database, ZoomIn, ZoomOut, RotateCcw })),
    provideToastr(),
  ],
};
