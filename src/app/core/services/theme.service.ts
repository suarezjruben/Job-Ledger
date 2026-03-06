import { Injectable, effect, signal } from '@angular/core';

export const APP_THEMES = ['dark', 'light'] as const;

export type AppTheme = (typeof APP_THEMES)[number];

const THEME_STORAGE_KEY = 'jobledger.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<AppTheme>(this.readStoredTheme());

  constructor() {
    effect(() => {
      const theme = this.theme();

      if (typeof document !== 'undefined') {
        const root = document.documentElement;
        root.dataset['theme'] = theme;
        root.style.colorScheme = theme;

        const themeColor = theme === 'light' ? '#f4ecde' : '#08111b';
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
      }

      this.writeStoredTheme(theme);
    });
  }

  setTheme(theme: AppTheme): void {
    this.theme.set(theme);
  }

  private readStoredTheme(): AppTheme {
    if (typeof localStorage === 'undefined') {
      return 'dark';
    }

    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  }

  private writeStoredTheme(theme: AppTheme): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
}
