import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, switchMap } from 'rxjs';
import { BusinessProfileRepository } from '../../core/services/business-profile.repository';
import { InvoiceWorkflowService } from '../../core/services/invoice-workflow.service';
import { InvoicesRepository } from '../../core/services/invoices.repository';
import { InvoiceRecord, JobLineItem } from '../../core/models';
import { calculateLineTotal, normalizeCents, toCurrency } from '../../core/utils/money.utils';

@Component({
  selector: 'app-invoice-detail-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-grid">
      <article class="panel stack-lg">
        @if (invoice(); as invoice) {
          <div class="page-header">
            <div>
              <p class="eyebrow">Invoice detail</p>
              <h2>{{ invoice.invoiceNumber }}</h2>
            </div>

            <div class="tag-row">
              <span class="pill">{{ invoice.status }}</span>
              <span class="pill">{{ toCurrency(invoice.subtotalCents) }}</span>
            </div>
          </div>

          <div class="detail-list">
            <div>
              <dt>Client</dt>
              <dd>{{ invoice.clientSnapshot.displayName }}</dd>
            </div>
            <div>
              <dt>Job</dt>
              <dd>{{ invoice.jobSnapshot.title }}</dd>
            </div>
            <div>
              <dt>Invoice status</dt>
              <dd>{{ invoice.status }}</dd>
            </div>
          </div>

          <form class="stack-lg" [formGroup]="form" (ngSubmit)="saveDraft()">
            <div class="stack-md" formArrayName="lineItems">
              @for (lineItem of lineItems.controls; track lineItem; let i = $index) {
                <div class="line-item-grid" [formGroupName]="i">
                  <label class="field">
                    <span>Description</span>
                    <input type="text" formControlName="description" [readonly]="!isDraft()" />
                  </label>

                  <label class="field">
                    <span>Kind</span>
                    <select formControlName="kind" [disabled]="!isDraft()">
                      <option value="labor">Labor</option>
                      <option value="material">Material</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>

                  <label class="field">
                    <span>Unit label</span>
                    <input type="text" formControlName="unitLabel" [readonly]="!isDraft()" />
                  </label>

                  <label class="field">
                    <span>Quantity</span>
                    <input type="number" min="0" step="0.25" formControlName="quantity" [readonly]="!isDraft()" />
                  </label>

                  <label class="field">
                    <span>Rate (cents)</span>
                    <input type="number" min="0" step="1" formControlName="unitPriceCents" [readonly]="!isDraft()" />
                  </label>

                  <div class="line-item-total">
                    <strong>{{ lineTotal(i) }}</strong>
                    @if (isDraft()) {
                      <button type="button" class="ghost-button" (click)="removeLineItem(i)">Remove</button>
                    }
                  </div>
                </div>
              }
            </div>

            @if (isDraft()) {
              <button type="button" class="secondary-button" (click)="addLineItem()">Add line item</button>
            }

            <div class="summary-row">
              <span>Subtotal</span>
              <strong>{{ subtotal() }}</strong>
            </div>

            @if (error()) {
              <p class="error-text">{{ error() }}</p>
            }

            <div class="actions wrap">
              @if (isDraft()) {
                <button type="submit" class="secondary-button" [disabled]="saving()">
                  {{ saving() ? 'Saving...' : 'Save draft' }}
                </button>
                <button type="button" class="primary-button" [disabled]="issuing()" (click)="issueInvoice()">
                  {{ issuing() ? 'Generating...' : 'Issue invoice PDF' }}
                </button>
              } @else {
                <button type="button" class="secondary-button" (click)="download()">Download PDF</button>

                @if (invoice.status === 'issued') {
                  <button type="button" class="primary-button" (click)="markPaid()">Mark paid</button>
                  <button type="button" class="ghost-button" (click)="voidInvoice()">Void</button>
                }

                @if (invoice.status === 'paid') {
                  <button type="button" class="ghost-button" (click)="archive()">Archive</button>
                }

                @if (invoice.status === 'void') {
                  <button type="button" class="primary-button" (click)="createReplacement()">
                    Create replacement draft
                  </button>
                }
              }
            </div>
          </form>
        } @else {
          <div class="empty-state">
            <h2>Loading invoice...</h2>
            <p>If this persists, the invoice ID may be invalid or the data is still syncing.</p>
          </div>
        }
      </article>

      <aside class="panel stack-lg">
        @if (invoice(); as invoice) {
          <div class="page-header">
            <div>
              <p class="eyebrow">Snapshot</p>
              <h2>Stored invoice context</h2>
            </div>
          </div>

          <div class="stack-md">
            <div>
              <h3>Client snapshot</h3>
              <p>{{ invoice.clientSnapshot.displayName }}</p>
              <p>{{ invoice.clientSnapshot.companyName }}</p>
              <p>{{ invoice.clientSnapshot.billingEmail }}</p>
            </div>

            <div>
              <h3>Job snapshot</h3>
              <p>{{ invoice.jobSnapshot.title }}</p>
              <p>{{ invoice.jobSnapshot.startDate }} to {{ invoice.jobSnapshot.endDate }}</p>
              <p>{{ invoice.jobSnapshot.description }}</p>
            </div>
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
        background: rgba(56, 189, 248, 0.12);
      }

      @media (max-width: 1100px) {
        .line-item-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `
  ]
})
export class InvoiceDetailPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly invoicesRepository = inject(InvoicesRepository);
  private readonly businessProfiles = inject(BusinessProfileRepository);
  private readonly invoiceWorkflow = inject(InvoiceWorkflowService);

  readonly invoice = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('invoiceId') ?? ''),
      switchMap((invoiceId) => this.invoicesRepository.observeInvoice(invoiceId))
    ),
    { initialValue: undefined }
  );

  readonly profile = toSignal(this.businessProfiles.observeProfile(), { initialValue: null });
  readonly saving = signal(false);
  readonly issuing = signal(false);
  readonly error = signal('');
  private readonly lastPatchedInvoiceId = signal<string | null>(null);

  readonly form = this.fb.group({
    lineItems: this.fb.array([])
  });

  readonly isDraft = computed(() => this.invoice()?.status === 'draft');

  constructor() {
    effect(() => {
      const invoice = this.invoice();

      if (!invoice || this.lastPatchedInvoiceId() === invoice.id) {
        return;
      }

      this.lastPatchedInvoiceId.set(invoice.id);
      this.lineItems.clear();

      for (const lineItem of invoice.lineItems) {
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

  toCurrency(value: number): string {
    return toCurrency(value);
  }

  async saveDraft(): Promise<void> {
    if (!this.isDraft() || !this.invoice()) {
      return;
    }

    this.saving.set(true);
    this.error.set('');

    try {
      await this.invoicesRepository.updateDraft(this.invoice()!.id, this.serializeLineItems());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save draft.');
    } finally {
      this.saving.set(false);
    }
  }

  async issueInvoice(): Promise<void> {
    if (!this.invoice()) {
      return;
    }

    this.issuing.set(true);
    this.error.set('');

    try {
      const lineItems = this.serializeLineItems();
      await this.invoicesRepository.updateDraft(this.invoice()!.id, lineItems);
      await this.invoiceWorkflow.finalizeInvoice(
        {
          ...this.invoice()!,
          lineItems,
          subtotalCents: lineItems.reduce((sum, lineItem) => sum + lineItem.totalCents, 0)
        },
        this.profile()
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to issue invoice.');
    } finally {
      this.issuing.set(false);
    }
  }

  async download(): Promise<void> {
    if (!this.invoice()) {
      return;
    }

    try {
      await this.invoiceWorkflow.downloadPdf(this.invoice()!, this.profile());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to download invoice.');
    }
  }

  async markPaid(): Promise<void> {
    if (!this.invoice()) {
      return;
    }

    try {
      await this.invoicesRepository.markPaid(this.invoice()!.id);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to mark invoice as paid.');
    }
  }

  async voidInvoice(): Promise<void> {
    if (!this.invoice()) {
      return;
    }

    try {
      await this.invoicesRepository.voidInvoice(this.invoice()!.id);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to void invoice.');
    }
  }

  async archive(): Promise<void> {
    if (!this.invoice()) {
      return;
    }

    try {
      await this.invoicesRepository.archiveInvoice(this.invoice()!.id);
      await this.router.navigate(['/invoices']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to archive invoice.');
    }
  }

  async createReplacement(): Promise<void> {
    if (!this.invoice()) {
      return;
    }

    try {
      const replacementId = await this.invoiceWorkflow.createReplacementDraft(this.invoice()!);
      await this.router.navigate(['/invoices', replacementId]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to create replacement draft.');
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
