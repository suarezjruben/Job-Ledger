import { Routes } from '@angular/router';
import { authChildGuard, authGuard } from './core/guards/auth.guard';
import { loginGuard } from './core/guards/login.guard';
import { AppShellComponent } from './core/layout/app-shell.component';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [loginGuard],
    loadComponent: () =>
      import('./features/auth/login.component').then((module) => module.LoginComponent)
  },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    canActivateChild: [authChildGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'calendar' },
      {
        path: 'calendar',
        loadComponent: () =>
          import('./features/calendar/calendar-page.component').then(
            (module) => module.CalendarPageComponent
          )
      },
      {
        path: 'jobs/new',
        loadComponent: () =>
          import('./features/jobs/job-form-page.component').then(
            (module) => module.JobFormPageComponent
          )
      },
      {
        path: 'jobs/:jobId',
        loadComponent: () =>
          import('./features/jobs/job-form-page.component').then(
            (module) => module.JobFormPageComponent
          )
      },
      {
        path: 'clients',
        loadComponent: () =>
          import('./features/clients/client-list-page.component').then(
            (module) => module.ClientListPageComponent
          )
      },
      {
        path: 'clients/new',
        loadComponent: () =>
          import('./features/clients/client-form-page.component').then(
            (module) => module.ClientFormPageComponent
          )
      },
      {
        path: 'clients/:clientId',
        loadComponent: () =>
          import('./features/clients/client-form-page.component').then(
            (module) => module.ClientFormPageComponent
          )
      },
      {
        path: 'invoices',
        loadComponent: () =>
          import('./features/invoices/invoices-list-page.component').then(
            (module) => module.InvoicesListPageComponent
          )
      },
      {
        path: 'invoices/:invoiceId',
        loadComponent: () =>
          import('./features/invoices/invoice-detail-page.component').then(
            (module) => module.InvoiceDetailPageComponent
          )
      },
      {
        path: 'history',
        loadComponent: () =>
          import('./features/history/history-page.component').then(
            (module) => module.HistoryPageComponent
          )
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings-page.component').then(
            (module) => module.SettingsPageComponent
          )
      }
    ]
  },
  { path: '**', redirectTo: 'calendar' }
];
