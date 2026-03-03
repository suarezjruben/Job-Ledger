import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HistoryEntry } from '../../core/models';
import { ClientsRepository } from '../../core/services/clients.repository';
import { InvoicesRepository } from '../../core/services/invoices.repository';
import { JobsRepository } from '../../core/services/jobs.repository';
import { toCurrency } from '../../core/utils/money.utils';

@Component({
  selector: 'app-history-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-grid single">
      <article class="panel stack-lg">
        <div class="page-header">
          <div>
            <p class="eyebrow">History</p>
            <h2>Search long-term job and invoice records</h2>
          </div>
        </div>

        <div class="grid-two">
          <label class="field">
            <span>Record type</span>
            <select [value]="recordType()" (change)="recordType.set(($any($event.target)).value)">
              <option value="all">All records</option>
              <option value="job">Jobs</option>
              <option value="invoice">Invoices</option>
            </select>
          </label>

          <label class="field">
            <span>Client</span>
            <select [value]="clientId()" (change)="clientId.set(($any($event.target)).value)">
              <option value="">All clients</option>
              @for (client of clients(); track client.id) {
                <option [value]="client.id">{{ client.displayName }}</option>
              }
            </select>
          </label>
        </div>

        <div class="grid-three">
          <label class="field">
            <span>Status</span>
            <input type="text" [value]="status()" (input)="status.set(($any($event.target)).value)" />
          </label>
          <label class="field">
            <span>From date</span>
            <input type="date" [value]="fromDate()" (input)="fromDate.set(($any($event.target)).value)" />
          </label>
          <label class="field">
            <span>To date</span>
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
                  <a class="text-link" [routerLink]="entry.route">Open</a>
                </div>

                <div class="tag-row">
                  <span class="pill">{{ entry.kind }}</span>
                  <span class="pill">{{ entry.status }}</span>
                  @if (entry.amountCents !== undefined) {
                    <span class="pill">{{ toCurrency(entry.amountCents) }}</span>
                  }
                </div>

                <p>{{ dateRange(entry) }}</p>
              </article>
            }
          </div>
        } @else {
          <div class="empty-state compact">
            <h3>No records match</h3>
            <p>Try widening the date range or removing the status filter.</p>
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
        subtitle: this.clients().find((client) => client.id === job.clientId)?.displayName ?? 'Unknown client',
        status: job.status,
        clientId: job.clientId,
        primaryDate: job.startDate,
        secondaryDate: job.endDate,
        amountCents: job.lineItems.reduce((sum, lineItem) => sum + lineItem.totalCents, 0),
        route: `/jobs/${job.id}`,
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
        amountCents: invoice.subtotalCents,
        route: `/invoices/${invoice.id}`,
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
    return entry.secondaryDate ? `${entry.primaryDate} to ${entry.secondaryDate}` : entry.primaryDate;
  }
}
