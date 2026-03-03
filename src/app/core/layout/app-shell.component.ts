import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '../services/session.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <aside class="shell-sidebar">
        <a class="brand" routerLink="/calendar">
          <span class="brand-mark">JL</span>
          <div>
            <strong>JobLedger</strong>
            <small>Contractor operations</small>
          </div>
        </a>

        <nav class="shell-nav">
          @for (link of links; track link.path) {
            <a
              class="shell-link"
              [routerLink]="link.path"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: link.exact ?? false }"
            >
              <span>{{ link.label }}</span>
              <small>{{ link.caption }}</small>
            </a>
          }
        </nav>

        <div class="shell-footer">
          <span>{{ session.currentUser()?.email || 'Signed in' }}</span>
          <button type="button" class="secondary-button" (click)="signOut()">Sign out</button>
        </div>
      </aside>

      <main class="shell-main">
        <header class="topbar">
          <div>
            <p class="eyebrow">JobLedger</p>
            <h1 class="page-title">Keep jobs, invoices, and history in one place.</h1>
          </div>

          <a class="primary-button" routerLink="/jobs/new">New job</a>
        </header>

        <router-outlet />
      </main>
    </div>
  `
})
export class AppShellComponent {
  readonly session = inject(SessionService);
  readonly links = [
    { path: '/calendar', label: 'Calendar', caption: 'Schedule and current work', exact: true },
    { path: '/clients', label: 'Clients', caption: 'Billing and service records' },
    { path: '/invoices', label: 'Invoices', caption: 'Draft, issued, and paid' },
    { path: '/history', label: 'History', caption: 'Long-term archive search' },
    { path: '/settings', label: 'Settings', caption: 'Business profile and numbering' }
  ];

  async signOut(): Promise<void> {
    await this.session.signOut();
  }
}
