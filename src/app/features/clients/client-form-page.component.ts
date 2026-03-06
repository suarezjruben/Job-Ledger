import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { map, of, switchMap } from 'rxjs';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { ClientsRepository } from '../../core/services/clients.repository';
import { ClientRecord } from '../../core/models';
import { valueOrUndefined } from '../../core/utils/object.utils';

@Component({
  selector: 'app-client-form-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-grid single">
      <article class="panel stack-lg">
        <div class="page-header">
          <div>
            <p class="eyebrow">{{ 'clients.form.eyebrow' | translate }}</p>
            <h2>{{ isEdit() ? ('clients.form.editTitle' | translate) : ('clients.form.createTitle' | translate) }}</h2>
          </div>
        </div>

        <form class="stack-lg" [formGroup]="form" (ngSubmit)="save()">
          <div class="grid-two">
            <label class="field">
              <span>{{ 'clients.form.fields.displayName' | translate }}</span>
              <input type="text" formControlName="displayName" />
            </label>
            <label class="field">
              <span>{{ 'clients.form.fields.companyName' | translate }}</span>
              <input type="text" formControlName="companyName" />
            </label>
          </div>

          <div class="grid-two">
            <label class="field">
              <span>{{ 'clients.form.fields.billingEmail' | translate }}</span>
              <input type="email" formControlName="billingEmail" />
            </label>
            <label class="field">
              <span>{{ 'clients.form.fields.phone' | translate }}</span>
              <input type="tel" formControlName="phone" />
            </label>
          </div>

          <div class="grid-two">
            <label class="field">
              <span>{{ 'clients.form.fields.billingLine1' | translate }}</span>
              <input type="text" formControlName="billingLine1" />
            </label>
            <label class="field">
              <span>{{ 'clients.form.fields.billingLine2' | translate }}</span>
              <input type="text" formControlName="billingLine2" />
            </label>
          </div>

          <div class="grid-three">
            <label class="field">
              <span>{{ 'clients.form.fields.billingCity' | translate }}</span>
              <input type="text" formControlName="billingCity" />
            </label>
            <label class="field">
              <span>{{ 'clients.form.fields.billingState' | translate }}</span>
              <input type="text" formControlName="billingState" />
            </label>
            <label class="field">
              <span>{{ 'clients.form.fields.billingPostalCode' | translate }}</span>
              <input type="text" formControlName="billingPostalCode" />
            </label>
          </div>

          <div class="grid-two">
            <label class="field">
              <span>{{ 'clients.form.fields.serviceLine1' | translate }}</span>
              <input type="text" formControlName="serviceLine1" />
            </label>
            <label class="field">
              <span>{{ 'clients.form.fields.serviceLine2' | translate }}</span>
              <input type="text" formControlName="serviceLine2" />
            </label>
          </div>

          <div class="grid-three">
            <label class="field">
              <span>{{ 'clients.form.fields.serviceCity' | translate }}</span>
              <input type="text" formControlName="serviceCity" />
            </label>
            <label class="field">
              <span>{{ 'clients.form.fields.serviceState' | translate }}</span>
              <input type="text" formControlName="serviceState" />
            </label>
            <label class="field">
              <span>{{ 'clients.form.fields.servicePostalCode' | translate }}</span>
              <input type="text" formControlName="servicePostalCode" />
            </label>
          </div>

          <label class="field">
            <span>{{ 'common.notes' | translate }}</span>
            <textarea rows="4" formControlName="notes"></textarea>
          </label>

          @if (error()) {
            <p class="error-text">{{ error() }}</p>
          }

          <div class="actions wrap">
            <button type="submit" class="primary-button" [disabled]="saving()">
              {{
                saving()
                  ? ('common.saving' | translate)
                  : isEdit()
                    ? ('clients.form.saveChanges' | translate)
                    : ('clients.form.createButton' | translate)
              }}
            </button>

            <a class="ghost-button" routerLink="/clients">{{ 'common.cancel' | translate }}</a>
          </div>
        </form>
      </article>
    </section>
  `
})
export class ClientFormPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly clientsRepository = inject(ClientsRepository);
  private readonly i18n = inject(AppI18nService);

  readonly saving = signal(false);
  readonly error = signal('');
  private readonly lastPatchedClientId = signal<string | null>(null);

  readonly clientId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('clientId'))),
    { initialValue: null }
  );

  readonly client = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('clientId')),
      switchMap((clientId) => (clientId ? this.clientsRepository.observeClient(clientId) : of(undefined)))
    ),
    { initialValue: undefined }
  );

  readonly isEdit = computed(() => Boolean(this.clientId()));

  readonly form = this.fb.group({
    displayName: ['', Validators.required],
    companyName: [''],
    billingEmail: ['', Validators.email],
    phone: [''],
    billingLine1: [''],
    billingLine2: [''],
    billingCity: [''],
    billingState: [''],
    billingPostalCode: [''],
    serviceLine1: [''],
    serviceLine2: [''],
    serviceCity: [''],
    serviceState: [''],
    servicePostalCode: [''],
    notes: ['']
  });

  constructor() {
    effect(() => {
      const client = this.client();

      if (!client || this.lastPatchedClientId() === client.id) {
        return;
      }

      this.lastPatchedClientId.set(client.id);
      this.form.patchValue({
        displayName: client.displayName,
        companyName: client.companyName ?? '',
        billingEmail: client.billingEmail ?? '',
        phone: client.phone ?? '',
        billingLine1: client.billingAddress?.line1 ?? '',
        billingLine2: client.billingAddress?.line2 ?? '',
        billingCity: client.billingAddress?.city ?? '',
        billingState: client.billingAddress?.state ?? '',
        billingPostalCode: client.billingAddress?.postalCode ?? '',
        serviceLine1: client.serviceAddress?.line1 ?? '',
        serviceLine2: client.serviceAddress?.line2 ?? '',
        serviceCity: client.serviceAddress?.city ?? '',
        serviceState: client.serviceAddress?.state ?? '',
        servicePostalCode: client.serviceAddress?.postalCode ?? '',
        notes: client.notes ?? ''
      });
    });
  }

  async save(): Promise<void> {
    this.error.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);

    try {
      const value = this.form.getRawValue();
      const displayName = value.displayName ?? '';
      const payload = {
        displayName: displayName.trim(),
        companyName: valueOrUndefined(value.companyName),
        billingEmail: valueOrUndefined(value.billingEmail),
        phone: valueOrUndefined(value.phone),
        billingAddress: this.buildAddress(
          value.billingLine1 ?? '',
          value.billingLine2 ?? '',
          value.billingCity ?? '',
          value.billingState ?? '',
          value.billingPostalCode ?? ''
        ),
        serviceAddress: this.buildAddress(
          value.serviceLine1 ?? '',
          value.serviceLine2 ?? '',
          value.serviceCity ?? '',
          value.serviceState ?? '',
          value.servicePostalCode ?? ''
        ),
        notes: valueOrUndefined(value.notes)
      };

      if (this.isEdit() && this.clientId()) {
        await this.clientsRepository.updateClient(this.clientId()!, payload);
      } else {
        const clientId = await this.clientsRepository.createClient(payload);
        await this.router.navigate(['/clients', clientId]);
        return;
      }

      await this.router.navigate(['/clients']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('clients.form.errors.save'));
    } finally {
      this.saving.set(false);
    }
  }

  private buildAddress(
    line1: string,
    line2: string,
    city: string,
    state: string,
    postalCode: string
  ): ClientRecord['billingAddress'] | undefined {
    if (!line1.trim()) {
      return undefined;
    }

    return {
      line1: line1.trim(),
      line2: valueOrUndefined(line2),
      city: city.trim(),
      state: state.trim(),
      postalCode: postalCode.trim()
    };
  }
}
