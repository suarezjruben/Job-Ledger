import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, of, switchMap } from 'rxjs';
import {
  ClientRecord,
  JOB_STATUSES,
  JobImageRecord,
  JobLineItem,
  JobRecord,
  JobStatus
} from '../../core/models';
import { JobImagesRepository } from '../../core/services/job-images.repository';
import { JobsRepository } from '../../core/services/jobs.repository';
import { ClientsRepository } from '../../core/services/clients.repository';
import { InvoiceWorkflowService } from '../../core/services/invoice-workflow.service';
import { calculateLineTotal, normalizeCents, toCurrency } from '../../core/utils/money.utils';
import { valueOrUndefined } from '../../core/utils/object.utils';

@Component({
  selector: 'app-job-form-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-grid">
      <article class="panel stack-lg">
        <div class="page-header">
          <div>
            <p class="eyebrow">Job record</p>
            <h2>{{ isEdit() ? 'Update job' : 'Create job' }}</h2>
          </div>

          @if (isEdit() && currentJob()) {
            <div class="actions wrap">
              @if (currentJob()!.invoiceId) {
                <a class="secondary-button" [routerLink]="['/invoices', currentJob()!.invoiceId]">View invoice</a>
              } @else if (canCreateInvoice()) {
                <button type="button" class="secondary-button" (click)="createInvoice()">
                  Create invoice
                </button>
              }

              @if (currentJob()!.archivedAt) {
                <button type="button" class="ghost-button" (click)="restoreJob()">Restore</button>
              } @else {
                <button type="button" class="ghost-button" (click)="archiveJob()">Archive</button>
              }
            </div>
          }
        </div>

        <form class="stack-lg" [formGroup]="form" (ngSubmit)="save()">
          <div class="grid-two">
            <label class="field">
              <span>Client</span>
              <select formControlName="clientId">
                <option value="">Select a client</option>
                @for (client of activeClients(); track client.id) {
                  <option [value]="client.id">{{ client.displayName }}</option>
                }
              </select>
            </label>

            <label class="field">
              <span>Job title</span>
              <input type="text" formControlName="title" />
            </label>
          </div>

          <div class="grid-three">
            <label class="field">
              <span>Start date</span>
              <input type="date" formControlName="startDate" />
            </label>
            <label class="field">
              <span>End date</span>
              <input type="date" formControlName="endDate" />
            </label>
            <label class="field">
              <span>Status</span>
              <select formControlName="status">
                @for (status of editableStatuses; track status) {
                  <option [value]="status">{{ prettyStatus(status) }}</option>
                }
              </select>
            </label>
          </div>

          <div class="grid-two">
            <label class="field">
              <span>Service address line 1</span>
              <input type="text" formControlName="line1" />
            </label>
            <label class="field">
              <span>Service address line 2</span>
              <input type="text" formControlName="line2" />
            </label>
          </div>

          <div class="grid-three">
            <label class="field">
              <span>City</span>
              <input type="text" formControlName="city" />
            </label>
            <label class="field">
              <span>State</span>
              <input type="text" formControlName="state" />
            </label>
            <label class="field">
              <span>Postal code</span>
              <input type="text" formControlName="postalCode" />
            </label>
          </div>

          <label class="field">
            <span>Description</span>
            <textarea rows="3" formControlName="description"></textarea>
          </label>

          <label class="field">
            <span>Internal notes</span>
            <textarea rows="3" formControlName="notes"></textarea>
          </label>

          <div class="stack-md">
            <div class="section-heading">
              <h3>Billable line items</h3>
              <button type="button" class="secondary-button" (click)="addLineItem()">Add line</button>
            </div>

            <div class="stack-md" formArrayName="lineItems">
              @for (lineItem of lineItems.controls; track lineItem; let i = $index) {
                <div class="line-item-grid" [formGroupName]="i">
                  <label class="field">
                    <span>Description</span>
                    <input type="text" formControlName="description" />
                  </label>

                  <label class="field">
                    <span>Kind</span>
                    <select formControlName="kind">
                      <option value="labor">Labor</option>
                      <option value="material">Material</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>

                  <label class="field">
                    <span>Unit label</span>
                    <input type="text" formControlName="unitLabel" />
                  </label>

                  <label class="field">
                    <span>Quantity</span>
                    <input type="number" min="0" step="0.25" formControlName="quantity" />
                  </label>

                  <label class="field">
                    <span>Rate (cents)</span>
                    <input type="number" min="0" step="1" formControlName="unitPriceCents" />
                  </label>

                  <div class="line-item-total">
                    <strong>{{ lineTotal(i) }}</strong>
                    <button type="button" class="ghost-button" (click)="removeLineItem(i)">Remove</button>
                  </div>
                </div>
              }
            </div>

            <div class="summary-row">
              <span>Subtotal</span>
              <strong>{{ subtotal() }}</strong>
            </div>
          </div>

          @if (message()) {
            <p class="success-text">{{ message() }}</p>
          }

          @if (error()) {
            <p class="error-text">{{ error() }}</p>
          }

          <div class="actions wrap">
            <button type="submit" class="primary-button" [disabled]="saving()">
              {{ saving() ? 'Saving...' : isEdit() ? 'Save job' : 'Create job' }}
            </button>
            <a class="ghost-button" routerLink="/calendar">Cancel</a>
          </div>
        </form>
      </article>

      <aside class="panel stack-lg">
        <div class="page-header">
          <div>
            <p class="eyebrow">Job photos</p>
            <h2>Private image storage</h2>
          </div>
          <span class="page-note">{{ images().length }}/10 images</span>
        </div>

        @if (!isEdit()) {
          <div class="empty-state compact">
            <h3>Save the job first</h3>
            <p>Photos are stored against an existing job record.</p>
          </div>
        } @else {
          <label class="field">
            <span>Upload photo</span>
            <input type="file" accept="image/*" (change)="uploadImage($event)" />
          </label>

          <div class="stack-sm">
            @for (image of images(); track image.id) {
              <article class="image-row">
                @if (thumbUrls()[image.id]; as thumbUrl) {
                  <img class="image-thumb" [src]="thumbUrl" alt="Job photo thumbnail" loading="lazy" />
                } @else {
                  <div class="image-thumb placeholder">Preview</div>
                }
                <div>
                  <strong>{{ image.width }} x {{ image.height }}</strong>
                  <p>{{ image.totalBytes / 1024 | number:'1.0-0' }} KB (thumb + display)</p>
                </div>
                <div class="actions wrap">
                  <button type="button" class="secondary-button" (click)="openImage(image)">
                    Open
                  </button>
                  <button type="button" class="ghost-button" (click)="deleteImage(image)">
                    Delete
                  </button>
                </div>
              </article>
            } @empty {
              <div class="empty-state compact">
                <h3>No job photos yet</h3>
                <p>Upload a photo to generate secure thumb and display versions.</p>
              </div>
            }
          </div>
        }
      </aside>
    </section>
  `,
  styles: [
    `
      .line-item-grid {
        display: grid;
        grid-template-columns: 2fr repeat(4, minmax(0, 1fr)) auto;
        gap: 0.85rem;
        align-items: end;
        padding: 1rem;
        border-radius: 1rem;
        background: rgba(15, 23, 42, 0.48);
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

      .image-row {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: center;
        padding: 1rem;
        border-radius: 1rem;
        background: rgba(15, 23, 42, 0.48);
      }

      .image-row p {
        margin: 0.2rem 0 0;
      }

      .image-thumb {
        width: 64px;
        height: 64px;
        border-radius: 0.6rem;
        object-fit: cover;
        flex-shrink: 0;
      }

      .image-thumb.placeholder {
        display: grid;
        place-items: center;
        font-size: 0.72rem;
        color: var(--text-muted);
        border: 1px solid rgba(148, 163, 184, 0.26);
      }

      @media (max-width: 1100px) {
        .line-item-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `
  ]
})
export class JobFormPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly jobsRepository = inject(JobsRepository);
  private readonly clientsRepository = inject(ClientsRepository);
  private readonly imagesRepository = inject(JobImagesRepository);
  private readonly invoiceWorkflow = inject(InvoiceWorkflowService);
  private readonly thumbLoadingIds = new Set<string>();

  readonly editableStatuses = JOB_STATUSES.filter((status) => status !== 'archived');
  readonly saving = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly thumbUrls = signal<Record<string, string>>({});
  private readonly lastPatchedJobId = signal<string | null>(null);

  readonly jobId = toSignal(this.route.paramMap.pipe(map((params) => params.get('jobId'))), {
    initialValue: null
  });

  readonly currentJob = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('jobId')),
      switchMap((jobId) => (jobId ? this.jobsRepository.observeJob(jobId) : of(undefined)))
    ),
    { initialValue: undefined }
  );

  readonly images = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('jobId')),
      switchMap((jobId) => (jobId ? this.imagesRepository.observeImages(jobId) : of([])))
    ),
    { initialValue: [] as JobImageRecord[] }
  );

  readonly clients = toSignal(this.clientsRepository.observeClients(), {
    initialValue: [] as ClientRecord[]
  });

  readonly isEdit = computed(() => Boolean(this.jobId()));
  readonly activeClients = computed(() => this.clients().filter((client) => !client.archivedAt));

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
    const startDate = this.route.snapshot.queryParamMap.get('start') ?? '';
    const endDate = this.route.snapshot.queryParamMap.get('end') ?? startDate;

    if (!this.jobId()) {
      this.form.patchValue({
        startDate,
        endDate
      });
    }

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

  prettyStatus(status: string): string {
    return status.replace(/_/g, ' ');
  }

  canCreateInvoice(): boolean {
    const job = this.currentJob();
    return Boolean(job && job.status === 'completed' && !job.invoiceId);
  }

  async save(): Promise<void> {
    this.error.set('');
    this.message.set('');

    if (this.form.invalid) {
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
      this.error.set('The end date must be the same day or later than the start date.');
      return;
    }

    this.saving.set(true);

    try {
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

      if (this.isEdit() && this.jobId()) {
        await this.jobsRepository.updateJob(this.jobId()!, payload);
        this.message.set('Job saved.');
      } else {
        const jobId = await this.jobsRepository.createJob(payload);
        await this.router.navigate(['/jobs', jobId]);
        return;
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save job.');
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
      this.error.set('The linked client record could not be found.');
      return;
    }

    try {
      const invoiceId = await this.invoiceWorkflow.createDraftForJob(job, client);
      await this.router.navigate(['/invoices', invoiceId]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to create invoice.');
    }
  }

  async uploadImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const jobId = this.jobId();

    if (!file || !jobId) {
      return;
    }

    this.error.set('');

    try {
      await this.imagesRepository.uploadImage(jobId, file);
      input.value = '';
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to upload photo.');
    }
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
      this.error.set(error instanceof Error ? error.message : 'Unable to open photo.');
    }
  }

  async deleteImage(image: JobImageRecord): Promise<void> {
    const jobId = this.jobId();

    if (!jobId) {
      return;
    }

    if (!window.confirm('Delete this photo?')) {
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
      this.error.set(error instanceof Error ? error.message : 'Unable to delete photo.');
    }
  }

  async archiveJob(): Promise<void> {
    if (!this.jobId()) {
      return;
    }

    try {
      await this.jobsRepository.archiveJob(this.jobId()!);
      await this.router.navigate(['/calendar']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to archive job.');
    }
  }

  async restoreJob(): Promise<void> {
    if (!this.jobId()) {
      return;
    }

    try {
      await this.jobsRepository.restoreJob(this.jobId()!);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to restore job.');
    }
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

  private createLineItemGroup(lineItem?: Partial<JobLineItem>) {
    return this.fb.group({
      id: [lineItem?.id ?? crypto.randomUUID()],
      kind: [lineItem?.kind ?? 'labor', Validators.required],
      description: [lineItem?.description ?? '', Validators.required],
      quantity: [lineItem?.quantity ?? 1, [Validators.required, Validators.min(0)]],
      unitLabel: [lineItem?.unitLabel ?? 'hour', Validators.required],
      unitPriceCents: [lineItem?.unitPriceCents ?? 0, [Validators.required, Validators.min(0)]]
    });
  }

  private serializeLineItems(): JobLineItem[] {
    return this.lineItems.controls.map((control) => {
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
    });
  }
}
