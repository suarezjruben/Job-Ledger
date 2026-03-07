import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { of, switchMap } from 'rxjs';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { ClientsRepository } from '../../core/services/clients.repository';
import { InvoicesRepository } from '../../core/services/invoices.repository';
import { JobImagesRepository } from '../../core/services/job-images.repository';
import { JobsRepository } from '../../core/services/jobs.repository';
import { InvoiceWorkflowService } from '../../core/services/invoice-workflow.service';
import {
  ClientRecord,
  InvoiceRecord,
  JobImageRecord,
  JobLineItem,
  JobRecord
} from '../../core/models';
import {
  addMonths,
  buildMonthGrid,
  formatDateRange,
  isDateWithinRange,
  monthLabel,
  startOfMonth,
  weekdayLabels as buildWeekdayLabels
} from '../../core/utils/date.utils';
import { toCurrency, sumLineItems } from '../../core/utils/money.utils';
import { JobFormComponent, JobFormSavedEvent } from '../jobs/job-form.component';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, JobFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-grid single">
      <article class="panel stack-lg calendar-panel">
        <div class="page-header">
          <div>
            <p class="eyebrow">{{ 'calendar.eyebrow' | translate }}</p>
            <h2>{{ monthTitle() }}</h2>
          </div>

          <div class="actions">
            <button type="button" class="secondary-button" (click)="shiftMonth(-1)">
              {{ 'common.previous' | translate }}
            </button>
            <button type="button" class="secondary-button" (click)="resetMonth()">
              {{ 'common.today' | translate }}
            </button>
            <button type="button" class="secondary-button" (click)="shiftMonth(1)">
              {{ 'common.next' | translate }}
            </button>
          </div>
        </div>

        <div class="calendar-legend">
          <span class="status-dot scheduled"></span> {{ 'jobStatus.scheduled' | translate }}
          <span class="status-dot completed"></span> {{ 'jobStatus.completed' | translate }}
          <span class="status-dot invoiced"></span> {{ 'jobStatus.invoiced' | translate }}
          <span class="status-dot canceled"></span> {{ 'jobStatus.canceled' | translate }}
        </div>

        <div class="calendar-grid" #calendarGrid>
          @if (showWeekdayHeadings()) {
            @for (label of weekdayLabels(); track label) {
              <div class="calendar-heading">{{ label }}</div>
            }
          }

          @for (cell of calendarCells(); track cell.isoDate) {
            <article
              class="calendar-cell"
              [class.outside-month]="!cell.inMonth"
              [class.today]="cell.isToday"
            >
              <span class="calendar-day">{{ cell.dayNumber }}</span>

              @for (job of cell.jobs; track job.id) {
                <button
                  type="button"
                  class="calendar-job"
                  [class.scheduled]="job.status === 'scheduled' || job.status === 'in_progress'"
                  [class.completed]="job.status === 'completed'"
                  [class.invoiced]="job.status === 'invoiced'"
                  [class.canceled]="job.status === 'canceled'"
                  (click)="selectJob(job, $event)"
                >
                  {{ job.title }}
                </button>
              }

              @if (cell.moreJobs > 0) {
                <span class="calendar-more">+{{ cell.moreJobs }} more</span>
              }

              <div class="calendar-cell-actions">
                <button
                  type="button"
                  class="calendar-new-job"
                  (click)="createJobForDate(cell.isoDate)"
                  [attr.aria-label]="'shell.newJob' | translate"
                  [title]="'shell.newJob' | translate"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path [attr.d]="newJobIcon"></path>
                  </svg>
                </button>
              </div>
            </article>
          }
        </div>

      </article>

    </section>

    <ng-template #selectedJobDetails let-job>
      <div class="page-header calendar-dialog-header">
        <div>
          <p class="eyebrow">{{ 'calendar.selected.eyebrow' | translate }}</p>
          <h2>{{ job.title }}</h2>
        </div>
        <button
          type="button"
          class="secondary-button calendar-dialog-close"
          (click)="closeSelectedJob()"
          [attr.aria-label]="'common.close' | translate"
          [title]="'common.close' | translate"
        >
          <span class="calendar-dialog-close-label">{{ 'common.close' | translate }}</span>
          <svg class="calendar-dialog-close-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path [attr.d]="closeIcon"></path>
          </svg>
        </button>
      </div>

      @if (message()) {
        <p class="success-text">{{ message() }}</p>
      }

      @if (error()) {
        <p class="error-text">{{ error() }}</p>
      }

      <dl class="detail-list">
        <div>
          <dt>{{ 'common.client' | translate }}</dt>
          <dd>{{ clientName(job.clientId) }}</dd>
        </div>
        <div>
          <dt>{{ 'common.dates' | translate }}</dt>
          <dd>{{ formatDate(job) }}</dd>
        </div>
        <div>
          <dt>{{ 'common.status' | translate }}</dt>
          <dd class="status-text">{{ ('jobStatus.' + job.status) | translate }}</dd>
        </div>
        <div>
          <dt>{{ 'common.subtotal' | translate }}</dt>
          <dd>{{ subtotal(job) }}</dd>
        </div>
      </dl>

      <div class="stack-sm expandable-sections">
        @if (job.address) {
          <details class="detail-section">
            <summary>{{ 'common.address' | translate }}</summary>
            <div class="detail-section-body address-block">
              @for (line of addressLines(job); track line) {
                <p>{{ line }}</p>
              }
            </div>
          </details>
        }

        @if (job.description) {
          <details class="detail-section">
            <summary>{{ 'common.description' | translate }}</summary>
            <div class="detail-section-body">
              <p class="detail-section-copy preserve-linebreaks">{{ job.description }}</p>
            </div>
          </details>
        }

        @if (job.notes) {
          <details class="detail-section">
            <summary>{{ 'common.notes' | translate }}</summary>
            <div class="detail-section-body">
              <p class="detail-section-copy preserve-linebreaks">{{ job.notes }}</p>
            </div>
          </details>
        }

        @if (job.lineItems.length) {
          <details class="detail-section">
            <summary>{{ 'jobs.form.lineItems.title' | translate }}</summary>
            <div class="detail-section-body stack-sm">
              @for (lineItem of job.lineItems; track lineItem.id) {
                <article class="line-item-card">
                  <div class="line-item-card-top">
                    <strong>{{ lineItem.description }}</strong>
                    <strong>{{ lineItemTotalLabel(lineItem) }}</strong>
                  </div>
                  <p>{{ ('lineItemKinds.' + lineItem.kind) | translate }}</p>
                  <p>{{ lineItemMeta(lineItem) }}</p>
                </article>
              }
            </div>
          </details>
        }
      </div>

      <div class="actions wrap">
        <button type="button" class="primary-button" (click)="openEditMode()">
          {{ 'common.edit' | translate }}
        </button>

        @if (job.invoiceId) {
          <a class="secondary-button" [routerLink]="['/invoices', job.invoiceId]" (click)="closeSelectedJob()">
            {{ 'calendar.selected.viewInvoice' | translate }}
          </a>
        } @else if (canCreateInvoice(job)) {
          <button type="button" class="secondary-button" (click)="createInvoice(job)">
            {{ 'calendar.selected.createInvoice' | translate }}
          </button>
        }
      </div>

      <section class="stack-sm dialog-section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">{{ 'calendar.selected.sections.invoiceEyebrow' | translate }}</p>
            <h3>{{ 'calendar.selected.sections.invoiceTitle' | translate }}</h3>
          </div>
        </div>

        @if (selectedInvoice(); as invoice) {
          <article class="invoice-card">
            <div>
              <strong>{{ 'jobs.invoiceNumber' | translate }} {{ invoice.invoiceNumber }}</strong>
              <p>{{ ('invoiceStatus.' + invoice.status) | translate }}</p>
            </div>
            <a class="secondary-button" [routerLink]="['/invoices', invoice.id]" (click)="closeSelectedJob()">
              {{ 'calendar.selected.viewInvoice' | translate }}
            </a>
          </article>
        } @else {
          <div class="empty-state compact">
            <h3>{{ 'calendar.selected.sections.invoiceEmptyTitle' | translate }}</h3>
            <p>
              {{
                canCreateInvoice(job)
                  ? ('calendar.selected.sections.invoiceEmptyReady' | translate)
                  : ('calendar.selected.sections.invoiceEmptyPending' | translate)
              }}
            </p>
            @if (canCreateInvoice(job)) {
              <button type="button" class="secondary-button" (click)="createInvoice(job)">
                {{ 'calendar.selected.createInvoice' | translate }}
              </button>
            }
          </div>
        }
      </section>

      <section class="stack-sm dialog-section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">{{ 'jobs.images.eyebrow' | translate }}</p>
            <h3>{{ 'jobs.images.title' | translate }}</h3>
          </div>
          <span class="page-note">{{ 'jobs.images.count' | translate:{ count: selectedImages().length } }}</span>
        </div>

        <div class="image-grid">
          @for (image of selectedImages(); track image.id) {
            <button
              type="button"
              class="image-thumb-button"
              (click)="openImage(image)"
              [attr.aria-label]="'common.open' | translate"
              [title]="'common.open' | translate"
            >
              @if (thumbUrls()[image.id]; as thumbUrl) {
                <img
                  class="image-thumb"
                  [src]="thumbUrl"
                  [alt]="'jobs.images.thumbnailAlt' | translate"
                  loading="lazy"
                />
              } @else {
                <div class="image-thumb placeholder">{{ 'jobs.images.preview' | translate }}</div>
              }
            </button>
          } @empty {
            <div class="empty-state compact">
              <h3>{{ 'jobs.images.empty.title' | translate }}</h3>
              <p>{{ 'jobs.images.empty.body' | translate }}</p>
            </div>
          }
        </div>
      </section>
    </ng-template>

    @if (selectedJob(); as job) {
      <button
        type="button"
        class="calendar-dialog-backdrop"
        (click)="closeSelectedJob()"
        [attr.aria-label]="'common.close' | translate"
      ></button>

      <section
        class="panel stack-lg calendar-dialog"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="job.title"
      >
        <ng-container *ngTemplateOutlet="selectedJobDetails; context: { $implicit: job }"></ng-container>
      </section>
    }

    @if (editingJobId()) {
      <button
        type="button"
        class="calendar-dialog-backdrop calendar-edit-dialog-backdrop"
        (click)="closeEditMode()"
        [attr.aria-label]="'common.close' | translate"
      ></button>

      <section
        class="panel stack-lg calendar-dialog calendar-edit-dialog"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'jobs.form.editTitle' | translate"
      >
        <app-job-form
          [jobId]="editingJobId()"
          (cancelled)="closeEditMode()"
          (saved)="handleJobFormSaved($event)"
        />
      </section>
    }
  `,
  styles: [
    `
      .calendar-legend {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
        color: var(--text-muted);
        font-size: 0.92rem;
      }

      .calendar-panel {
        container-type: inline-size;
      }

      .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 0.75rem;
      }

      .calendar-heading {
        font-size: 0.82rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--text-muted);
        padding-bottom: 0.25rem;
      }

      .calendar-cell {
        min-height: 8.5rem;
        border-radius: 1rem;
        border: 1px solid var(--ghost-border);
        background: var(--surface-soft);
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        text-align: left;
        align-items: stretch;
      }

      .calendar-cell.today {
        border-color: rgba(251, 191, 36, 0.9);
      }

      .calendar-cell.outside-month {
        opacity: 0.55;
      }

      .calendar-day {
        font-weight: 700;
        padding: 0 8px;
      }

      .calendar-job {
        padding: 0.4rem 0.55rem;
        border-radius: 0.7rem;
        font-size: 0.84rem;
        line-height: 1.25;
        border: 0;
        text-align: left;
        color: inherit;
        cursor: pointer;
      }

      .calendar-job.scheduled {
        background: rgba(56, 189, 248, 0.18);
      }

      .calendar-job.completed {
        background: rgba(74, 222, 128, 0.18);
      }

      .calendar-job.invoiced {
        background: rgba(251, 191, 36, 0.22);
      }

      .calendar-job.canceled {
        background: rgba(248, 113, 113, 0.18);
      }

      .calendar-more {
        font-size: 0.78rem;
        color: var(--text-muted);
      }

      .calendar-cell-actions {
        margin-top: auto;
        display: flex;
        justify-content: flex-end;
        padding-top: 0.4rem;
      }

      .calendar-new-job {
        width: 1.5rem;
        height: 1.5rem;
        margin: 4px;
        border-radius: 999px;
        border: 1px solid rgba(251, 191, 36, 0.36);
        background: linear-gradient(135deg, rgba(251, 191, 36, 0.96) 0%, rgba(245, 158, 11, 0.96) 100%);
        color: #241400;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0.8rem 1.8rem rgba(15, 23, 42, 0.18);
        cursor: pointer;
      }

      .calendar-new-job svg {
        width: 1rem;
        height: 1rem;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .dialog-section {
        padding-top: 0.25rem;
      }

      .invoice-card {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: center;
        padding: 1rem;
        border-radius: 1rem;
        background: var(--surface-muted);
      }

      .invoice-card p {
        margin: 0.2rem 0 0;
        color: var(--text-muted);
      }

      .expandable-sections {
        gap: 0.75rem;
      }

      .detail-section {
        border: 1px solid var(--secondary-border);
        border-radius: 1rem;
        background: var(--surface-muted);
        padding: 0.2rem 0.9rem;
      }

      .detail-section summary {
        cursor: pointer;
        padding: 0.85rem 0;
        font-weight: 700;
      }

      .detail-section-body {
        display: grid;
        gap: 0.65rem;
        padding: 0 0 0.9rem;
      }

      .detail-section-copy {
        margin: 0;
      }

      .preserve-linebreaks {
        white-space: pre-wrap;
      }

      .address-block p {
        margin: 0;
      }

      .line-item-card {
        padding: 0.9rem 1rem;
        border-radius: 0.9rem;
        background: var(--surface-soft);
        display: grid;
        gap: 0.25rem;
      }

      .line-item-card p {
        margin: 0;
        color: var(--text-muted);
      }

      .line-item-card-top {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: start;
      }

      .image-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
        gap: 0.75rem;
      }

      .image-thumb-button {
        display: block;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
        border-radius: 0.8rem;
        overflow: hidden;
      }

      .image-thumb {
        display: block;
        width: 100%;
        aspect-ratio: 1 / 1;
        object-fit: cover;
      }

      .image-thumb.placeholder {
        display: grid;
        place-items: center;
        width: 100%;
        aspect-ratio: 1 / 1;
        font-size: 0.72rem;
        color: var(--text-muted);
        border: 1px solid var(--secondary-border);
      }

      @container (max-width: 64rem) {
        .calendar-grid {
          grid-template-columns: repeat(6, minmax(0, 1fr));
        }
      }

      @container (max-width: 55rem) {
        .calendar-grid {
          grid-template-columns: repeat(5, minmax(0, 1fr));
        }
      }

      @container (max-width: 46rem) {
        .calendar-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }

      @container (max-width: 37rem) {
        .calendar-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @container (max-width: 28rem) {
        .calendar-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      .calendar-dialog-backdrop {
        position: fixed;
        inset: 0;
        z-index: 70;
        border: 0;
        background: rgba(2, 6, 23, 0.56);
      }

      .calendar-dialog {
        position: fixed;
        inset: 1rem;
        z-index: 71;
        width: min(72rem, calc(100vw - 2rem));
        max-width: 72rem;
        max-height: calc(100vh - 2rem);
        margin: 0 auto;
        overflow: auto;
      }

      .calendar-edit-dialog-backdrop {
        z-index: 72;
        background: rgba(2, 6, 23, 0.36);
      }

      .panel.calendar-dialog.calendar-edit-dialog {
        z-index: 73;
        width: min(80rem, calc(100vw - 2rem));
        max-width: 80rem;
        padding: 0 1.4rem 1.4rem;
      }

      .calendar-dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 1rem;
      }

      .calendar-dialog-close {
        flex-shrink: 0;
      }

      .calendar-dialog-close-icon {
        display: none;
        width: 1.1rem;
        height: 1.1rem;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      @media (max-width: 980px) {
        .calendar-grid {
          gap: 0.5rem;
        }

        .calendar-cell {
          min-height: 7rem;
          padding: 0;
        }

        .invoice-card,
        .line-item-card-top {
          flex-direction: column;
          align-items: start;
        }
      }

      @media (max-width: 720px) {
        .calendar-dialog {
          inset: 0.75rem;
          max-height: calc(100vh - 1.5rem);
        }

        .calendar-dialog-header {
          flex-direction: row;
          align-items: start;
        }

        .calendar-dialog-close {
          width: 2.75rem;
          min-width: 2.75rem;
          min-height: 2.75rem;
          padding: 0;
          border-radius: 999px;
        }

        .calendar-dialog-close-label {
          display: none;
        }

        .calendar-dialog-close-icon {
          display: block;
        }
      }
    `
  ]
})
export class CalendarPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly clientsRepository = inject(ClientsRepository);
  private readonly imagesRepository = inject(JobImagesRepository);
  private readonly invoicesRepository = inject(InvoicesRepository);
  private readonly jobsRepository = inject(JobsRepository);
  private readonly invoiceWorkflow = inject(InvoiceWorkflowService);
  private readonly i18n = inject(AppI18nService);
  private readonly calendarGridRef = viewChild<ElementRef<HTMLElement>>('calendarGrid');
  private readonly thumbLoadingIds = new Set<string>();

  readonly visibleMonth = signal(startOfMonth(new Date()));
  readonly selectedJobId = signal<string | null>(null);
  readonly editingJobId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly thumbUrls = signal<Record<string, string>>({});
  readonly calendarColumnCount = signal(7);

  readonly jobs = toSignal(this.jobsRepository.observeJobs(), { initialValue: [] as JobRecord[] });
  readonly clients = toSignal(this.clientsRepository.observeClients(), { initialValue: [] as ClientRecord[] });
  readonly selectedImages = toSignal(
    toObservable(this.selectedJobId).pipe(
      switchMap((jobId) => (jobId ? this.imagesRepository.observeImages(jobId) : of([] as JobImageRecord[])))
    ),
    { initialValue: [] as JobImageRecord[] }
  );

  readonly selectedJob = computed(
    () => this.jobs().find((job) => job.id === this.selectedJobId()) ?? null
  );
  readonly selectedInvoiceId = computed(() => this.selectedJob()?.invoiceId ?? null);
  readonly selectedInvoice = toSignal(
    toObservable(this.selectedInvoiceId).pipe(
      switchMap((invoiceId) =>
        invoiceId ? this.invoicesRepository.observeInvoice(invoiceId) : of(undefined as InvoiceRecord | undefined)
      )
    ),
    { initialValue: undefined as InvoiceRecord | undefined }
  );

  readonly weekdayLabels = computed(() => buildWeekdayLabels(this.i18n.currentLocale()));
  readonly showWeekdayHeadings = computed(() => this.calendarColumnCount() >= 7);
  readonly newJobIcon = 'M12 5v14M5 12h14';
  readonly closeIcon = 'M6 6l12 12M18 6 6 18';

  readonly monthTitle = computed(() => monthLabel(this.visibleMonth(), this.i18n.currentLocale()));

  readonly calendarCells = computed(() => {
    const month = this.visibleMonth();
    const activeJobs = this.jobs().filter((job) => !job.archivedAt);

    return buildMonthGrid(month).map((cell) => {
      const jobsForDay = activeJobs
        .filter((job) => isDateWithinRange(cell.isoDate, job.startDate, job.endDate))
        .slice(0, 3);
      const totalJobs = activeJobs.filter((job) =>
        isDateWithinRange(cell.isoDate, job.startDate, job.endDate)
      ).length;

      return {
        ...cell,
        jobs: jobsForDay,
        moreJobs: Math.max(0, totalJobs - jobsForDay.length)
      };
    });
  });

  constructor() {
    afterNextRender(() => {
      const grid = this.calendarGridRef()?.nativeElement;

      if (!grid || typeof ResizeObserver === 'undefined') {
        return;
      }

      const updateColumnCount = () => {
        this.calendarColumnCount.set(this.readGridColumnCount(grid));
      };

      updateColumnCount();

      const observer = new ResizeObserver(() => updateColumnCount());
      observer.observe(grid);

      this.destroyRef.onDestroy(() => observer.disconnect());
    });

    effect(() => {
      const jobId = this.selectedJobId();
      const imageEntries = this.selectedImages();

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

  shiftMonth(delta: number): void {
    this.visibleMonth.set(addMonths(this.visibleMonth(), delta));
  }

  resetMonth(): void {
    this.visibleMonth.set(startOfMonth(new Date()));
  }

  createJobForDate(date: string): void {
    void this.router.navigate(['/jobs/new'], {
      queryParams: { start: date, end: date }
    });
  }

  openEditMode(): void {
    const job = this.selectedJob();

    if (!job) {
      return;
    }

    this.message.set('');
    this.error.set('');
    this.editingJobId.set(job.id);
  }

  closeEditMode(): void {
    this.message.set('');
    this.error.set('');
    this.editingJobId.set(null);
  }

  selectJob(job: JobRecord, event: Event): void {
    event.stopPropagation();
    this.message.set('');
    this.error.set('');
    this.editingJobId.set(null);
    this.selectedJobId.set(job.id);
  }

  closeSelectedJob(): void {
    this.message.set('');
    this.error.set('');
    this.editingJobId.set(null);
    this.selectedJobId.set(null);
  }

  clientName(clientId: string): string {
    return (
      this.clients().find((client) => client.id === clientId)?.displayName ??
      this.i18n.instant('common.unknownClient')
    );
  }

  formatDate(job: JobRecord): string {
    return formatDateRange(job.startDate, job.endDate, this.i18n.currentLocale());
  }

  subtotal(job: JobRecord): string {
    return toCurrency(sumLineItems(job.lineItems));
  }

  addressLines(job: JobRecord): string[] {
    const address = job.address;

    if (!address) {
      return [];
    }

    const locality = [address.city, address.state, address.postalCode].filter(Boolean).join(', ');

    return [address.line1, address.line2, locality].filter((line): line is string => Boolean(line?.trim()));
  }

  lineItemMeta(lineItem: JobLineItem): string {
    return `${lineItem.quantity} ${lineItem.unitLabel} x ${toCurrency(lineItem.unitPriceCents)}`;
  }

  lineItemTotalLabel(lineItem: JobLineItem): string {
    return toCurrency(lineItem.totalCents);
  }

  canCreateInvoice(job: JobRecord): boolean {
    return job.status === 'completed' && !job.invoiceId;
  }

  handleJobFormSaved(event: JobFormSavedEvent): void {
    this.editingJobId.set(null);
    this.message.set(this.i18n.instant('jobs.form.saved'));
    this.error.set(event.queuedUploadError ?? '');
  }

  async createInvoice(job: JobRecord): Promise<void> {
    const client = this.clients().find((entry) => entry.id === job.clientId);

    if (!client) {
      this.error.set(this.i18n.instant('calendar.errors.missingClient'));
      return;
    }

    this.error.set('');
    this.message.set('');
    this.busy.set(true);

    try {
      await this.invoiceWorkflow.createDraftForJob(job, client);
      this.message.set(this.i18n.instant('calendar.selected.sections.invoiceCreated'));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('calendar.errors.createInvoice'));
    } finally {
      this.busy.set(false);
    }
  }

  async openImage(image: JobImageRecord): Promise<void> {
    const jobId = this.selectedJobId();

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

  private readGridColumnCount(grid: HTMLElement): number {
    if (typeof window === 'undefined') {
      return 7;
    }

    const columns = window.getComputedStyle(grid).gridTemplateColumns;

    if (!columns || columns === 'none') {
      return 1;
    }

    return columns.trim().split(/\s+/).length;
  }

  private async loadThumb(jobId: string, imageId: string): Promise<void> {
    try {
      const thumbUrl = await this.imagesRepository.getImageDownloadUrl(jobId, imageId, 'thumb');
      this.thumbUrls.update((current) => ({
        ...current,
        [imageId]: thumbUrl
      }));
    } finally {
      this.thumbLoadingIds.delete(imageId);
    }
  }
}
