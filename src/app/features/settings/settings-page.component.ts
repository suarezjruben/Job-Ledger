import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { AppI18nService, AppLanguage } from '../../core/services/app-i18n.service';
import { BusinessProfileRepository } from '../../core/services/business-profile.repository';
import { APP_THEMES, AppTheme, ThemeService } from '../../core/services/theme.service';
import { BusinessProfile } from '../../core/models';
import { valueOrUndefined } from '../../core/utils/object.utils';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-grid">
      <article class="panel stack-lg">
        <div class="page-header">
          <div>
            <p class="eyebrow">{{ 'settings.profile.eyebrow' | translate }}</p>
            <h2>{{ 'settings.profile.title' | translate }}</h2>
          </div>
          <span class="page-note">{{ 'settings.profile.note' | translate }}</span>
        </div>

        <form class="stack-lg" [formGroup]="form" (ngSubmit)="save()">
          <div class="grid-two">
            <label class="field">
              <span>{{ 'settings.profile.fields.businessName' | translate }}</span>
              <input type="text" formControlName="businessName" />
            </label>
            <label class="field">
              <span>{{ 'settings.profile.fields.contactEmail' | translate }}</span>
              <input type="email" formControlName="contactEmail" />
            </label>
          </div>

          <div class="grid-two">
            <label class="field">
              <span>{{ 'settings.profile.fields.phone' | translate }}</span>
              <input type="tel" formControlName="phone" />
            </label>
            <label class="field">
              <span>{{ 'settings.profile.fields.invoicePrefix' | translate }}</span>
              <input type="text" formControlName="invoicePrefix" maxlength="10" />
            </label>
          </div>

          <div class="grid-two">
            <label class="field">
              <span>{{ 'settings.profile.fields.nextInvoiceSequence' | translate }}</span>
              <input type="number" min="1" formControlName="nextInvoiceSequence" />
            </label>
            <label class="field">
              <span>{{ 'settings.profile.fields.line1' | translate }}</span>
              <input type="text" formControlName="line1" />
            </label>
          </div>

          <div class="grid-two">
            <label class="field">
              <span>{{ 'settings.profile.fields.line2' | translate }}</span>
              <input type="text" formControlName="line2" />
            </label>
            <label class="field">
              <span>{{ 'settings.profile.fields.city' | translate }}</span>
              <input type="text" formControlName="city" />
            </label>
          </div>

          <div class="grid-two">
            <label class="field">
              <span>{{ 'settings.profile.fields.state' | translate }}</span>
              <input type="text" formControlName="state" />
            </label>
            <label class="field">
              <span>{{ 'settings.profile.fields.postalCode' | translate }}</span>
              <input type="text" formControlName="postalCode" />
            </label>
          </div>

          @if (message()) {
            <p class="success-text">{{ message() }}</p>
          }

          @if (error()) {
            <p class="error-text">{{ error() }}</p>
          }

          <div class="actions">
            <button type="submit" class="primary-button" [disabled]="saving()">
              {{
                saving()
                  ? ('settings.profile.saving' | translate)
                  : ('settings.profile.save' | translate)
              }}
            </button>
          </div>
        </form>
      </article>

      <article class="panel stack-lg">
        <div class="page-header">
          <div>
            <p class="eyebrow">{{ 'settings.preferences.eyebrow' | translate }}</p>
            <h2>{{ 'settings.preferences.title' | translate }}</h2>
          </div>
          <span class="page-note">{{ 'settings.preferences.note' | translate }}</span>
        </div>

        <div class="stack-lg">
          <div class="field">
            <span>{{ 'preferences.theme.label' | translate }}</span>

            <div class="preference-toggle">
              @for (theme of themes; track theme) {
                <button
                  type="button"
                  class="segmented-button"
                  [class.active]="themeService.theme() === theme"
                  (click)="setTheme(theme)"
                >
                  {{ ('preferences.theme.options.' + theme) | translate }}
                </button>
              }
            </div>

            <p class="page-note">{{ 'preferences.theme.help' | translate }}</p>
          </div>

          <label class="field">
            <span>{{ 'preferences.language.label' | translate }}</span>
            <select [value]="i18n.language()" (change)="setLanguage(($any($event.target)).value)">
              @for (language of i18n.languages; track language.code) {
                <option [value]="language.code" [selected]="i18n.language() === language.code">
                  {{ ('preferences.language.options.' + language.code) | translate }}
                </option>
              }
            </select>
          </label>

          <p class="page-note">{{ 'settings.preferences.storageHint' | translate }}</p>
        </div>
      </article>
    </section>
  `,
  styles: [
    `
      .preference-toggle {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        padding: 0.35rem;
        border-radius: 999px;
        background: var(--surface-nav);
      }

      .segmented-button {
        border: 0;
        background: transparent;
        color: var(--text-muted);
        border-radius: 999px;
        padding: 0.75rem 1rem;
        font: inherit;
        font-weight: 700;
      }

      .segmented-button.active {
        background: var(--accent);
        color: var(--accent-ink);
      }
    `
  ]
})
export class SettingsPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly businessProfiles = inject(BusinessProfileRepository);
  readonly i18n = inject(AppI18nService);
  readonly themeService = inject(ThemeService);
  readonly themes = APP_THEMES;

  readonly profile = toSignal(this.businessProfiles.observeProfile(), { initialValue: null });
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');

  readonly form = this.fb.group({
    businessName: ['', Validators.required],
    contactEmail: ['', [Validators.required, Validators.email]],
    phone: [''],
    invoicePrefix: ['INV', Validators.required],
    nextInvoiceSequence: [1, [Validators.required, Validators.min(1)]],
    line1: [''],
    line2: [''],
    city: [''],
    state: [''],
    postalCode: ['']
  });

  constructor() {
    effect(() => {
      const profile = this.profile();

      if (!profile) {
        return;
      }

      this.form.patchValue({
        businessName: profile.businessName,
        contactEmail: profile.contactEmail,
        phone: profile.phone ?? '',
        invoicePrefix: profile.invoicePrefix ?? 'INV',
        nextInvoiceSequence: profile.nextInvoiceSequence ?? 1,
        line1: profile.mailingAddress?.line1 ?? '',
        line2: profile.mailingAddress?.line2 ?? '',
        city: profile.mailingAddress?.city ?? '',
        state: profile.mailingAddress?.state ?? '',
        postalCode: profile.mailingAddress?.postalCode ?? ''
      });
    });
  }

  async save(): Promise<void> {
    this.message.set('');
    this.error.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);

    try {
      const value = this.form.getRawValue();
      const businessName = value.businessName ?? '';
      const contactEmail = value.contactEmail ?? '';
      const invoicePrefix = value.invoicePrefix ?? 'INV';
      const line1 = value.line1 ?? '';
      const city = value.city ?? '';
      const state = value.state ?? '';
      const postalCode = value.postalCode ?? '';
      const profile: BusinessProfile = {
        businessName: businessName.trim(),
        contactEmail: contactEmail.trim(),
        phone: valueOrUndefined(value.phone),
        invoicePrefix: invoicePrefix.trim().toUpperCase() || 'INV',
        nextInvoiceSequence: Math.max(1, Number(value.nextInvoiceSequence) || 1),
        mailingAddress: line1.trim()
          ? {
              line1: line1.trim(),
              line2: valueOrUndefined(value.line2),
              city: city.trim(),
              state: state.trim(),
              postalCode: postalCode.trim()
            }
          : undefined
      };

      await this.businessProfiles.saveProfile(profile);
      this.message.set(this.i18n.instant('settings.profile.saved'));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('settings.profile.error'));
    } finally {
      this.saving.set(false);
    }
  }

  setTheme(theme: AppTheme): void {
    this.themeService.setTheme(theme);
  }

  setLanguage(language: AppLanguage): void {
    this.i18n.setLanguage(language);
  }
}
