import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter, fromEvent, map, merge, startWith } from 'rxjs';
import { SessionService } from '../services/session.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="shell"
      [class.portrait-shell]="isPortraitShell()"
      [class.landscape-compact-shell]="isLandscapeCompactShell()"
      [class.rail-collapsed]="isSidebarCollapsed()"
    >
      @if (!isPortraitShell()) {
        <aside
          class="shell-sidebar"
          [class.collapsed]="isSidebarCollapsed()"
        >
          @if (canCollapseSidebar()) {
            <button
              type="button"
              class="shell-edge-toggle"
              [class.desktop-handle]="!isCompactShell()"
              (click)="toggleNavigation()"
              [attr.aria-label]="
                (isSidebarCollapsed() ? 'shell.expandNavigation' : 'shell.collapseNavigation') | translate
              "
              [title]="
                (isSidebarCollapsed() ? 'shell.expandNavigation' : 'shell.collapseNavigation') | translate
              "
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path [attr.d]="isSidebarCollapsed() ? expandIcon : collapseIcon"></path>
              </svg>
            </button>
          }

          <div class="shell-sidebar-scroll">
            <div class="sidebar-header">
              <a class="brand" routerLink="/calendar" (click)="handleLinkActivated()">
                <span class="brand-mark">JL</span>
                <div class="brand-copy">
                  <strong>{{ 'app.name' | translate }}</strong>
                  <small>{{ 'app.tagline' | translate }}</small>
                </div>
              </a>
            </div>

            <nav class="shell-nav">
              @for (link of links; track link.path) {
                <a
                  class="shell-link"
                  [routerLink]="link.path"
                  routerLinkActive="active"
                  [routerLinkActiveOptions]="{ exact: link.exact ?? false }"
                  (click)="handleLinkActivated()"
                  [title]="link.labelKey | translate"
                >
                  <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path [attr.d]="link.iconPath"></path>
                  </svg>

                  <div class="nav-copy">
                    <span>{{ link.labelKey | translate }}</span>
                    <small>{{ link.captionKey | translate }}</small>
                  </div>
                </a>
              }
            </nav>

            <div class="shell-footer">
              @if (isSidebarCollapsed()) {
                <button
                  type="button"
                  class="icon-button rail-action"
                  (click)="signOut()"
                  [attr.aria-label]="'shell.signOut' | translate"
                  [title]="'shell.signOut' | translate"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path [attr.d]="signOutIcon"></path>
                  </svg>
                </button>
              } @else {
                <button type="button" class="secondary-button shell-signout-button" (click)="signOut()">
                  <span class="shell-signout-label">{{ 'shell.signOut' | translate }}</span>
                  <span class="shell-footer-text">{{ session.currentUser()?.email || ('shell.signedIn' | translate) }}</span>
                </button>
              }
            </div>
          </div>
        </aside>
      }

      <main class="shell-main">
        @if (isPortraitShell()) {
          <header class="mobile-topbar" [class.expanded]="navOpen()">
            <div class="mobile-topbar-bar">
              <a class="mobile-brand" routerLink="/calendar" (click)="closeTransientUi()">
                <span class="brand-mark">JL</span>
                <strong>{{ 'app.name' | translate }}</strong>
              </a>

              <div class="mobile-toolbar-actions">
                <button
                  type="button"
                  class="icon-button accent"
                  (click)="toggleNavigation()"
                  [attr.aria-expanded]="navOpen()"
                  [attr.aria-label]="(navOpen() ? 'shell.closeNavigation' : 'shell.openNavigation') | translate"
                  [title]="(navOpen() ? 'shell.closeNavigation' : 'shell.openNavigation') | translate"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path [attr.d]="navOpen() ? closeIcon : menuIcon"></path>
                  </svg>
                </button>
              </div>
            </div>

            @if (navOpen()) {
              <div class="mobile-topbar-panel">
                <nav class="mobile-topbar-nav">
                  @for (link of links; track link.path) {
                    <a
                      class="shell-link mobile-shell-link"
                      [routerLink]="link.path"
                      routerLinkActive="active"
                      [routerLinkActiveOptions]="{ exact: link.exact ?? false }"
                      (click)="handleLinkActivated()"
                      [title]="link.labelKey | translate"
                    >
                      <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path [attr.d]="link.iconPath"></path>
                      </svg>

                      <div class="nav-copy">
                        <span>{{ link.labelKey | translate }}</span>
                        <small>{{ link.captionKey | translate }}</small>
                      </div>
                    </a>
                  }
                </nav>

                <div class="mobile-topbar-footer">
                  <button type="button" class="secondary-button shell-signout-button" (click)="signOut()">
                    <span class="shell-signout-label">{{ 'shell.signOut' | translate }}</span>
                    <span class="shell-footer-text">{{ session.currentUser()?.email || ('shell.signedIn' | translate) }}</span>
                  </button>
                </div>
              </div>
            }
          </header>
        } @else {
          <header class="topbar">
            <div class="topbar-leading">
              <div>
                <p class="eyebrow">{{ 'app.name' | translate }}</p>
                <h1 class="page-title">{{ 'shell.pageTitle' | translate }}</h1>
              </div>
            </div>
          </header>
        }

        <router-outlet />
      </main>
    </div>
  `,
  styles: [
    `
      .shell {
        --sidebar-width: 18rem;
        --sidebar-pad-block: clamp(0.75rem, 1.6vh, 1.5rem);
        --sidebar-pad-inline: clamp(0.75rem, 1.2vw, 1.5rem);
        --sidebar-gap: clamp(0.65rem, 1vh, 1.5rem);
        --sidebar-link-pad-y: clamp(0.55rem, 1vh, 0.95rem);
        --sidebar-link-pad-x: clamp(0.65rem, 0.9vw, 1rem);
        --sidebar-link-gap: clamp(0.55rem, 0.9vh, 0.85rem);
        --sidebar-brand-gap: clamp(0.55rem, 0.85vh, 0.9rem);
        --sidebar-brand-mark: clamp(2.2rem, 4.7vh, 2.8rem);
        --sidebar-footer-gap: clamp(0.45rem, 0.75vh, 0.8rem);
        display: grid;
        grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
        min-height: 100vh;
        transition: grid-template-columns 180ms ease;
      }

      .shell.landscape-compact-shell {
        --sidebar-width: 18rem;
      }

      .shell.rail-collapsed {
        --sidebar-width: 54px;
      }

      .shell.portrait-shell {
        grid-template-columns: 1fr;
      }

      .shell-sidebar {
        z-index: 50;
        display: block;
        overflow: visible;
      }

      .shell:not(.portrait-shell) .shell-sidebar {
        position: sticky;
        top: 0;
        height: 100vh;
      }

      .shell-sidebar-scroll {
        display: grid;
        grid-template-rows: auto 1fr auto;
        gap: var(--sidebar-gap);
        overflow: visible;
        overflow-x: visible;
        max-height: none;
      }

      .shell:not(.portrait-shell) .shell-sidebar-scroll {
        height: 100%;
        grid-template-rows: auto minmax(0, 1fr) auto;
        gap: clamp(0.3rem, 0.45vh, 0.55rem);
      }

      .shell:not(.portrait-shell) .shell-sidebar {
        padding: var(--sidebar-pad-block) var(--sidebar-pad-inline);
      }

      .sidebar-header {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: var(--sidebar-gap);
      }

      .brand {
        gap: var(--sidebar-brand-gap);
      }

      .brand-copy strong {
        display: block;
        font-size: clamp(0.92rem, 1.55vh, 1rem);
        line-height: 1.08;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .brand small {
        margin-top: clamp(0.05rem, 0.25vh, 0.2rem);
        font-size: clamp(0.7rem, 1.05vh, 0.8rem);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .brand-mark {
        width: var(--sidebar-brand-mark);
        height: var(--sidebar-brand-mark);
        border-radius: clamp(0.8rem, 1.1vh, 0.95rem);
        font-size: clamp(0.8rem, 1.45vh, 1rem);
      }

      .brand-copy,
      .nav-copy {
        min-width: 0;
      }

      .shell-link {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: var(--sidebar-link-gap);
        padding: var(--sidebar-link-pad-y) var(--sidebar-link-pad-x);
        min-block-size: clamp(3rem, 5vh, 4.1rem);
      }

      .shell-nav {
        gap: clamp(0.2rem, 0.5vh, 0.55rem);
      }

      .shell:not(.portrait-shell) .shell-nav {
        display: grid;
        grid-auto-rows: minmax(0, 1fr);
        align-content: stretch;
        gap: clamp(0.08rem, 0.18vh, 0.18rem);
        min-height: 0;
      }

      .nav-copy span {
        line-height: 1.12;
        font-size: clamp(1rem, 0.85vw + 0.5rem, 1.25rem);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nav-copy small {
        margin-top: clamp(0.05rem, 0.2vh, 0.2rem);
        font-size: clamp(0.84rem, 0.65vw + 0.35rem, 1rem);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .nav-icon,
      .icon-button svg {
        width: clamp(0.95rem, 2.6vh, 1.875rem);
        height: clamp(0.95rem, 2.6vh, 1.875rem);
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
        flex-shrink: 0;
      }

      .shell-sidebar .nav-icon,
      .shell-sidebar .icon-button svg {
        width: clamp(1.125rem, 2.6vh, 1.875rem);
        height: clamp(1.125rem, 2.6vh, 1.875rem);
      }

      .icon-button {
        width: 2.85rem;
        height: 2.85rem;
        border-radius: 999px;
        border: 1px solid var(--secondary-border);
        background: var(--surface-raised);
        color: var(--text);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      .icon-button.accent {
        background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
        color: var(--accent-ink);
        border-color: transparent;
      }

      .shell-edge-toggle {
        position: absolute;
        top: 50%;
        right: 0;
        z-index: 60;
        width: 0.95rem;
        height: 2.85rem;
        border: 1px solid var(--secondary-border);
        border-radius: 1rem;
        background: var(--surface-raised);
        color: var(--text);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        box-shadow: var(--shadow);
        transform: translate(50%, -50%);
        transition:
          width 180ms ease,
          border-radius 180ms ease,
          background 180ms ease;
      }

      .shell-edge-toggle svg {
        width: clamp(1.125rem, 2.4vh, 1.875rem);
        height: clamp(1.125rem, 2.4vh, 1.875rem);
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .shell-footer-text {
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: center;
        line-height: 1.12;
        font-size: clamp(0.74rem, 1.1vh, 0.9rem);
        white-space: nowrap;
      }

      .shell-signout-button {
        width: 100%;
        flex-direction: column;
        gap: 0;
        padding-block: 0.5rem;
      }

      .shell-signout-label {
        line-height: 1.08;
      }

      .topbar-leading {
        display: flex;
        align-items: start;
        gap: 0.85rem;
      }

      .mobile-topbar {
        position: sticky;
        top: 0;
        z-index: 40;
        display: grid;
        gap: 0.85rem;
        margin-bottom: 1rem;
        padding: 0.85rem 1rem;
        border-radius: 1.25rem;
        border: 1px solid var(--panel-border);
        background: var(--panel);
        box-shadow: var(--shadow);
        backdrop-filter: blur(24px);
      }

      .mobile-topbar.expanded {
        padding-bottom: 1rem;
      }

      .mobile-topbar-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }

      .mobile-brand {
        display: inline-flex;
        align-items: center;
        gap: 0.75rem;
        min-width: 0;
      }

      .mobile-toolbar-actions {
        position: relative;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin-left: auto;
      }

      .mobile-topbar-panel {
        display: grid;
        gap: 0.85rem;
        padding-top: 0.85rem;
        border-top: 1px solid var(--panel-border);
      }

      .mobile-topbar-nav {
        display: grid;
        gap: 0.45rem;
      }

      .mobile-shell-link {
        min-block-size: auto;
      }

      .mobile-topbar-footer {
        display: grid;
      }

      .shell:not(.portrait-shell) .shell-sidebar {
        transition: padding 180ms ease;
        padding-right: 0.75rem;
      }

      .shell:not(.portrait-shell) {
        --sidebar-pad-block: clamp(0.55rem, 1vh, 1rem);
        --sidebar-gap: clamp(0.3rem, 0.45vh, 0.55rem);
        --sidebar-link-pad-y: clamp(0.35rem, 0.55vh, 0.55rem);
        --sidebar-link-pad-x: clamp(0.55rem, 0.75vw, 0.8rem);
        --sidebar-link-gap: clamp(0.4rem, 0.5vh, 0.6rem);
        --sidebar-brand-gap: clamp(0.45rem, 0.55vh, 0.65rem);
        --sidebar-footer-gap: clamp(0.25rem, 0.35vh, 0.4rem);
      }

      .shell:not(.portrait-shell) .shell-link {
        min-block-size: auto;
        height: 100%;
      }

      .shell:not(.portrait-shell) .brand small,
      .shell:not(.portrait-shell) .nav-copy small {
        margin-top: 0;
      }

      .shell:not(.portrait-shell) .shell-sidebar.collapsed {
        padding-inline: 0;
      }

      .shell:not(.portrait-shell) .shell-sidebar.collapsed .brand {
        width: 100%;
        justify-content: center;
      }

      .shell:not(.portrait-shell) .shell-sidebar.collapsed .sidebar-header {
        justify-content: center;
      }

      .shell:not(.portrait-shell) .shell-sidebar.collapsed .brand-copy,
      .shell:not(.portrait-shell) .shell-sidebar.collapsed .nav-copy {
        display: none;
      }

      .shell:not(.portrait-shell) .shell-sidebar.collapsed .shell-nav {
        justify-items: center;
      }

      .shell:not(.portrait-shell) .shell-sidebar.collapsed .shell-link {
        width: min(100%, 54px);
        grid-template-columns: 1fr;
        justify-items: center;
        padding-inline: 0.5rem;
      }

      .shell:not(.portrait-shell) .shell-sidebar.collapsed .shell-footer {
        justify-items: center;
      }

      .rail-action {
        width: 100%;
      }

      .shell-footer {
        gap: var(--sidebar-footer-gap);
      }

      .shell-footer .secondary-button,
      .shell-footer .icon-button {
        min-height: clamp(2.35rem, 4.6vh, 2.85rem);
      }

      .shell-footer .icon-button {
        width: clamp(2.35rem, 4.6vh, 2.85rem);
        height: clamp(2.35rem, 4.6vh, 2.85rem);
      }

      @media (hover: hover) and (pointer: fine) {
        .shell-edge-toggle.desktop-handle:hover,
        .shell-edge-toggle.desktop-handle:focus-visible {
          width: 2.75rem;
          background: var(--panel);
        }
      }

      .shell.portrait-shell .shell-main {
        padding: 1rem;
      }

      .shell.portrait-shell {
        --sidebar-pad-block: clamp(0.8rem, 1.4vh, 1rem);
        --sidebar-pad-inline: clamp(0.8rem, 2vw, 1rem);
        --sidebar-gap: clamp(0.6rem, 0.95vh, 0.95rem);
        --sidebar-link-pad-y: clamp(0.55rem, 0.85vh, 0.8rem);
      }

      @media (max-width: 720px) {
        .mobile-topbar {
          padding-inline: 0.85rem;
        }
      }
    `
  ]
})
export class AppShellComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  readonly session = inject(SessionService);
  private readonly viewport = signal(this.readViewport());
  readonly navOpen = signal(false);
  readonly navCollapsed = signal(this.readViewport().width <= 1100 && this.readViewport().orientation === 'landscape');
  readonly links = [
    {
      path: '/calendar',
      labelKey: 'nav.calendar.label',
      captionKey: 'nav.calendar.caption',
      iconPath: 'M6 4.75v2.5M18 4.75v2.5M4.75 9.5h14.5M6.25 6.5h11.5a1.5 1.5 0 0 1 1.5 1.5v9.75a1.5 1.5 0 0 1-1.5 1.5H6.25a1.5 1.5 0 0 1-1.5-1.5V8a1.5 1.5 0 0 1 1.5-1.5Z',
      exact: true
    },
    {
      path: '/clients',
      labelKey: 'nav.clients.label',
      captionKey: 'nav.clients.caption',
      iconPath: 'M16.5 19.25v-1.5a3.25 3.25 0 0 0-3.25-3.25h-2.5a3.25 3.25 0 0 0-3.25 3.25v1.5M12 12.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5M18.75 8.5a2.25 2.25 0 0 1 0 4.5M5.25 8.5a2.25 2.25 0 0 0 0 4.5'
    },
    {
      path: '/invoices',
      labelKey: 'nav.invoices.label',
      captionKey: 'nav.invoices.caption',
      iconPath: 'M8 4.75h5.75l4 4v10.5H8a1.75 1.75 0 0 1-1.75-1.75V6.5A1.75 1.75 0 0 1 8 4.75Zm5.5 0v4.25h4.25M9.5 13h5M9.5 16.5h5'
    },
    {
      path: '/history',
      labelKey: 'nav.history.label',
      captionKey: 'nav.history.caption',
      iconPath: 'M12 5.25a6.75 6.75 0 1 0 6.75 6.75M12 8.25v4l2.75 1.75M12 3.75v1.5M20.25 12h-1.5'
    },
    {
      path: '/settings',
      labelKey: 'nav.settings.label',
      captionKey: 'nav.settings.caption',
      iconPath: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8 3.5-.85-.3a7.76 7.76 0 0 0-.53-1.28l.4-.82a.8.8 0 0 0-.15-.93l-1.54-1.54a.8.8 0 0 0-.93-.15l-.82.4c-.41-.22-.84-.4-1.28-.53l-.3-.85a.8.8 0 0 0-.76-.55h-2.18a.8.8 0 0 0-.76.55l-.3.85c-.44.13-.87.31-1.28.53l-.82-.4a.8.8 0 0 0-.93.15L5.13 8.67a.8.8 0 0 0-.15.93l.4.82c-.22.41-.4.84-.53 1.28l-.85.3a.8.8 0 0 0-.55.76v2.18c0 .34.22.64.55.76l.85.3c.13.44.31.87.53 1.28l-.4.82a.8.8 0 0 0 .15.93l1.54 1.54c.25.25.63.31.93.15l.82-.4c.41.22.84.4 1.28.53l.3.85c.12.33.42.55.76.55h2.18c.34 0 .64-.22.76-.55l.3-.85c.44-.13.87-.31 1.28-.53l.82.4c.3.16.68.1.93-.15l1.54-1.54a.8.8 0 0 0 .15-.93l-.4-.82c.22-.41.4-.84.53-1.28l.85-.3a.8.8 0 0 0 .55-.76v-2.18a.8.8 0 0 0-.55-.76Z'
    }
  ];
  readonly menuIcon = 'M4 7h16M4 12h16M4 17h16';
  readonly closeIcon = 'M6 6l12 12M18 6 6 18';
  readonly collapseIcon = 'M15 5 9 12l6 7';
  readonly expandIcon = 'M9 5l6 7-6 7';
  readonly settingsIcon =
    'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8 3.5-.85-.3a7.76 7.76 0 0 0-.53-1.28l.4-.82a.8.8 0 0 0-.15-.93l-1.54-1.54a.8.8 0 0 0-.93-.15l-.82.4c-.41-.22-.84-.4-1.28-.53l-.3-.85a.8.8 0 0 0-.76-.55h-2.18a.8.8 0 0 0-.76.55l-.3.85c-.44.13-.87.31-1.28.53l-.82-.4a.8.8 0 0 0-.93.15L5.13 8.67a.8.8 0 0 0-.15.93l.4.82c-.22.41-.4.84-.53 1.28l-.85.3a.8.8 0 0 0-.55.76v2.18c0 .34.22.64.55.76l.85.3c.13.44.31.87.53 1.28l-.4.82a.8.8 0 0 0 .15.93l1.54 1.54c.25.25.63.31.93.15l.82-.4c.41.22.84.4 1.28.53l.3.85c.12.33.42.55.76.55h2.18c.34 0 .64-.22.76-.55l.3-.85c.44-.13.87-.31 1.28-.53l.82.4c.3.16.68.1.93-.15l1.54-1.54a.8.8 0 0 0 .15-.93l-.4-.82c.22-.41.4-.84.53-1.28l.85-.3a.8.8 0 0 0 .55-.76v-2.18a.8.8 0 0 0-.55-.76Z';
  readonly signOutIcon = 'M10 17 5 12l5-5M5 12h9M13.5 5.25H17a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-3.5';

  readonly isCompactShell = computed(() => this.viewport().width <= 1100);
  readonly isPortraitShell = computed(
    () => this.isCompactShell() && this.viewport().orientation === 'portrait'
  );
  readonly isLandscapeCompactShell = computed(
    () => this.isCompactShell() && this.viewport().orientation === 'landscape'
  );
  readonly canCollapseSidebar = computed(() => !this.isPortraitShell());
  readonly isSidebarCollapsed = computed(() => this.canCollapseSidebar() && this.navCollapsed());

  constructor() {
    if (typeof window !== 'undefined') {
      merge(fromEvent(window, 'resize'), fromEvent(window, 'orientationchange'))
        .pipe(
          startWith(null),
          map(() => this.readViewport()),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe((viewport) => {
          this.viewport.set(viewport);
          this.syncViewportState(viewport);
        });
    }

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.closeTransientUi();
      });
  }

  async signOut(): Promise<void> {
    this.closeTransientUi();
    await this.session.signOut();
  }

  toggleNavigation(): void {
    if (this.isPortraitShell()) {
      this.navOpen.update((current) => !current);
      return;
    }

    if (this.canCollapseSidebar()) {
      this.navCollapsed.update((current) => !current);
    }
  }

  closeTransientUi(): void {
    this.navOpen.set(false);
  }

  handleLinkActivated(): void {
    this.closeTransientUi();
  }

  private readViewport(): { width: number; orientation: 'portrait' | 'landscape' } {
    if (typeof window === 'undefined') {
      return { width: 1440, orientation: 'landscape' };
    }

    return {
      width: window.innerWidth,
      orientation: window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape'
    };
  }

  private syncViewportState(viewport: {
    width: number;
    orientation: 'portrait' | 'landscape';
  }): void {
    const isCompact = viewport.width <= 1100;

    if (!(isCompact && viewport.orientation === 'portrait')) {
      this.navOpen.set(false);
    }
  }
}
