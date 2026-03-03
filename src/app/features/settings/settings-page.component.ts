import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { BusinessProfileRepository } from '../../core/services/business-profile.repository';
import { BusinessProfile } from '../../core/models';
import { valueOrUndefined } from '../../core/utils/object.utils';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-grid">
      <article class="panel stack-lg">
        <div class="page-header">
          <div>
            <p class="eyebrow">Business profile</p>
            <h2>Invoice details and contact info</h2>
          </div>
          <span class="page-note">Used in every generated invoice PDF.</span>
        </div>

        <form class="stack-lg" [formGroup]="form" (ngSubmit)="save()">
          <div class="grid-two">
            <label class="field">
              <span>Business name</span>
              <input type="text" formControlName="businessName" />
            </label>
            <label class="field">
              <span>Contact email</span>
              <input type="email" formControlName="contactEmail" />
            </label>
          </div>

          <div class="grid-two">
            <label class="field">
              <span>Phone</span>
              <input type="tel" formControlName="phone" />
            </label>
            <label class="field">
              <span>Invoice prefix</span>
              <input type="text" formControlName="invoicePrefix" maxlength="10" />
            </label>
          </div>

          <div class="grid-two">
            <label class="field">
              <span>Next invoice sequence</span>
              <input type="number" min="1" formControlName="nextInvoiceSequence" />
            </label>
            <label class="field">
              <span>Mailing address line 1</span>
              <input type="text" formControlName="line1" />
            </label>
          </div>

          <div class="grid-two">
            <label class="field">
              <span>Mailing address line 2</span>
              <input type="text" formControlName="line2" />
            </label>
            <label class="field">
              <span>City</span>
              <input type="text" formControlName="city" />
            </label>
          </div>

          <div class="grid-two">
            <label class="field">
              <span>State</span>
              <input type="text" formControlName="state" />
            </label>
            <label class="field">
              <span>Postal code</span>
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
              {{ saving() ? 'Saving...' : 'Save settings' }}
            </button>
          </div>
        </form>
      </article>
    </section>
  `
})
export class SettingsPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly businessProfiles = inject(BusinessProfileRepository);

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
      this.message.set('Settings saved.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save settings.');
    } finally {
      this.saving.set(false);
    }
  }
}
