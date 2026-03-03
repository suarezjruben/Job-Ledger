import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BusinessProfile, ClientRecord, InvoiceRecord, JobRecord } from '../models';
import { BusinessProfileRepository } from './business-profile.repository';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesRepository } from './invoices.repository';
import { JobsRepository } from './jobs.repository';

@Injectable({ providedIn: 'root' })
export class InvoiceWorkflowService {
  private readonly businessProfiles = inject(BusinessProfileRepository);
  private readonly invoices = inject(InvoicesRepository);
  private readonly jobs = inject(JobsRepository);
  private readonly pdf = inject(InvoicePdfService);

  async createDraftForJob(job: JobRecord, client: ClientRecord): Promise<string> {
    const invoiceNumber = await this.businessProfiles.reserveInvoiceNumber();
    const invoiceId = await this.invoices.createDraftFromJob(job, client, invoiceNumber);
    await this.jobs.setJobInvoice(job.id, invoiceId, job.status === 'archived' ? 'archived' : job.status);
    return invoiceId;
  }

  async createReplacementDraft(invoice: InvoiceRecord): Promise<string> {
    const invoiceNumber = await this.businessProfiles.reserveInvoiceNumber();
    const replacementId = await this.invoices.createReplacementDraft(invoice, invoiceNumber);
    await this.jobs.setJobInvoice(invoice.jobId, replacementId);
    return replacementId;
  }

  async finalizeInvoice(invoice: InvoiceRecord, profile?: BusinessProfile | null): Promise<void> {
    const businessProfile =
      profile ?? (await firstValueFrom(this.businessProfiles.observeProfile()));

    if (!businessProfile) {
      throw new Error('Add your business profile in Settings before issuing invoices.');
    }

    const pdfBlob = this.pdf.buildInvoicePdf(invoice, businessProfile);
    await this.invoices.finalizeInvoice(invoice.id, pdfBlob);
    await this.jobs.setJobInvoice(invoice.jobId, invoice.id, 'invoiced');
    this.pdf.triggerDownload(pdfBlob, `${invoice.invoiceNumber}.pdf`);
  }

  async downloadPdf(invoice: InvoiceRecord, profile?: BusinessProfile | null): Promise<void> {
    if (invoice.pdfStoragePath) {
      const url = await this.invoices.getPdfDownloadUrl(invoice.pdfStoragePath);
      window.open(url, '_blank', 'noopener');
      return;
    }

    const businessProfile =
      profile ?? (await firstValueFrom(this.businessProfiles.observeProfile()));

    if (!businessProfile) {
      throw new Error('Add your business profile in Settings before generating invoices.');
    }

    const pdfBlob = this.pdf.buildInvoicePdf(invoice, businessProfile);
    this.pdf.triggerDownload(pdfBlob, `${invoice.invoiceNumber}.pdf`);
  }
}
