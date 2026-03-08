import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { CommonModule, DOCUMENT, Location } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { map, switchMap } from 'rxjs';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { BusinessProfileRepository } from '../../core/services/business-profile.repository';
import { InvoiceWorkflowService } from '../../core/services/invoice-workflow.service';
import { InvoicesRepository } from '../../core/services/invoices.repository';
import { InvoiceRecord, JobLineItem } from '../../core/models';
import { formatDateRange } from '../../core/utils/date.utils';
import { calculateLineTotal, normalizeAmount, toCurrency } from '../../core/utils/money.utils';

@Component({
  selector: 'app-invoice-detail-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="route-modal-page">
      <button
        type="button"
        class="route-modal-backdrop"
        (click)="close()"
        [attr.aria-label]="'common.close' | translate"
      ></button>

      <div class="route-modal-shell invoice-detail-shell">
        <section class="page-grid single">
          <article class="panel stack-lg modal-panel invoice-detail-panel">
            @if (invoice(); as invoice) {
              <div class="page-header modal-header">
                <div>
                  <p class="eyebrow">{{ 'invoices.detail.eyebrow' | translate }}</p>
                  <div class="invoice-title-row" #snapshotMenu>
                    <h2>{{ invoice.invoiceNumber }}
                    <button
                      type="button"
                      class="invoice-info-button"
                      (click)="toggleSnapshotMenu($event)"
                      [attr.aria-expanded]="snapshotMenuOpen()"
                      aria-haspopup="dialog"
                      [attr.aria-label]="'invoices.detail.snapshot.title' | translate"
                      [title]="'invoices.detail.snapshot.title' | translate"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path [attr.d]="infoIcon"></path>
                      </svg>
                    </button>
                    </h2>

                    @if (snapshotMenuOpen()) {
                      <section class="invoice-info-menu" role="dialog" [attr.aria-label]="'invoices.detail.snapshot.title' | translate">
                        <div class="invoice-info-title">
                          <div>
                            <p class="eyebrow">{{ 'invoices.detail.snapshot.eyebrow' | translate }}</p>
                            <h3>{{ 'invoices.detail.snapshot.title' | translate }}</h3>
                          </div>
                        </div>

                        <div class="stack-md">
                          <div>
                            <h3>{{ 'invoices.detail.snapshot.client' | translate }}</h3>
                            <p>{{ invoice.clientSnapshot.displayName }}</p>
                            <p>{{ invoice.clientSnapshot.companyName }}</p>
                            <p>{{ invoice.clientSnapshot.billingEmail }}</p>
                          </div>

                          <div>
                            <h3>{{ 'invoices.detail.snapshot.job' | translate }}</h3>
                            <p>{{ invoice.jobSnapshot.title }}</p>
                            <p>{{ jobDateRange(invoice) }}</p>
                            <p>{{ invoice.jobSnapshot.description }}</p>
                          </div>
                        </div>
                      </section>
                    }
                  </div>
                </div>

                <div class="actions wrap">
                  <span class="pill">{{ ('invoiceStatus.' + invoice.status) | translate }}</span>
                  <span class="pill">{{ toCurrency(invoice.subtotal) }}</span>
                  <button type="button" class="ghost-button modal-close-button" (click)="close()">
                    <span class="modal-close-label">{{ 'common.close' | translate }}</span>
                    <svg class="modal-close-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18"></path>
                    </svg>
                  </button>
                </div>
              </div>

              <div class="detail-list">
                <div>
                  <dt>{{ 'common.client' | translate }}</dt>
                  <dd>{{ invoice.clientSnapshot.displayName }}</dd>
                </div>
                <div>
                  <dt>{{ 'common.job' | translate }}</dt>
                  <dd>{{ invoice.jobSnapshot.title }}</dd>
                </div>
              </div>

              <form class="stack-lg" [formGroup]="form" (ngSubmit)="saveDraft()">
                <div class="stack-md" formArrayName="lineItems">
                  @for (lineItem of lineItems.controls; track lineItem; let i = $index) {
                    <div class="line-item-grid" [formGroupName]="i">
                      <label class="field">
                        <span>{{ 'common.description' | translate }}</span>
                        <input type="text" formControlName="description" [readonly]="!isDraft()" />
                      </label>

                      <label class="field">
                        <span>{{ 'common.kind' | translate }}</span>
                        <select
                          [attr.id]="'invoice-line-kind-' + i"
                          [attr.name]="'invoiceLineKind-' + i"
                          formControlName="kind"
                          [disabled]="!isDraft()"
                        >
                          <option value="labor">{{ 'lineItemKinds.labor' | translate }}</option>
                          <option value="material">{{ 'lineItemKinds.material' | translate }}</option>
                          <option value="custom">{{ 'lineItemKinds.custom' | translate }}</option>
                        </select>
                      </label>

                      @if (lineItem.get('kind')?.value === 'custom') {
                        <label class="field">
                          <span>{{ 'common.customKind' | translate }}</span>
                          <input type="text" formControlName="kindLabel" [readonly]="!isDraft()" />
                        </label>
                      }

                      <label class="field">
                        <span>{{ 'common.unitLabel' | translate }}</span>
                        <input type="text" formControlName="unitLabel" [readonly]="!isDraft()" />
                      </label>

                      <label class="field">
                        <span>{{ 'common.quantity' | translate }}</span>
                        <input type="number" min="0" step="0.25" formControlName="quantity" [readonly]="!isDraft()" />
                      </label>

                      <label class="field">
                        <span>{{ 'common.rate' | translate }}</span>
                        <input type="number" min="0" step="0.01" formControlName="unitPrice" [readonly]="!isDraft()" />
                      </label>

                      <div class="line-item-total">
                        <strong>{{ lineTotal(i) }}</strong>
                        @if (isDraft()) {
                          <button type="button" class="ghost-button" (click)="removeLineItem(i)">
                            {{ 'common.remove' | translate }}
                          </button>
                        }
                      </div>
                    </div>
                  }
                </div>

                @if (isDraft()) {
                  <button type="button" class="secondary-button" (click)="addLineItem()">
                    {{ 'invoices.detail.addLineItem' | translate }}
                  </button>
                }

                <div class="summary-row">
                  <span>{{ 'common.subtotal' | translate }}</span>
                  <strong>{{ subtotal() }}</strong>
                </div>

                @if (error()) {
                  <p class="error-text">{{ error() }}</p>
                }

                <div class="actions wrap">
                  @if (isDraft()) {
                    <button type="submit" class="secondary-button" [disabled]="saving()">
                      {{ saving() ? ('common.saving' | translate) : ('invoices.detail.saveDraft' | translate) }}
                    </button>
                    <button type="button" class="primary-button" [disabled]="issuing()" (click)="issueInvoice()">
                      {{
                        issuing()
                          ? ('invoices.detail.generating' | translate)
                          : ('invoices.detail.issueInvoicePdf' | translate)
                      }}
                    </button>
                  } @else {
                    <button type="button" class="secondary-button" (click)="download()">
                      {{ 'common.downloadPdf' | translate }}
                    </button>

                    @if (invoice.status === 'issued') {
                      <button type="button" class="primary-button" (click)="markPaid()">
                        {{ 'invoices.detail.markPaid' | translate }}
                      </button>
                      <button type="button" class="ghost-button" (click)="voidInvoice()">
                        {{ 'invoices.detail.voidInvoice' | translate }}
                      </button>
                    }

                    @if (invoice.status === 'paid') {
                      <button type="button" class="ghost-button" (click)="archive()">
                        {{ 'common.archive' | translate }}
                      </button>
                    }

                    @if (invoice.status === 'void') {
                      <button type="button" class="primary-button" (click)="createReplacement()">
                        {{ 'invoices.detail.createReplacement' | translate }}
                      </button>
                    }
                  }
                </div>
              </form>
            } @else {
              <div class="empty-state">
                <h2>{{ 'invoices.detail.loading.title' | translate }}</h2>
                <p>{{ 'invoices.detail.loading.body' | translate }}</p>
              </div>
            }
          </article>

        </section>
      </div>
    </section>
  `,
  styles: [
    `
      .line-item-grid {
        display: grid;
        grid-template-columns: 2fr repeat(5, minmax(0, 1fr)) auto;
        gap: 0.85rem;
        align-items: end;
        padding: 1rem;
        border-radius: 1rem;
        background: var(--surface-muted);
      }

      .line-item-total {
        display: grid;
        gap: 0.6rem;
        justify-items: end;
      }

      .invoice-title-row {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        position: relative;
        width: fit-content;
      }

      .invoice-detail-shell {
        overflow: hidden;
      }

      .panel.invoice-detail-panel {
        max-height: calc(100vh - 2rem);
        overflow: auto;
        overscroll-behavior: contain;
      }

      .summary-row {
        display: flex;
        justify-content: space-between;
        padding: 1rem 1.2rem;
        border-radius: 1rem;
        background: rgba(56, 189, 248, 0.12);
      }

      .invoice-info-button {
        width: 2rem;
        height: 2rem;
        border-radius: 999px;
        border: 1px solid var(--secondary-border);
        background: var(--surface-raised);
        color: var(--text-muted);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        flex: 0 0 auto;
      }

      .invoice-info-button svg {
        width: 1rem;
        height: 1rem;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .invoice-info-menu {
        position: absolute;
        top: calc(100% + 0.7rem);
        left: 0;
        z-index: 8;
        width: min(24rem, calc(100vw - 4rem));
        padding: 1rem;
        border-radius: 1.2rem;
        border: 1px solid var(--panel-border);
        background: var(--panel);
        box-shadow: var(--shadow);
      }

      .invoice-info-title {
        margin-bottom: 0.9rem;
      }

      .actions.wrap {
        justify-content: flex-end;
        align-self: center;
      }

      @media (max-width: 1100px) {
        .line-item-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 720px) {
        .panel.invoice-detail-panel {
          max-height: calc(100vh - 1.5rem);
        }
      }
    `
  ]
})
export class InvoiceDetailPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly document = inject(DOCUMENT);
  private readonly invoicesRepository = inject(InvoicesRepository);
  private readonly businessProfiles = inject(BusinessProfileRepository);
  private readonly invoiceWorkflow = inject(InvoiceWorkflowService);
  private readonly i18n = inject(AppI18nService);

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
  readonly snapshotMenuOpen = signal(false);
  readonly infoIcon = 'M12 8h.01M11 12h1v4m0 5a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z';
  private readonly lastPatchedInvoiceId = signal<string | null>(null);
  private readonly snapshotMenuRef = viewChild<ElementRef<HTMLElement>>('snapshotMenu');

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
    const unitPrice = normalizeAmount(group.get('unitPrice')?.value ?? 0);
    return toCurrency(calculateLineTotal(quantity, unitPrice));
  }

  subtotal(): string {
    return toCurrency(this.serializeLineItems().reduce((sum, lineItem) => sum + lineItem.total, 0));
  }

  toCurrency(value: number): string {
    return toCurrency(value);
  }

  toggleSnapshotMenu(event: Event): void {
    event.stopPropagation();
    this.snapshotMenuOpen.update((open) => !open);
  }

  async saveDraft(): Promise<void> {
    if (!this.isDraft() || !this.invoice()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set(this.i18n.instant('invoices.detail.errors.validation'));
      return;
    }

    this.saving.set(true);
    this.error.set('');

    try {
      await this.invoicesRepository.updateDraft(this.invoice()!.id, this.serializeLineItems());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('invoices.detail.errors.saveDraft'));
    } finally {
      this.saving.set(false);
    }
  }

  async issueInvoice(): Promise<void> {
    if (!this.invoice()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set(this.i18n.instant('invoices.detail.errors.validation'));
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
          subtotal: lineItems.reduce((sum, lineItem) => sum + lineItem.total, 0)
        },
        this.profile()
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('invoices.detail.errors.issue'));
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
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('invoices.detail.errors.download'));
    }
  }

  async markPaid(): Promise<void> {
    if (!this.invoice()) {
      return;
    }

    try {
      await this.invoicesRepository.markPaid(this.invoice()!.id);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('invoices.detail.errors.markPaid'));
    }
  }

  async voidInvoice(): Promise<void> {
    if (!this.invoice()) {
      return;
    }

    try {
      await this.invoicesRepository.voidInvoice(this.invoice()!.id);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('invoices.detail.errors.void'));
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
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('invoices.detail.errors.archive'));
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
      this.error.set(error instanceof Error ? error.message : this.i18n.instant('invoices.detail.errors.replacement'));
    }
  }

  async close(): Promise<void> {
    if (this.shouldUseHistoryBack()) {
      this.location.back();
      return;
    }

    await this.router.navigate(['/invoices']);
  }

  jobDateRange(invoice: InvoiceRecord): string {
    return formatDateRange(
      invoice.jobSnapshot.startDate,
      invoice.jobSnapshot.endDate,
      this.i18n.currentLocale()
    );
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent): void {
    if (!this.snapshotMenuOpen()) {
      return;
    }

    const menuHost = this.snapshotMenuRef()?.nativeElement;

    if (!menuHost || menuHost.contains(event.target as Node)) {
      return;
    }

    this.snapshotMenuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    this.snapshotMenuOpen.set(false);
  }

  private createLineItemGroup(lineItem?: Partial<JobLineItem>) {
    return this.fb.group(
      {
        id: [lineItem?.id ?? crypto.randomUUID()],
        kind: [lineItem?.kind ?? 'labor', Validators.required],
        kindLabel: [lineItem?.kind === 'custom' ? (lineItem.kindLabel ?? '') : ''],
        description: [lineItem?.description ?? '', Validators.required],
        quantity: [lineItem?.quantity ?? 1, [Validators.required, Validators.min(0)]],
        unitLabel: [lineItem?.unitLabel ?? 'hour', Validators.required],
        unitPrice: [normalizeAmount(lineItem?.unitPrice ?? 0), [Validators.required, Validators.min(0)]]
      },
      {
        validators: [this.customKindValidator()]
      }
    );
  }

  private serializeLineItems(): JobLineItem[] {
    return this.lineItems.controls.map((control) => {
      const quantity = Number(control.get('quantity')?.value ?? 0);
      const unitPrice = normalizeAmount(control.get('unitPrice')?.value ?? 0);
      const kind = control.get('kind')?.value;
      const kindLabel = control.get('kindLabel')?.value?.trim() ?? '';

      return {
        id: control.get('id')?.value ?? crypto.randomUUID(),
        kind,
        kindLabel: kind === 'custom' ? kindLabel : undefined,
        description: control.get('description')?.value?.trim() ?? '',
        quantity,
        unitLabel: control.get('unitLabel')?.value?.trim() ?? '',
        unitPrice,
        total: calculateLineTotal(quantity, unitPrice)
      };
    });
  }

  private customKindValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (control.get('kind')?.value !== 'custom') {
        return null;
      }

      return control.get('kindLabel')?.value?.trim() ? null : { kindLabelRequired: true };
    };
  }

  private shouldUseHistoryBack(): boolean {
    return (this.document.defaultView?.history.state?.navigationId ?? 0) > 1;
  }
}
