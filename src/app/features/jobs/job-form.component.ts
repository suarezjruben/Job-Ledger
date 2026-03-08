import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { of, switchMap } from 'rxjs';
import {
  ClientRecord,
  JOB_STATUSES,
  JobImageRecord,
  JobLineItem,
  JobStatus
} from '../../core/models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { ClientsRepository } from '../../core/services/clients.repository';
import { InvoiceWorkflowService } from '../../core/services/invoice-workflow.service';
import { JobImagesRepository } from '../../core/services/job-images.repository';
import { JobsRepository } from '../../core/services/jobs.repository';
import { calculateLineTotal, normalizeCents, toCurrency } from '../../core/utils/money.utils';
import { valueOrUndefined } from '../../core/utils/object.utils';

const MAX_JOB_IMAGES = 10;

interface StagedJobImage {
  id: string;
  file: File;
  previewUrl: string;
}

export interface JobFormSavedEvent {
  jobId: string;
  mode: 'create' | 'edit';
  queuedUploadError: string | null;
}

@Component({
  selector: 'app-job-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="stack-lg" [formGroup]="form" (ngSubmit)="save()">
      <div class="page-header job-form-header">
        <div class="job-form-header-copy">
          <p class="eyebrow">{{ 'jobs.form.eyebrow' | translate }}</p>
          <h2>{{ pageTitle() }}</h2>
        </div>

        <div class="actions wrap job-form-header-actions">
          @if (showExistingJobActions() && currentJob(); as job) {
            @if (job.invoiceId) {
              <a class="secondary-button" [routerLink]="['/invoices', job.invoiceId]">
                {{ 'jobs.form.viewInvoice' | translate }}
              </a>
            } @else if (canCreateInvoice()) {
              <button type="button" class="secondary-button" (click)="createInvoice()">
                {{ 'jobs.form.createInvoice' | translate }}
              </button>
            }

            @if (job.archivedAt) {
              <button type="button" class="ghost-button" (click)="restoreJob()">
                {{ 'common.restore' | translate }}
              </button>
            } @else {
              <button type="button" class="ghost-button" (click)="archiveJob()">
                {{ 'common.archive' | translate }}
              </button>
            }
          }

          <button type="button" class="ghost-button" (click)="requestClose()">
            {{ 'common.cancel' | translate }}
          </button>
          <button type="submit" class="primary-button" [disabled]="saving()">
            {{ submitLabel() }}
          </button>
        </div>
      </div>

      <div class="grid-two">
        <label class="field">
          <span>{{ 'common.client' | translate }}</span>
          <select id="job-client" name="jobClient" formControlName="clientId">
            <option value="">{{ 'jobs.form.selectClient' | translate }}</option>
            @for (client of activeClients(); track client.id) {
              <option [value]="client.id">{{ client.displayName }}</option>
            }
          </select>
        </label>

        <label class="field">
          <span>{{ 'jobs.form.fields.title' | translate }}</span>
          <input type="text" formControlName="title" />
        </label>
      </div>

      <div class="grid-three">
        <label class="field">
          <span>{{ 'jobs.form.fields.startDate' | translate }}</span>
          <input type="date" formControlName="startDate" />
        </label>
        <label class="field">
          <span>{{ 'jobs.form.fields.endDate' | translate }}</span>
          <input type="date" formControlName="endDate" />
        </label>
        <label class="field">
          <span>{{ 'common.status' | translate }}</span>
          <select id="job-status" name="jobStatus" formControlName="status">
            @for (status of editableStatuses; track status) {
              <option [value]="status">{{ ('jobStatus.' + status) | translate }}</option>
            }
          </select>
        </label>
      </div>

      <div class="grid-two">
        <label class="field">
          <span>{{ 'jobs.form.fields.line1' | translate }}</span>
          <input type="text" formControlName="line1" />
        </label>
        <label class="field">
          <span>{{ 'jobs.form.fields.line2' | translate }}</span>
          <input type="text" formControlName="line2" />
        </label>
      </div>

      <div class="grid-three">
        <label class="field">
          <span>{{ 'jobs.form.fields.city' | translate }}</span>
          <input type="text" formControlName="city" />
        </label>
        <label class="field">
          <span>{{ 'jobs.form.fields.state' | translate }}</span>
          <input type="text" formControlName="state" />
        </label>
        <label class="field">
          <span>{{ 'jobs.form.fields.postalCode' | translate }}</span>
          <input type="text" formControlName="postalCode" />
        </label>
      </div>

      <label class="field">
        <span>{{ 'common.description' | translate }}</span>
        <textarea rows="3" formControlName="description"></textarea>
      </label>

      <label class="field">
        <span>{{ 'jobs.form.fields.notes' | translate }}</span>
        <textarea rows="3" formControlName="notes"></textarea>
      </label>

      <div class="stack-md">
        <div class="section-heading">
          <h3>{{ 'jobs.form.lineItems.title' | translate }}</h3>
          <button type="button" class="secondary-button" (click)="addLineItem()">
            {{ 'jobs.form.lineItems.add' | translate }}
          </button>
        </div>

        <div class="stack-md" formArrayName="lineItems">
          @for (lineItem of lineItems.controls; track lineItem; let i = $index) {
            <div class="line-item-grid" [formGroupName]="i">
              <label class="field">
                <span>{{ 'common.description' | translate }}</span>
                <input type="text" formControlName="description" />
              </label>

              <label class="field">
                <span>{{ 'common.kind' | translate }}</span>
                <select
                  [attr.id]="'job-line-kind-' + i"
                  [attr.name]="'jobLineKind-' + i"
                  formControlName="kind"
                >
                  <option value="labor">{{ 'lineItemKinds.labor' | translate }}</option>
                  <option value="material">{{ 'lineItemKinds.material' | translate }}</option>
                  <option value="custom">{{ 'lineItemKinds.custom' | translate }}</option>
                </select>
              </label>

              <label class="field">
                <span>{{ 'common.unitLabel' | translate }}</span>
                <input type="text" formControlName="unitLabel" />
              </label>

              <label class="field">
                <span>{{ 'common.quantity' | translate }}</span>
                <input type="number" min="0" step="0.25" formControlName="quantity" />
              </label>

              <label class="field">
                <span>{{ 'common.rateCents' | translate }}</span>
                <input type="number" min="0" step="1" formControlName="unitPriceCents" />
              </label>

              <div class="line-item-total">
                <strong>{{ lineTotal(i) }}</strong>
                <button type="button" class="ghost-button" (click)="removeLineItem(i)">
                  {{ 'common.remove' | translate }}
                </button>
              </div>
            </div>
          }
        </div>

        <div class="summary-row">
          <span>{{ 'common.subtotal' | translate }}</span>
          <strong>{{ subtotal() }}</strong>
        </div>
      </div>

      @if (message()) {
        <p class="success-text">{{ message() }}</p>
      }

      @if (error()) {
        <p class="error-text">{{ error() }}</p>
      }

      <section class="job-photo-section stack-md">
        <div class="page-header">
          <div>
            <p class="eyebrow">{{ 'jobs.images.eyebrow' | translate }}</p>
            <h3>{{ 'jobs.images.title' | translate }}</h3>
          </div>
          <span class="page-note">{{ 'jobs.images.count' | translate:{ count: totalImageCount() } }}</span>
        </div>

        <div class="image-picker-strip">
          <label class="image-picker-tile" [title]="'jobs.images.uploadLabel' | translate">
            <input
              class="visually-hidden"
              type="file"
              accept="image/*"
              (change)="stageImage($event)"
            />
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path [attr.d]="plusIcon"></path>
            </svg>
          </label>

          @for (draft of stagedImages(); track draft.id) {
            <article class="image-staged-tile" [title]="draft.file.name">
              <img
                class="image-thumb"
                [src]="draft.previewUrl"
                [alt]="'jobs.images.thumbnailAlt' | translate"
                loading="lazy"
              />
              <button
                type="button"
                class="image-tile-remove"
                (click)="removeStagedImage(draft.id)"
                [attr.aria-label]="'common.delete' | translate"
                [title]="'common.delete' | translate"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path [attr.d]="closeIcon"></path>
                </svg>
              </button>
            </article>
          }

          @if (isEdit()) {
            @for (image of images(); track image.id) {
              <article class="image-staged-tile image-existing-tile" [title]="'common.open' | translate">
                @if (thumbUrls()[image.id]; as thumbUrl) {
                  <button
                    type="button"
                    class="image-tile-open"
                    (click)="openImage(image)"
                    [attr.aria-label]="'common.open' | translate"
                  >
                    <img
                      class="image-thumb"
                      [src]="thumbUrl"
                      [alt]="'jobs.images.thumbnailAlt' | translate"
                      loading="lazy"
                    />
                  </button>
                } @else {
                  <div class="image-thumb placeholder">{{ 'jobs.images.preview' | translate }}</div>
                }
                <button
                  type="button"
                  class="image-tile-remove"
                  (click)="deleteImage(image)"
                  [attr.aria-label]="'common.delete' | translate"
                  [title]="'common.delete' | translate"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path [attr.d]="closeIcon"></path>
                  </svg>
                </button>
              </article>
            }
          }
        </div>

        <p class="page-note">{{ 'jobs.images.pendingHint' | translate }}</p>

        @if (!isEdit() && !stagedImages().length) {
          <div class="empty-state compact">
            <h3>{{ 'jobs.images.empty.title' | translate }}</h3>
            <p>{{ 'jobs.images.pendingCreateBody' | translate }}</p>
          </div>
        } @else if (isEdit() && !images().length && !stagedImages().length) {
          <div class="empty-state compact">
            <h3>{{ 'jobs.images.empty.title' | translate }}</h3>
            <p>{{ 'jobs.images.empty.body' | translate }}</p>
          </div>
        }
      </section>

    </form>
  `,
  styles: [
    `
      .job-form-header {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        position: sticky;
        top: 0;
        z-index: 6;
        margin: 0 -1.4rem 0;
        padding: 0.85rem 1.4rem;
        background:
          linear-gradient(180deg, var(--panel) 0%, color-mix(in srgb, var(--panel) 92%, transparent) 100%);
        border-bottom: 1px solid var(--panel-border);
        backdrop-filter: blur(18px);
      }

      .job-form-header-copy {
        flex: 1 1 auto;
      }

      .job-form-header-actions {
        margin-left: auto;
        justify-content: flex-end;
        align-self: flex-start;
      }

      .line-item-grid {
        display: grid;
        grid-template-columns: 2fr repeat(4, minmax(0, 1fr)) auto;
        gap: 0.85rem;
        align-items: end;
        padding: 1rem;
        border-radius: 1rem;
        background: var(--surface-muted);
      }

      .line-item-total {
        display: grid;
        gap: 0.6rem;
        justify-items: end;
      }

      .summary-row {
        display: flex;
        justify-content: space-between;
        padding: 1rem 1.2rem;
        border-radius: 1rem;
        background: rgba(251, 191, 36, 0.12);
      }

      .job-photo-section {
        padding-top: 0.35rem;
        border-top: 1px solid var(--panel-border);
      }

      .image-picker-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-start;
      }

      .image-picker-tile,
      .image-staged-tile {
        position: relative;
        width: 64px;
        height: 64px;
        border-radius: 0.6rem;
        overflow: hidden;
        flex: 0 0 auto;
      }

      .image-picker-tile {
        display: grid;
        place-items: center;
        border: 1px dashed var(--secondary-border);
        background: var(--surface-muted);
        color: var(--text-muted);
        cursor: pointer;
      }

      .image-picker-tile svg,
      .image-tile-remove svg {
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .image-picker-tile svg {
        width: 1.35rem;
        height: 1.35rem;
        stroke-width: 1.9;
      }

      .image-staged-tile {
        border: 1px solid var(--secondary-border);
        background: var(--surface-muted);
      }

      .image-existing-tile {
        border-style: solid;
      }

      .image-tile-open {
        width: 100%;
        height: 100%;
        border: 0;
        padding: 0;
        background: transparent;
        cursor: pointer;
      }

      .image-thumb {
        width: 64px;
        height: 64px;
        border-radius: 0.6rem;
        object-fit: cover;
        flex-shrink: 0;
        display: block;
      }

      .image-thumb.placeholder {
        display: grid;
        place-items: center;
        font-size: 0.72rem;
        color: var(--text-muted);
        border: 1px solid var(--secondary-border);
      }

      .image-tile-remove {
        position: absolute;
        top: 0.2rem;
        right: 0.2rem;
        width: 1.4rem;
        height: 1.4rem;
        border: 0;
        border-radius: 999px;
        background: rgba(7, 16, 24, 0.72);
        color: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      .image-tile-remove svg {
        width: 0.8rem;
        height: 0.8rem;
        stroke-width: 2.1;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      @media (max-width: 1100px) {
        .job-form-header {
          flex-direction: row;
          align-items: flex-start;
        }

        .job-form-header-actions {
          justify-content: flex-end;
        }

        .job-form-header-actions .primary-button,
        .job-form-header-actions .ghost-button {
          min-width: 100px;
          padding: 0.75rem 0.9rem;
        }

        .line-item-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `
  ]
})
export class JobFormComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly jobsRepository = inject(JobsRepository);
  private readonly clientsRepository = inject(ClientsRepository);
  private readonly imagesRepository = inject(JobImagesRepository);
  private readonly invoiceWorkflow = inject(InvoiceWorkflowService);
  private readonly i18n = inject(AppI18nService);
  private readonly thumbLoadingIds = new Set<string>();
  private readonly lastPatchedJobId = signal<string | null>(null);
  private readonly lastAppliedCreateDefaults = signal<string | null>(null);
  private readonly consumedInitialError = signal<string | null>(null);

  readonly jobId = input<string | null>(null);
  readonly initialStartDate = input('');
  readonly initialEndDate = input('');
  readonly initialError = input<string | null>(null);
  readonly showExistingActions = input(false);

  readonly cancelled = output<void>();
  readonly saved = output<JobFormSavedEvent>();

  readonly editableStatuses = JOB_STATUSES.filter((status) => status !== 'archived');
  readonly saving = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly thumbUrls = signal<Record<string, string>>({});
  readonly stagedImages = signal<StagedJobImage[]>([]);

  readonly currentJob = toSignal(
    toObservable(this.jobId).pipe(
      switchMap((jobId) => (jobId ? this.jobsRepository.observeJob(jobId) : of(undefined)))
    ),
    { initialValue: undefined }
  );

  readonly images = toSignal(
    toObservable(this.jobId).pipe(
      switchMap((jobId) => (jobId ? this.imagesRepository.observeImages(jobId) : of([] as JobImageRecord[])))
    ),
    { initialValue: [] as JobImageRecord[] }
  );

  readonly clients = toSignal(this.clientsRepository.observeClients(), {
    initialValue: [] as ClientRecord[]
  });

  readonly isEdit = computed(() => Boolean(this.jobId()));
  readonly activeClients = computed(() => this.clients().filter((client) => !client.archivedAt));
  readonly pageTitle = computed(() =>
    this.isEdit() ? this.i18n.instant('jobs.form.editTitle') : this.i18n.instant('jobs.form.createTitle')
  );
  readonly submitLabel = computed(() => {
    if (this.saving()) {
      return this.i18n.instant('common.saving');
    }

    return this.isEdit() ? this.i18n.instant('jobs.form.save') : this.i18n.instant('jobs.form.create');
  });
  readonly showExistingJobActions = computed(
    () => Boolean(this.showExistingActions() && this.isEdit() && this.currentJob())
  );
  readonly totalImageCount = computed(() => this.images().length + this.stagedImages().length);
  readonly plusIcon = 'M12 5v14M5 12h14';
  readonly closeIcon = 'M6 6l12 12M18 6 6 18';

  readonly form = this.fb.group({
    clientId: ['', Validators.required],
    title: ['', Validators.required],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    status: ['scheduled', Validators.required],
    line1: [''],
    line2: [''],
    city: [''],
    state: [''],
    postalCode: [''],
    description: [''],
    notes: [''],
    lineItems: this.fb.array([this.createLineItemGroup()])
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.clearStagedImages());

    effect(() => {
      const initialError = this.initialError();

      if (!initialError || this.consumedInitialError() === initialError) {
        return;
      }

      this.error.set(initialError);
      this.consumedInitialError.set(initialError);
    });

    effect(() => {
      const job = this.currentJob();

      if (!job || this.lastPatchedJobId() === job.id) {
        return;
      }

      this.lastPatchedJobId.set(job.id);
      this.form.patchValue({
        clientId: job.clientId,
        title: job.title,
        startDate: job.startDate,
        endDate: job.endDate,
        status: job.status === 'archived' ? 'scheduled' : job.status,
        line1: job.address?.line1 ?? '',
        line2: job.address?.line2 ?? '',
        city: job.address?.city ?? '',
        state: job.address?.state ?? '',
        postalCode: job.address?.postalCode ?? '',
        description: job.description ?? '',
        notes: job.notes ?? ''
      });

      this.lineItems.clear();
      for (const lineItem of job.lineItems) {
        this.lineItems.push(this.createLineItemGroup(lineItem));
      }

      if (!job.lineItems.length) {
        this.lineItems.push(this.createLineItemGroup());
      }
    });

    effect(() => {
      const jobId = this.jobId();

      if (jobId) {
        this.lastAppliedCreateDefaults.set(null);
        return;
      }

      const startDate = this.initialStartDate();
      const endDate = this.initialEndDate() || startDate;
      const key = `${startDate}|${endDate}`;

      if (this.lastAppliedCreateDefaults() === key) {
        return;
      }

      this.form.patchValue({
        startDate,
        endDate
      });
      this.lastAppliedCreateDefaults.set(key);
    });

    effect(() => {
      const jobId = this.jobId();
      const imageEntries = this.images();

      if (!jobId) {
        this.thumbLoadingIds.clear();
        this.thumbUrls.set({});
        return;
      }

      const imageIds = new Set(imageEntries.map((entry) => entry.id));
      const currentThumbUrls = this.thumbUrls();
      const nextThumbUrls: Record<string, string> = {};
      let hasRemovedEntries = false;

      for (const [imageId, url] of Object.entries(currentThumbUrls)) {
        if (imageIds.has(imageId)) {
          nextThumbUrls[imageId] = url;
        } else {
          hasRemovedEntries = true;
          this.thumbLoadingIds.delete(imageId);
        }
      }

      const activeThumbUrls = hasRemovedEntries ? nextThumbUrls : currentThumbUrls;

      if (hasRemovedEntries) {
        this.thumbUrls.set(nextThumbUrls);
      }

      for (const image of imageEntries) {
        if (activeThumbUrls[image.id] || this.thumbLoadingIds.has(image.id)) {
          continue;
        }

        this.thumbLoadingIds.add(image.id);
        void this.loadThumb(jobId, image.id);
      }
    });
  }

  get lineItems(): FormArray {
    return this.form.get('lineItems') as FormArray;
  }

  addLineItem(): void {
    this.lineItems.push(this.createLineItemGroup());
  }

  removeLineItem(index: number): void {
    if (this.lineItems.length === 1) {
      this.lineItems.at(0).reset({
        kind: 'labor',
        description: '',
        quantity: 1,
        unitLabel: 'hour',
        unitPriceCents: 0
      });
      return;
    }

    this.lineItems.removeAt(index);
  }

  lineTotal(index: number): string {
    const group = this.lineItems.at(index);
    const quantity = Number(group.get('quantity')?.value ?? 0);
    const unitPriceCents = normalizeCents(group.get('unitPriceCents')?.value ?? 0);
    return toCurrency(calculateLineTotal(quantity, unitPriceCents));
  }

  subtotal(): string {
    return toCurrency(this.serializeLineItems().reduce((sum, lineItem) => sum + lineItem.totalCents, 0));
  }

  canCreateInvoice(): boolean {
    const job = this.currentJob();
    return Boolean(job && job.status === 'completed' && !job.invoiceId);
  }

  async save(): Promise<void> {
    this.error.set('');
    this.message.set('');

    if (this.form.invalid) {
      this.error.set(this.i18n.instant('jobs.form.errors.validation'));
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const clientId = value.clientId ?? '';
    const title = value.title ?? '';
    const startDate = value.startDate ?? '';
    const endDate = value.endDate ?? '';
    const line1 = value.line1 ?? '';
    const city = value.city ?? '';
    const state = value.state ?? '';
    const postalCode = value.postalCode ?? '';

    if (startDate > endDate) {
      this.error.set(this.i18n.instant('jobs.form.errors.dateOrder'));
      return;
    }

    this.saving.set(true);

    try {
      let activeJobId = this.jobId();
      const payload = {
        clientId,
        title: title.trim(),
        status: (value.status ?? 'scheduled') as JobStatus,
        startDate,
        endDate,
        address: line1.trim()
          ? {
              line1: line1.trim(),
              line2: valueOrUndefined(value.line2),
              city: city.trim(),
              state: state.trim(),
              postalCode: postalCode.trim()
            }
          : undefined,
        description: valueOrUndefined(value.description),
        notes: valueOrUndefined(value.notes),
        lineItems: this.serializeLineItems()
      };

      if (this.isEdit() && activeJobId) {
        await this.jobsRepository.updateJob(activeJobId, payload);

        const queuedUploadError = await this.uploadQueuedImages(activeJobId);
        this.message.set(this.i18n.instant('jobs.form.saved'));

        if (queuedUploadError) {
          this.error.set(queuedUploadError);
        }

        this.saved.emit({
          jobId: activeJobId,
          mode: 'edit',
          queuedUploadError
        });
      } else {
        activeJobId = await this.jobsRepository.createJob(payload);
        const queuedUploadError = await this.uploadQueuedImages(activeJobId);

        this.saved.emit({
          jobId: activeJobId,
          mode: 'create',
          queuedUploadError
        });
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('jobs.form.errors.save'));
    } finally {
      this.saving.set(false);
    }
  }

  async createInvoice(): Promise<void> {
    const job = this.currentJob();

    if (!job) {
      return;
    }

    const client = this.clients().find((entry) => entry.id === job.clientId);

    if (!client) {
      this.error.set(this.i18n.instant('jobs.form.errors.missingClient'));
      return;
    }

    try {
      const invoiceId = await this.invoiceWorkflow.createDraftForJob(job, client);
      await this.router.navigate(['/invoices', invoiceId]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('jobs.form.errors.createInvoice'));
    }
  }

  stageImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    this.error.set('');

    try {
      if (this.totalImageCount() >= MAX_JOB_IMAGES) {
        throw new Error(this.i18n.instant('jobs.images.errors.limit'));
      }

      this.imagesRepository.validateSourceFile(file);
      const previewUrl = URL.createObjectURL(file);

      this.stagedImages.update((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          file,
          previewUrl
        }
      ]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('jobs.images.errors.upload'));
    }
  }

  removeStagedImage(stagedImageId: string): void {
    const stagedImage = this.stagedImages().find((entry) => entry.id === stagedImageId);

    if (!stagedImage) {
      return;
    }

    this.revokePreviewUrl(stagedImage.previewUrl);
    this.stagedImages.update((current) => current.filter((entry) => entry.id !== stagedImageId));
  }

  async openImage(image: JobImageRecord): Promise<void> {
    const jobId = this.jobId();

    if (!jobId) {
      return;
    }

    this.error.set('');

    try {
      const url = await this.imagesRepository.getImageDownloadUrl(jobId, image.id, 'display');
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('jobs.images.errors.open'));
    }
  }

  async deleteImage(image: JobImageRecord): Promise<void> {
    const jobId = this.jobId();

    if (!jobId) {
      return;
    }

    if (!window.confirm(this.i18n.instant('jobs.images.confirmDelete'))) {
      return;
    }

    this.error.set('');

    try {
      await this.imagesRepository.deleteImage(jobId, image.id);
      this.thumbUrls.update((current) => {
        const next = { ...current };
        delete next[image.id];
        return next;
      });
      this.thumbLoadingIds.delete(image.id);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('jobs.images.errors.delete'));
    }
  }

  async archiveJob(): Promise<void> {
    const jobId = this.jobId();

    if (!jobId) {
      return;
    }

    try {
      await this.jobsRepository.archiveJob(jobId);
      await this.router.navigate(['/calendar']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('jobs.form.errors.archive'));
    }
  }

  async restoreJob(): Promise<void> {
    const jobId = this.jobId();

    if (!jobId) {
      return;
    }

    try {
      await this.jobsRepository.restoreJob(jobId);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('jobs.form.errors.restore'));
    }
  }

  requestClose(): void {
    this.cancelled.emit();
  }

  private async loadThumb(jobId: string, imageId: string): Promise<void> {
    try {
      const thumbUrl = await this.imagesRepository.getImageDownloadUrl(jobId, imageId, 'thumb');
      this.thumbUrls.update((current) => ({
        ...current,
        [imageId]: thumbUrl
      }));
    } catch {
      // Thumb URL fetch failures should not block the rest of the form.
    } finally {
      this.thumbLoadingIds.delete(imageId);
    }
  }

  private async uploadQueuedImages(jobId: string): Promise<string | null> {
    const queuedImages = this.stagedImages();

    if (!queuedImages.length) {
      return null;
    }

    try {
      for (const stagedImage of queuedImages) {
        await this.imagesRepository.uploadImage(jobId, stagedImage.file);
      }

      this.clearStagedImages();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : this.i18n.instant('jobs.images.errors.uploadAfterSave');
    }
  }

  private clearStagedImages(): void {
    for (const stagedImage of this.stagedImages()) {
      this.revokePreviewUrl(stagedImage.previewUrl);
    }

    this.stagedImages.set([]);
  }

  private createLineItemGroup(lineItem?: Partial<JobLineItem>) {
    return this.fb.group(
      {
        id: [lineItem?.id ?? crypto.randomUUID()],
        kind: [lineItem?.kind ?? 'labor', Validators.required],
        description: [lineItem?.description ?? ''],
        quantity: [lineItem?.quantity ?? 1, [Validators.required, Validators.min(0)]],
        unitLabel: [lineItem?.unitLabel ?? 'hour', Validators.required],
        unitPriceCents: [lineItem?.unitPriceCents ?? 0, [Validators.required, Validators.min(0)]]
      },
      {
        validators: [this.optionalLineItemValidator()]
      }
    );
  }

  private serializeLineItems(): JobLineItem[] {
    return this.lineItems.controls
      .map((control) => {
        const quantity = Number(control.get('quantity')?.value ?? 0);
        const unitPriceCents = normalizeCents(control.get('unitPriceCents')?.value ?? 0);

        return {
          id: control.get('id')?.value ?? crypto.randomUUID(),
          kind: control.get('kind')?.value,
          description: control.get('description')?.value?.trim() ?? '',
          quantity,
          unitLabel: control.get('unitLabel')?.value?.trim() ?? '',
          unitPriceCents,
          totalCents: calculateLineTotal(quantity, unitPriceCents)
        };
      })
      .filter((lineItem) => !this.isBlankLineItemValue(lineItem));
  }

  private optionalLineItemValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = {
        kind: control.get('kind')?.value,
        description: control.get('description')?.value,
        quantity: control.get('quantity')?.value,
        unitLabel: control.get('unitLabel')?.value,
        unitPriceCents: control.get('unitPriceCents')?.value
      };

      if (this.isBlankLineItemValue(value)) {
        return null;
      }

      return value.description?.trim() ? null : { descriptionRequired: true };
    };
  }

  private isBlankLineItemValue(value: Partial<JobLineItem>): boolean {
    const description = value.description?.trim() ?? '';
    const kind = value.kind ?? 'labor';
    const quantity = Number(value.quantity ?? 1);
    const unitLabel = value.unitLabel?.trim() ?? 'hour';
    const unitPriceCents = normalizeCents(value.unitPriceCents ?? 0);

    return !description && kind === 'labor' && quantity === 1 && unitLabel === 'hour' && unitPriceCents === 0;
  }

  private revokePreviewUrl(previewUrl: string): void {
    URL.revokeObjectURL(previewUrl);
  }
}
