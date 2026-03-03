import { ChangeDetectionStrategy, Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BusinessProfileRepository } from '../../core/services/business-profile.repository';
import { SessionService } from '../../core/services/session.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="auth-page">
      <div class="auth-panel">
        <p class="eyebrow">JobLedger</p>
        <h1>Contractor operations without the spreadsheet sprawl.</h1>
        <p class="auth-copy">
          Log work, keep the calendar honest, and generate invoice PDFs that stay tied to the job
          history.
        </p>

        <div class="auth-toggle">
          <button
            type="button"
            class="segmented-button"
            [class.active]="mode() === 'sign-in'"
            (click)="mode.set('sign-in')"
          >
            Sign in
          </button>
          <button
            type="button"
            class="segmented-button"
            [class.active]="mode() === 'sign-up'"
            (click)="mode.set('sign-up')"
          >
            Create account
          </button>
        </div>

        <form class="stack-lg" [formGroup]="form" (ngSubmit)="submit()">
          <label class="field">
            <span>Email</span>
            <input type="email" formControlName="email" placeholder="owner@jobledger.app" />
          </label>

          <label class="field">
            <span>Password</span>
            <input type="password" formControlName="password" placeholder="Minimum 6 characters" />
          </label>

          @if (mode() === 'sign-up') {
            <label class="field">
              <span>Confirm password</span>
              <input type="password" formControlName="confirmPassword" placeholder="Re-enter password" />
            </label>
          }

          @if (error()) {
            <p class="error-text">{{ error() }}</p>
          }

          <button type="submit" class="primary-button wide" [disabled]="loading()">
            {{ loading() ? 'Working...' : mode() === 'sign-in' ? 'Sign in' : 'Create account' }}
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
        background: rgba(15, 23, 42, 0.84);
        border: 1px solid rgba(148, 163, 184, 0.2);
        box-shadow: 0 32px 80px rgba(15, 23, 42, 0.35);
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
        background: rgba(30, 41, 59, 0.9);
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
        color: #071018;
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

  readonly mode = signal<'sign-in' | 'sign-up'>('sign-in');
  readonly loading = signal(false);
  readonly error = signal('');

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['']
  });

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
      this.error.set('Passwords do not match.');
      return;
    }

    this.loading.set(true);

    try {
      if (this.mode() === 'sign-in') {
        await this.session.signIn(email, password);
        await this.router.navigateByUrl('/calendar');
      } else {
        const user = await this.session.signUp(email, password);
        await this.businessProfiles.ensureDefaultProfileForUid(user.uid, user.email ?? email);
        await this.router.navigateByUrl('/settings');
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to complete that request.');
    } finally {
      this.loading.set(false);
    }
  }
}
