import { Injectable, effect, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

export const APP_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' }
] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number]['code'];

const LANGUAGE_STORAGE_KEY = 'jobledger.language';

@Injectable({ providedIn: 'root' })
export class AppI18nService {
  private readonly translate = inject(TranslateService);

  readonly languages = APP_LANGUAGES;
  readonly language = signal<AppLanguage>(this.readInitialLanguage());

  constructor() {
    this.translate.addLangs(this.languages.map((language) => language.code));
    void firstValueFrom(this.translate.setFallbackLang('en')).catch((error) => {
      console.error('Unable to load the fallback language.', error);
    });

    effect(() => {
      const language = this.language();

      if (typeof document !== 'undefined') {
        document.documentElement.lang = language;
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
      }

      void firstValueFrom(this.translate.use(language)).catch((error) => {
        console.error('Unable to load app translations.', error);
      });
    });
  }

  setLanguage(language: AppLanguage): void {
    if (this.languages.some((entry) => entry.code === language)) {
      this.language.set(language);
    }
  }

  instant(key: string, params?: Record<string, unknown>): string {
    this.language();
    const value = this.translate.instant(key, params);
    return typeof value === 'string' ? value : key;
  }

  currentLocale(): string {
    return this.language() === 'es' ? 'es-MX' : 'en-US';
  }

  private readInitialLanguage(): AppLanguage {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored === 'en' || stored === 'es') {
        return stored;
      }
    }

    if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('es')) {
      return 'es';
    }

    return 'en';
  }
}
