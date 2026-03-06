import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { ClientsRepository } from '../../core/services/clients.repository';
import { JobsRepository } from '../../core/services/jobs.repository';
import { InvoiceWorkflowService } from '../../core/services/invoice-workflow.service';
import { ClientRecord, JobRecord } from '../../core/models';
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

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-grid">
      <article class="panel stack-lg">
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

        @if (error()) {
          <p class="error-text">{{ error() }}</p>
        }
      </article>

      <aside class="panel stack-lg sticky-panel">
        @if (selectedJob(); as job) {
          <div class="page-header">
            <div>
              <p class="eyebrow">{{ 'calendar.selected.eyebrow' | translate }}</p>
              <h2>{{ job.title }}</h2>
            </div>
            <button type="button" class="secondary-button" (click)="selectedJobId.set(null)">
              {{ 'common.close' | translate }}
            </button>
          </div>

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

          @if (job.description) {
            <p class="note-block">{{ job.description }}</p>
          }

          <div class="actions wrap">
            <a class="primary-button" [routerLink]="['/jobs', job.id]">
              {{ 'calendar.selected.editJob' | translate }}
            </a>

            @if (job.invoiceId) {
              <a class="secondary-button" [routerLink]="['/invoices', job.invoiceId]">
                {{ 'calendar.selected.viewInvoice' | translate }}
              </a>
            } @else if (canCreateInvoice(job)) {
              <button type="button" class="secondary-button" (click)="createInvoice(job)">
                {{ 'calendar.selected.createInvoice' | translate }}
              </button>
            }
          </div>
        } @else {
          <div class="empty-state">
            <p class="eyebrow">{{ 'calendar.empty.eyebrow' | translate }}</p>
            <h2>{{ 'calendar.empty.title' | translate }}</h2>
            <p>{{ 'calendar.empty.body' | translate }}</p>
          </div>
        }
      </aside>
    </section>
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
        margin: 2px;
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

      .sticky-panel {
        position: sticky;
        top: 1.5rem;
      }

      @media (max-width: 980px) {
        .calendar-grid {
          gap: 0.5rem;
        }

        .calendar-cell {
          min-height: 7rem;
          padding: 0.7rem;
        }

        .sticky-panel {
          position: static;
        }
      }

      @media (max-width: 720px) {
        .calendar-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `
  ]
})
export class CalendarPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly clientsRepository = inject(ClientsRepository);
  private readonly jobsRepository = inject(JobsRepository);
  private readonly invoiceWorkflow = inject(InvoiceWorkflowService);
  private readonly i18n = inject(AppI18nService);
  private readonly calendarGridRef = viewChild<ElementRef<HTMLElement>>('calendarGrid');

  readonly visibleMonth = signal(startOfMonth(new Date()));
  readonly selectedJobId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly calendarColumnCount = signal(7);

  readonly jobs = toSignal(this.jobsRepository.observeJobs(), { initialValue: [] as JobRecord[] });
  readonly clients = toSignal(this.clientsRepository.observeClients(), { initialValue: [] as ClientRecord[] });

  readonly selectedJob = computed(
    () => this.jobs().find((job) => job.id === this.selectedJobId()) ?? null
  );

  readonly weekdayLabels = computed(() => buildWeekdayLabels(this.i18n.currentLocale()));
  readonly showWeekdayHeadings = computed(() => this.calendarColumnCount() >= 7);
  readonly newJobIcon = 'M12 5v14M5 12h14';

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

  selectJob(job: JobRecord, event: Event): void {
    event.stopPropagation();
    this.selectedJobId.set(job.id);
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

  canCreateInvoice(job: JobRecord): boolean {
    return job.status === 'completed' && !job.invoiceId;
  }

  async createInvoice(job: JobRecord): Promise<void> {
    const client = this.clients().find((entry) => entry.id === job.clientId);

    if (!client) {
      this.error.set(this.i18n.instant('calendar.errors.missingClient'));
      return;
    }

    this.error.set('');
    this.busy.set(true);

    try {
      const invoiceId = await this.invoiceWorkflow.createDraftForJob(job, client);
      await this.router.navigate(['/invoices', invoiceId]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('calendar.errors.createInvoice'));
    } finally {
      this.busy.set(false);
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
}
