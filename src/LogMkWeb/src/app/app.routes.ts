import { Routes } from '@angular/router';

export const routes: Routes = [
     {
    path: '',
    pathMatch: 'full',
    redirectTo: 'log',
  },  {
    path: 'log',
    pathMatch: 'full',
    loadComponent: () =>
      import('./_pages/main-log-page/main-log-page.component').then((m) => m.MainLogPageComponent),
  },
];
