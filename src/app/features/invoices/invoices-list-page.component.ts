import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { InvoicesRepository } from '../../core/services/invoices.repository';
import { InvoiceWorkflowService } from '../../core/services/invoice-workflow.service';
import { InvoiceRecord, INVOICE_STATUSES } from '../../core/models';
import { toCurrency } from '../../core/utils/money.utils';

@Component({
  selector: 'app-invoices-list-page',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-grid single">
      <article class="panel stack-lg">
        <div class="page-header">
          <div>
            <p class="eyebrow">{{ 'invoices.list.eyebrow' | translate }}</p>
            <h2>{{ 'invoices.list.title' | translate }}</h2>
          </div>
        </div>

        <div class="grid-two">
          <label class="field">
            <span>{{ 'common.search' | translate }}</span>
            <input type="search" [value]="search()" (input)="search.set(($any($event.target)).value)" />
          </label>

          <label class="field">
            <span>{{ 'common.status' | translate }}</span>
            <select
              id="invoice-status-filter"
              name="invoiceStatusFilter"
              [value]="statusFilter()"
              (change)="statusFilter.set(($any($event.target)).value)"
            >
              <option value="all">{{ 'invoices.list.allStatuses' | translate }}</option>
              @for (status of statuses; track status) {
                <option [value]="status">{{ ('invoiceStatus.' + status) | translate }}</option>
              }
            </select>
          </label>
        </div>

        @if (error()) {
          <p class="error-text">{{ error() }}</p>
        }

        @if (filteredInvoices().length) {
          <div class="stack-md">
            @for (invoice of filteredInvoices(); track invoice.id) {
              <article class="record-card">
                <div class="record-card__top">
                  <div>
                    <h3>{{ invoice.invoiceNumber }}</h3>
                    <p>{{ invoice.clientSnapshot.displayName }} | {{ invoice.jobSnapshot.title }}</p>
                  </div>
                  <a class="text-link" [routerLink]="['/invoices', invoice.id]">{{ 'common.open' | translate }}</a>
                </div>

                <div class="tag-row">
                  <span class="pill">{{ ('invoiceStatus.' + invoice.status) | translate }}</span>
                  <span class="pill">{{ toCurrency(invoice.subtotal) }}</span>
                </div>

                <div class="actions wrap">
                  <button type="button" class="secondary-button" (click)="download(invoice)">
                    {{ 'common.downloadPdf' | translate }}
                  </button>

                  @if (!invoice.archivedAt && invoice.status !== 'archived') {
                    <button type="button" class="ghost-button" (click)="archive(invoice)">
                      {{ 'common.archive' | translate }}
                    </button>
                  } @else {
                    <button type="button" class="ghost-button" (click)="restore(invoice)">
                      {{ 'common.restore' | translate }}
                    </button>
                  }
                </div>
              </article>
            }
          </div>
        } @else {
          <div class="empty-state compact">
            <h3>{{ 'invoices.list.empty.title' | translate }}</h3>
            <p>{{ 'invoices.list.empty.body' | translate }}</p>
          </div>
        }
      </article>
    </section>
  `
})
export class InvoicesListPageComponent {
  private readonly invoicesRepository = inject(InvoicesRepository);
  private readonly invoiceWorkflow = inject(InvoiceWorkflowService);
  private readonly i18n = inject(AppI18nService);

  readonly search = signal('');
  readonly statusFilter = signal<'all' | InvoiceRecord['status']>('all');
  readonly error = signal('');
  readonly statuses = INVOICE_STATUSES;
  readonly invoices = toSignal(this.invoicesRepository.observeInvoices(), { initialValue: [] });

  readonly filteredInvoices = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();

    return this.invoices().filter((invoice) => {
      const matchesStatus = status === 'all' || invoice.status === status;
      const matchesTerm =
        !term ||
        invoice.invoiceNumber.toLowerCase().includes(term) ||
        invoice.clientSnapshot.displayName.toLowerCase().includes(term) ||
        invoice.jobSnapshot.title.toLowerCase().includes(term);

      return matchesStatus && matchesTerm;
    });
  });

  toCurrency(value: number): string {
    return toCurrency(value);
  }

  async download(invoice: InvoiceRecord): Promise<void> {
    try {
      await this.invoiceWorkflow.downloadPdf(invoice);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('invoices.list.errors.download'));
    }
  }

  async archive(invoice: InvoiceRecord): Promise<void> {
    try {
      await this.invoicesRepository.archiveInvoice(invoice.id);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('invoices.list.errors.archive'));
    }
  }

  async restore(invoice: InvoiceRecord): Promise<void> {
    try {
      await this.invoicesRepository.restoreInvoice(invoice.id);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('invoices.list.errors.restore'));
    }
  }
}
