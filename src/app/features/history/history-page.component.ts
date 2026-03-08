import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { HistoryEntry, InvoiceStatus, JobStatus } from '../../core/models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { ClientsRepository } from '../../core/services/clients.repository';
import { InvoicesRepository } from '../../core/services/invoices.repository';
import { JobsRepository } from '../../core/services/jobs.repository';
import { formatDateRange, formatDisplayDate } from '../../core/utils/date.utils';
import { toCurrency } from '../../core/utils/money.utils';

@Component({
  selector: 'app-history-page',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-grid single">
      <article class="panel stack-lg">
        <div class="page-header">
          <div>
            <p class="eyebrow">{{ 'history.eyebrow' | translate }}</p>
            <h2>{{ 'history.title' | translate }}</h2>
          </div>
        </div>

        <div class="grid-two">
          <label class="field">
            <span>{{ 'history.filters.recordType' | translate }}</span>
            <select
              id="history-record-type"
              name="historyRecordType"
              [value]="recordType()"
              (change)="recordType.set(($any($event.target)).value)"
            >
              <option value="all">{{ 'history.filters.recordTypes.all' | translate }}</option>
              <option value="job">{{ 'history.filters.recordTypes.job' | translate }}</option>
              <option value="invoice">{{ 'history.filters.recordTypes.invoice' | translate }}</option>
            </select>
          </label>

          <label class="field">
            <span>{{ 'common.client' | translate }}</span>
            <select
              id="history-client"
              name="historyClient"
              [value]="clientId()"
              (change)="clientId.set(($any($event.target)).value)"
            >
              <option value="">{{ 'history.filters.allClients' | translate }}</option>
              @for (client of clients(); track client.id) {
                <option [value]="client.id">{{ client.displayName }}</option>
              }
            </select>
          </label>
        </div>

        <div class="grid-three">
          <label class="field">
            <span>{{ 'common.status' | translate }}</span>
            <input type="text" [value]="status()" (input)="status.set(($any($event.target)).value)" />
          </label>
          <label class="field">
            <span>{{ 'history.filters.fromDate' | translate }}</span>
            <input type="date" [value]="fromDate()" (input)="fromDate.set(($any($event.target)).value)" />
          </label>
          <label class="field">
            <span>{{ 'history.filters.toDate' | translate }}</span>
            <input type="date" [value]="toDate()" (input)="toDate.set(($any($event.target)).value)" />
          </label>
        </div>

        @if (entries().length) {
          <div class="stack-md">
            @for (entry of entries(); track entry.kind + entry.id) {
              <article class="record-card">
                <div class="record-card__top">
                  <div>
                    <h3>{{ entry.title }}</h3>
                    <p>{{ entry.subtitle }}</p>
                  </div>
                  <a class="text-link" [routerLink]="entry.route" [queryParams]="entry.queryParams">
                    {{ 'common.open' | translate }}
                  </a>
                </div>

                <div class="tag-row">
                  <span class="pill">{{ ('history.kinds.' + entry.kind) | translate }}</span>
                  <span class="pill">{{ statusLabel(entry) }}</span>
                  @if (entry.amount !== undefined) {
                    <span class="pill">{{ toCurrency(entry.amount) }}</span>
                  }
                </div>

                <p>{{ dateRange(entry) }}</p>
              </article>
            }
          </div>
        } @else {
          <div class="empty-state compact">
            <h3>{{ 'history.empty.title' | translate }}</h3>
            <p>{{ 'history.empty.body' | translate }}</p>
          </div>
        }
      </article>
    </section>
  `
})
export class HistoryPageComponent {
  private readonly clientsRepository = inject(ClientsRepository);
  private readonly jobsRepository = inject(JobsRepository);
  private readonly invoicesRepository = inject(InvoicesRepository);
  private readonly i18n = inject(AppI18nService);

  readonly recordType = signal<'all' | 'job' | 'invoice'>('all');
  readonly clientId = signal('');
  readonly status = signal('');
  readonly fromDate = signal('');
  readonly toDate = signal('');

  readonly clients = toSignal(this.clientsRepository.observeClients(), { initialValue: [] });
  readonly jobs = toSignal(this.jobsRepository.observeJobs(), { initialValue: [] });
  readonly invoices = toSignal(this.invoicesRepository.observeInvoices(), { initialValue: [] });

  readonly entries = computed(() => {
    const records: HistoryEntry[] = [
      ...this.jobs().map((job) => ({
        id: job.id,
        kind: 'job' as const,
        title: job.title,
        subtitle:
          this.clients().find((client) => client.id === job.clientId)?.displayName ??
          this.i18n.instant('common.unknownClient'),
        status: job.status,
        clientId: job.clientId,
        primaryDate: job.startDate,
        secondaryDate: job.endDate,
        amount: job.lineItems.reduce((sum, lineItem) => sum + lineItem.total, 0),
        route: `/jobs/${job.id}`,
        queryParams: this.historyQueryParamsForJob(job.status),
        archived: Boolean(job.archivedAt)
      })),
      ...this.invoices().map((invoice) => ({
        id: invoice.id,
        kind: 'invoice' as const,
        title: invoice.invoiceNumber,
        subtitle: `${invoice.clientSnapshot.displayName} | ${invoice.jobSnapshot.title}`,
        status: invoice.status,
        clientId: invoice.clientId,
        primaryDate:
          invoice.issuedAt?.toDate().toISOString().slice(0, 10) ??
          invoice.createdAt?.toDate().toISOString().slice(0, 10) ??
          '',
        amount: invoice.subtotal,
        route: `/invoices/${invoice.id}`,
        queryParams: this.historyQueryParamsForInvoice(invoice.status),
        archived: Boolean(invoice.archivedAt)
      }))
    ];

    return records.filter((entry) => {
      const matchesType = this.recordType() === 'all' || entry.kind === this.recordType();
      const matchesClient = !this.clientId() || entry.clientId === this.clientId();
      const matchesStatus =
        !this.status().trim() || entry.status.toLowerCase().includes(this.status().trim().toLowerCase());
      const matchesFrom = !this.fromDate() || entry.primaryDate >= this.fromDate();
      const matchesTo = !this.toDate() || entry.primaryDate <= this.toDate();

      return matchesType && matchesClient && matchesStatus && matchesFrom && matchesTo;
    });
  });

  toCurrency(value: number): string {
    return toCurrency(value);
  }

  dateRange(entry: HistoryEntry): string {
    return entry.secondaryDate
      ? formatDateRange(entry.primaryDate, entry.secondaryDate, this.i18n.currentLocale())
      : formatDisplayDate(entry.primaryDate, this.i18n.currentLocale());
  }

  statusLabel(entry: HistoryEntry): string {
    return this.i18n.instant(`${entry.kind === 'job' ? 'jobStatus' : 'invoiceStatus'}.${entry.status}`);
  }

  private historyQueryParamsForJob(status: JobStatus): Record<string, string> {
    return {
      source: 'history',
      ...(status === 'completed' || status === 'canceled' ? { readonly: '1' } : {})
    };
  }

  private historyQueryParamsForInvoice(status: InvoiceStatus): Record<string, string> {
    return {
      source: 'history',
      ...(status === 'paid' || status === 'void' ? { readonly: '1' } : {})
    };
  }
}
