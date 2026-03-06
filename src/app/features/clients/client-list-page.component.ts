import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { ClientsRepository } from '../../core/services/clients.repository';
import { InvoicesRepository } from '../../core/services/invoices.repository';
import { JobsRepository } from '../../core/services/jobs.repository';
import { ClientRecord } from '../../core/models';

@Component({
  selector: 'app-client-list-page',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-grid single">
      <article class="panel stack-lg">
        <div class="page-header">
          <div>
            <p class="eyebrow">{{ 'clients.list.eyebrow' | translate }}</p>
            <h2>{{ 'clients.list.title' | translate }}</h2>
          </div>

          <a class="primary-button" routerLink="/clients/new">{{ 'clients.list.newClient' | translate }}</a>
        </div>

        <label class="field">
          <span>{{ 'clients.list.searchLabel' | translate }}</span>
          <input type="search" [value]="search()" (input)="search.set(($any($event.target)).value)" />
        </label>

        @if (error()) {
          <p class="error-text">{{ error() }}</p>
        }

        <div class="stack-lg">
          <section class="stack-md">
            <div class="section-heading">
              <h3>{{ 'clients.list.sections.active' | translate }}</h3>
              <span>{{ activeClients().length }}</span>
            </div>

            @if (activeClients().length) {
              <div class="record-grid">
                @for (client of activeClients(); track client.id) {
                  <article class="record-card">
                    <div class="record-card__top">
                      <div>
                        <h3>{{ client.displayName }}</h3>
                        <p>{{ client.companyName || client.billingEmail || ('clients.list.noBillingInfo' | translate) }}</p>
                      </div>
                      <a class="text-link" [routerLink]="['/clients', client.id]">{{ 'common.edit' | translate }}</a>
                    </div>

                    <div class="tag-row">
                      <span class="pill">{{ 'clients.list.jobsCount' | translate:{ count: stats(client).jobs } }}</span>
                      <span class="pill">
                        {{ 'clients.list.invoicesCount' | translate:{ count: stats(client).invoices } }}
                      </span>
                    </div>

                    @if (client.phone) {
                      <p>{{ client.phone }}</p>
                    }

                    <div class="actions wrap">
                      <button type="button" class="secondary-button" (click)="archive(client)">
                        {{ 'common.archive' | translate }}
                      </button>
                      @if (canDelete(client)) {
                        <button type="button" class="ghost-button" (click)="delete(client)">
                          {{ 'common.delete' | translate }}
                        </button>
                      }
                    </div>
                  </article>
                }
              </div>
            } @else {
              <div class="empty-state compact">
                <h3>{{ 'clients.list.emptyActive.title' | translate }}</h3>
                <p>{{ 'clients.list.emptyActive.body' | translate }}</p>
              </div>
            }
          </section>

          <section class="stack-md">
            <div class="section-heading">
              <h3>{{ 'clients.list.sections.archived' | translate }}</h3>
              <span>{{ archivedClients().length }}</span>
            </div>

            @if (archivedClients().length) {
              <div class="record-grid">
                @for (client of archivedClients(); track client.id) {
                  <article class="record-card muted">
                    <div class="record-card__top">
                      <div>
                        <h3>{{ client.displayName }}</h3>
                        <p>{{ client.companyName || client.billingEmail || ('clients.list.archivedRecord' | translate) }}</p>
                      </div>
                      <a class="text-link" [routerLink]="['/clients', client.id]">{{ 'common.view' | translate }}</a>
                    </div>

                    <div class="tag-row">
                      <span class="pill">{{ 'clients.list.jobsCount' | translate:{ count: stats(client).jobs } }}</span>
                      <span class="pill">
                        {{ 'clients.list.invoicesCount' | translate:{ count: stats(client).invoices } }}
                      </span>
                    </div>

                    <div class="actions wrap">
                      <button type="button" class="secondary-button" (click)="restore(client)">
                        {{ 'common.restore' | translate }}
                      </button>
                    </div>
                  </article>
                }
              </div>
            } @else {
              <div class="empty-state compact">
                <h3>{{ 'clients.list.emptyArchived.title' | translate }}</h3>
                <p>{{ 'clients.list.emptyArchived.body' | translate }}</p>
              </div>
            }
          </section>
        </div>
      </article>
    </section>
  `
})
export class ClientListPageComponent {
  private readonly clientsRepository = inject(ClientsRepository);
  private readonly jobsRepository = inject(JobsRepository);
  private readonly invoicesRepository = inject(InvoicesRepository);
  private readonly i18n = inject(AppI18nService);

  readonly search = signal('');
  readonly error = signal('');
  readonly clients = toSignal(this.clientsRepository.observeClients(), { initialValue: [] });
  readonly jobs = toSignal(this.jobsRepository.observeJobs(), { initialValue: [] });
  readonly invoices = toSignal(this.invoicesRepository.observeInvoices(), { initialValue: [] });

  readonly activeClients = computed(() => this.filterClients(false));
  readonly archivedClients = computed(() => this.filterClients(true));

  stats(client: ClientRecord): { jobs: number; invoices: number } {
    return {
      jobs: this.jobs().filter((job) => job.clientId === client.id).length,
      invoices: this.invoices().filter((invoice) => invoice.clientId === client.id).length
    };
  }

  canDelete(client: ClientRecord): boolean {
    const { jobs, invoices } = this.stats(client);
    return jobs === 0 && invoices === 0;
  }

  async archive(client: ClientRecord): Promise<void> {
    try {
      await this.clientsRepository.archiveClient(client.id);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('clients.list.errors.archive'));
    }
  }

  async restore(client: ClientRecord): Promise<void> {
    try {
      await this.clientsRepository.restoreClient(client.id);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('clients.list.errors.restore'));
    }
  }

  async delete(client: ClientRecord): Promise<void> {
    if (!this.canDelete(client)) {
      this.error.set(this.i18n.instant('clients.list.errors.cannotDelete'));
      return;
    }

    if (!window.confirm(this.i18n.instant('clients.list.confirmDelete', { name: client.displayName }))) {
      return;
    }

    try {
      await this.clientsRepository.deleteClient(client.id);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('clients.list.errors.delete'));
    }
  }

  private filterClients(archived: boolean): ClientRecord[] {
    const term = this.search().trim().toLowerCase();

    return this.clients().filter((client) => {
      const matchesArchive = archived ? Boolean(client.archivedAt) : !client.archivedAt;
      const matchesSearch =
        !term ||
        client.displayName.toLowerCase().includes(term) ||
        (client.companyName ?? '').toLowerCase().includes(term) ||
        (client.billingEmail ?? '').toLowerCase().includes(term);

      return matchesArchive && matchesSearch;
    });
  }
}
