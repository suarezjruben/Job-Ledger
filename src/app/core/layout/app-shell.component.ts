import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionService } from '../services/session.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <aside class="shell-sidebar">
        <a class="brand" routerLink="/calendar">
          <span class="brand-mark">JL</span>
          <div>
            <strong>{{ 'app.name' | translate }}</strong>
            <small>{{ 'app.tagline' | translate }}</small>
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
              <span>{{ link.labelKey | translate }}</span>
              <small>{{ link.captionKey | translate }}</small>
            </a>
          }
        </nav>

        <div class="shell-footer">
          <span>{{ session.currentUser()?.email || ('shell.signedIn' | translate) }}</span>
          <button type="button" class="secondary-button" (click)="signOut()">
            {{ 'shell.signOut' | translate }}
          </button>
        </div>
      </aside>

      <main class="shell-main">
        <header class="topbar">
          <div>
            <p class="eyebrow">{{ 'app.name' | translate }}</p>
            <h1 class="page-title">{{ 'shell.pageTitle' | translate }}</h1>
          </div>

          <a class="primary-button" routerLink="/jobs/new">{{ 'shell.newJob' | translate }}</a>
        </header>

        <router-outlet />
      </main>
    </div>
  `
})
export class AppShellComponent {
  readonly session = inject(SessionService);
  readonly links = [
    {
      path: '/calendar',
      labelKey: 'nav.calendar.label',
      captionKey: 'nav.calendar.caption',
      exact: true
    },
    { path: '/clients', labelKey: 'nav.clients.label', captionKey: 'nav.clients.caption' },
    { path: '/invoices', labelKey: 'nav.invoices.label', captionKey: 'nav.invoices.caption' },
    { path: '/history', labelKey: 'nav.history.label', captionKey: 'nav.history.caption' },
    { path: '/settings', labelKey: 'nav.settings.label', captionKey: 'nav.settings.caption' }
  ];

  async signOut(): Promise<void> {
    await this.session.signOut();
  }
}
