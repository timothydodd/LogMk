import { Routes } from '@angular/router';
import { authGuard } from './_services/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'log',
  },
  {
    path: 'login',
    loadComponent: () => import('./_pages/login-page/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: 'log',
    pathMatch: 'full',
    loadComponent: () => import('./_pages/main-log-page/main-log-page.component').then((m) => m.MainLogPageComponent),
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    loadComponent: () => import('./_pages/settings-page/settings-page.component').then((m) => m.SettingsPageComponent),
    canActivate: [authGuard],
  },
];
