import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
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
  startOfMonth
} from '../../core/utils/date.utils';
import { toCurrency, sumLineItems } from '../../core/utils/money.utils';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-grid">
      <article class="panel stack-lg">
        <div class="page-header">
          <div>
            <p class="eyebrow">Calendar</p>
            <h2>{{ monthTitle() }}</h2>
          </div>

          <div class="actions">
            <button type="button" class="secondary-button" (click)="shiftMonth(-1)">Previous</button>
            <button type="button" class="secondary-button" (click)="resetMonth()">Today</button>
            <button type="button" class="secondary-button" (click)="shiftMonth(1)">Next</button>
          </div>
        </div>

        <div class="calendar-legend">
          <span class="status-dot scheduled"></span> Scheduled
          <span class="status-dot completed"></span> Completed
          <span class="status-dot invoiced"></span> Invoiced
          <span class="status-dot canceled"></span> Canceled
        </div>

        <div class="calendar-grid">
          @for (label of weekdayLabels; track label) {
            <div class="calendar-heading">{{ label }}</div>
          }

          @for (cell of calendarCells(); track cell.isoDate) {
            <button
              type="button"
              class="calendar-cell"
              [class.outside-month]="!cell.inMonth"
              [class.today]="cell.isToday"
              (click)="createJobForDate(cell.isoDate)"
            >
              <span class="calendar-day">{{ cell.dayNumber }}</span>

              @for (job of cell.jobs; track job.id) {
                <span
                  class="calendar-job"
                  [class.scheduled]="job.status === 'scheduled' || job.status === 'in_progress'"
                  [class.completed]="job.status === 'completed'"
                  [class.invoiced]="job.status === 'invoiced'"
                  [class.canceled]="job.status === 'canceled'"
                  (click)="selectJob(job, $event)"
                >
                  {{ job.title }}
                </span>
              }

              @if (cell.moreJobs > 0) {
                <span class="calendar-more">+{{ cell.moreJobs }} more</span>
              }
            </button>
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
              <p class="eyebrow">Selected job</p>
              <h2>{{ job.title }}</h2>
            </div>
            <button type="button" class="secondary-button" (click)="selectedJobId.set(null)">Close</button>
          </div>

          <dl class="detail-list">
            <div>
              <dt>Client</dt>
              <dd>{{ clientName(job.clientId) }}</dd>
            </div>
            <div>
              <dt>Dates</dt>
              <dd>{{ formatDate(job) }}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd class="status-text">{{ prettyStatus(job.status) }}</dd>
            </div>
            <div>
              <dt>Subtotal</dt>
              <dd>{{ subtotal(job) }}</dd>
            </div>
          </dl>

          @if (job.description) {
            <p class="note-block">{{ job.description }}</p>
          }

          <div class="actions wrap">
            <a class="primary-button" [routerLink]="['/jobs', job.id]">Edit job</a>

            @if (job.invoiceId) {
              <a class="secondary-button" [routerLink]="['/invoices', job.invoiceId]">View invoice</a>
            } @else if (canCreateInvoice(job)) {
              <button type="button" class="secondary-button" (click)="createInvoice(job)">
                Create invoice
              </button>
            }
          </div>
        } @else {
          <div class="empty-state">
            <p class="eyebrow">Detail drawer</p>
            <h2>Select a job</h2>
            <p>Click a calendar badge to inspect the client, date span, and invoice actions.</p>
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
        border: 1px solid rgba(148, 163, 184, 0.16);
        background: rgba(15, 23, 42, 0.56);
        padding: 0.9rem;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        text-align: left;
        cursor: pointer;
      }

      .calendar-cell.today {
        border-color: rgba(251, 191, 36, 0.9);
      }

      .calendar-cell.outside-month {
        opacity: 0.55;
      }

      .calendar-day {
        font-weight: 700;
      }

      .calendar-job {
        padding: 0.4rem 0.55rem;
        border-radius: 0.7rem;
        font-size: 0.84rem;
        line-height: 1.25;
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
  private readonly router = inject(Router);
  private readonly clientsRepository = inject(ClientsRepository);
  private readonly jobsRepository = inject(JobsRepository);
  private readonly invoiceWorkflow = inject(InvoiceWorkflowService);

  readonly weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  readonly visibleMonth = signal(startOfMonth(new Date()));
  readonly selectedJobId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');

  readonly jobs = toSignal(this.jobsRepository.observeJobs(), { initialValue: [] as JobRecord[] });
  readonly clients = toSignal(this.clientsRepository.observeClients(), { initialValue: [] as ClientRecord[] });

  readonly selectedJob = computed(
    () => this.jobs().find((job) => job.id === this.selectedJobId()) ?? null
  );

  readonly monthTitle = computed(() => monthLabel(this.visibleMonth()));

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
    return this.clients().find((client) => client.id === clientId)?.displayName ?? 'Unknown client';
  }

  formatDate(job: JobRecord): string {
    return formatDateRange(job.startDate, job.endDate);
  }

  subtotal(job: JobRecord): string {
    return toCurrency(sumLineItems(job.lineItems));
  }

  prettyStatus(status: JobRecord['status']): string {
    return status.replace(/_/g, ' ');
  }

  canCreateInvoice(job: JobRecord): boolean {
    return job.status === 'completed' && !job.invoiceId;
  }

  async createInvoice(job: JobRecord): Promise<void> {
    const client = this.clients().find((entry) => entry.id === job.clientId);

    if (!client) {
      this.error.set('This job is missing a client record.');
      return;
    }

    this.error.set('');
    this.busy.set(true);

    try {
      const invoiceId = await this.invoiceWorkflow.createDraftForJob(job, client);
      await this.router.navigate(['/invoices', invoiceId]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to create invoice.');
    } finally {
      this.busy.set(false);
    }
  }
}
