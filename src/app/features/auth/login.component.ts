import { ChangeDetectionStrategy, Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { FirebaseError } from 'firebase/app';
import { Router } from '@angular/router';
import { BusinessProfileRepository } from '../../core/services/business-profile.repository';
import { AppI18nService, AppLanguage } from '../../core/services/app-i18n.service';
import { SessionService } from '../../core/services/session.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="auth-page">
      <div class="auth-panel">
        <div class="auth-head">
          <p class="eyebrow">{{ 'app.name' | translate }}</p>

          <label class="language-picker">
            <span>{{ 'preferences.language.label' | translate }}</span>
            <select
              id="auth-language"
              name="authLanguage"
              [value]="i18n.language()"
              (change)="setLanguage(($any($event.target)).value)"
            >
              @for (language of i18n.languages; track language.code) {
                <option [value]="language.code" [selected]="i18n.language() === language.code">
                  {{ ('preferences.language.options.' + language.code) | translate }}
                </option>
              }
            </select>
          </label>
        </div>

        <h1>{{ 'auth.title' | translate }}</h1>
        <p class="auth-copy">
          {{ 'auth.copy' | translate }}
        </p>

        <div class="auth-toggle">
          <button
            type="button"
            class="segmented-button"
            [class.active]="mode() === 'sign-in'"
            (click)="setMode('sign-in')"
          >
            {{ 'auth.signInTab' | translate }}
          </button>
          <button
            type="button"
            class="segmented-button"
            [class.active]="mode() === 'sign-up'"
            (click)="setMode('sign-up')"
          >
            {{ 'auth.signUpTab' | translate }}
          </button>
        </div>

        <form class="stack-lg" [formGroup]="form" (ngSubmit)="submit()">
          <label class="field">
            <span>{{ 'auth.emailLabel' | translate }}</span>
            <input
              type="email"
              formControlName="email"
              [placeholder]="'auth.emailPlaceholder' | translate"
            />
          </label>

          <label class="field">
            <span>{{ 'auth.passwordLabel' | translate }}</span>
            <input
              type="password"
              formControlName="password"
              [placeholder]="'auth.passwordPlaceholder' | translate"
            />
          </label>

          @if (mode() === 'sign-up') {
            <label class="field">
              <span>{{ 'auth.confirmPasswordLabel' | translate }}</span>
              <input
                type="password"
                formControlName="confirmPassword"
                [placeholder]="'auth.confirmPasswordPlaceholder' | translate"
              />
            </label>
          }

          @if (error()) {
            <p class="error-text">{{ error() }}</p>
          }

          <button type="submit" class="primary-button wide" [disabled]="loading()">
            {{
              loading()
                ? ('auth.working' | translate)
                : mode() === 'sign-in'
                  ? ('auth.signInButton' | translate)
                  : ('auth.signUpButton' | translate)
            }}
          </button>
        </form>
      </div>
    </section>
  `,
  styles: [
    `
      .auth-page {
        min-height: calc(100vh - 6rem);
        display: grid;
        place-items: center;
        padding: 2rem 1.5rem 3rem;
      }

      .auth-panel {
        width: min(100%, 34rem);
        padding: 2rem;
        border-radius: 1.75rem;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        box-shadow: var(--shadow);
      }

      .auth-head {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 1rem;
      }

      .language-picker {
        display: grid;
        gap: 0.35rem;
        min-width: 9rem;
      }

      .language-picker span {
        color: var(--text-muted);
        font-size: 0.82rem;
      }

      h1 {
        margin: 0.5rem 0 0.75rem;
        font-size: clamp(2.2rem, 6vw, 3.2rem);
      }

      .auth-copy {
        color: var(--text-muted);
        margin-bottom: 1.5rem;
      }

      .auth-toggle {
        display: inline-flex;
        padding: 0.3rem;
        border-radius: 999px;
        background: var(--surface-nav);
        margin-bottom: 1.5rem;
      }

      .segmented-button {
        border: 0;
        background: transparent;
        color: var(--text-muted);
        border-radius: 999px;
        padding: 0.7rem 1rem;
        font: inherit;
        cursor: pointer;
      }

      .segmented-button.active {
        background: var(--accent);
        color: var(--accent-ink);
        font-weight: 700;
      }

      .wide {
        width: 100%;
      }
    `
  ]
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly businessProfiles = inject(BusinessProfileRepository);
  readonly i18n = inject(AppI18nService);

  readonly mode = signal<'sign-in' | 'sign-up'>('sign-in');
  readonly loading = signal(false);
  readonly error = signal('');

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['']
  });

  setMode(mode: 'sign-in' | 'sign-up'): void {
    this.mode.set(mode);
    this.error.set('');
  }

  setLanguage(language: AppLanguage): void {
    this.i18n.setLanguage(language);
  }

  async submit(): Promise<void> {
    this.error.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const email = this.form.controls.email.value?.trim() ?? '';
    const password = this.form.controls.password.value ?? '';
    const confirmPassword = this.form.controls.confirmPassword.value ?? '';

    if (this.mode() === 'sign-up' && password !== confirmPassword) {
      this.error.set(this.i18n.instant('auth.errors.passwordMismatch'));
      return;
    }

    this.loading.set(true);

    try {
      if (this.mode() === 'sign-in') {
        await this.session.signIn(email, password);
        await this.router.navigateByUrl('/calendar');
      } else {
        const user = await this.session.signUp(email, password);

        // Account creation should not be blocked by the first Firestore profile bootstrap.
        void this.businessProfiles.ensureDefaultProfileForUid(user.uid, user.email ?? email).catch((error) => {
          console.error('Unable to bootstrap the default business profile after signup.', error);
        });

        await this.router.navigateByUrl('/settings');
      }
    } catch (error) {
      this.error.set(this.toAuthErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private toAuthErrorMessage(error: unknown): string {
    if (!(error instanceof FirebaseError)) {
      return error instanceof Error ? error.message : this.i18n.instant('auth.errors.generic');
    }

    if (this.mode() === 'sign-in') {
      if (
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/invalid-login-credentials' ||
        error.code === 'auth/user-not-found'
      ) {
        return this.i18n.instant('auth.errors.accountNotFound');
      }

      if (error.code === 'auth/too-many-requests') {
        return this.i18n.instant('auth.errors.tooManyRequests');
      }
    }

    if (this.mode() === 'sign-up') {
      if (error.code === 'auth/email-already-in-use') {
        return this.i18n.instant('auth.errors.emailInUse');
      }

      if (error.code === 'auth/weak-password') {
        return this.i18n.instant('auth.errors.weakPassword');
      }
    }

    return this.i18n.instant('auth.errors.generic');
  }
}
