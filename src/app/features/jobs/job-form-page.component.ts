import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, of, switchMap } from 'rxjs';
import {
  ClientRecord,
  JOB_STATUSES,
  JobAttachmentRecord,
  JobLineItem,
  JobRecord,
  JobStatus
} from '../../core/models';
import { JobAttachmentsRepository } from '../../core/services/job-attachments.repository';
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
            <p class="eyebrow">Attachments</p>
            <h2>Photos and PDFs</h2>
          </div>
          <span class="page-note">{{ attachments().length }}/10 files</span>
        </div>

        @if (!isEdit()) {
          <div class="empty-state compact">
            <h3>Save the job first</h3>
            <p>Attachments are stored against an existing job record.</p>
          </div>
        } @else {
          <label class="field">
            <span>Upload image or PDF</span>
            <input type="file" accept="image/*,.pdf" (change)="uploadAttachment($event)" />
          </label>

          <div class="stack-sm">
            @for (attachment of attachments(); track attachment.id) {
              <article class="attachment-row">
                <div>
                  <strong>{{ attachment.fileName }}</strong>
                  <p>{{ attachment.kind }} | {{ attachment.sizeBytes / 1024 | number:'1.0-0' }} KB</p>
                </div>
                <div class="actions wrap">
                  <button type="button" class="secondary-button" (click)="downloadAttachment(attachment)">
                    Open
                  </button>
                  <button type="button" class="ghost-button" (click)="deleteAttachment(attachment)">
                    Delete
                  </button>
                </div>
              </article>
            } @empty {
              <div class="empty-state compact">
                <h3>No attachments yet</h3>
                <p>Store site photos, signed paperwork, or reference PDFs with the job.</p>
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

      .attachment-row {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: center;
        padding: 1rem;
        border-radius: 1rem;
        background: rgba(15, 23, 42, 0.48);
      }

      .attachment-row p {
        margin: 0.2rem 0 0;
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
  private readonly attachmentsRepository = inject(JobAttachmentsRepository);
  private readonly invoiceWorkflow = inject(InvoiceWorkflowService);

  readonly editableStatuses = JOB_STATUSES.filter((status) => status !== 'archived');
  readonly saving = signal(false);
  readonly message = signal('');
  readonly error = signal('');
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

  readonly attachments = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('jobId')),
      switchMap((jobId) => (jobId ? this.attachmentsRepository.observeAttachments(jobId) : of([])))
    ),
    { initialValue: [] as JobAttachmentRecord[] }
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

  async uploadAttachment(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file || !this.jobId()) {
      return;
    }

    try {
      await this.attachmentsRepository.uploadAttachment(this.jobId()!, file);
      input.value = '';
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to upload attachment.');
    }
  }

  async downloadAttachment(attachment: JobAttachmentRecord): Promise<void> {
    try {
      const url = await this.attachmentsRepository.getAttachmentDownloadUrl(attachment);
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to open attachment.');
    }
  }

  async deleteAttachment(attachment: JobAttachmentRecord): Promise<void> {
    if (!window.confirm(`Delete ${attachment.fileName}?`)) {
      return;
    }

    try {
      await this.attachmentsRepository.deleteAttachment(attachment);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to delete attachment.');
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
