import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  BusinessProfile,
  ClientRecord,
  InvoiceBusinessSnapshot,
  InvoiceRecord,
  JobRecord
} from '../models';
import { AppI18nService } from './app-i18n.service';
import { BusinessProfileRepository } from './business-profile.repository';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesRepository } from './invoices.repository';
import { JobsRepository } from './jobs.repository';

@Injectable({ providedIn: 'root' })
export class InvoiceWorkflowService {
  private readonly i18n = inject(AppI18nService);
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
    const businessSnapshot = await this.resolveBusinessSnapshotFromProfile(
      profile,
      'pdf.errors.missingProfileIssue'
    );

    const issuedInvoice: InvoiceRecord = {
      ...invoice,
      status: 'issued',
      businessSnapshot
    };

    const pdfBlob = this.pdf.buildInvoicePdf(issuedInvoice, businessSnapshot);
    await this.invoices.finalizeInvoice(invoice.id, businessSnapshot);
    await this.jobs.setJobInvoice(invoice.jobId, invoice.id, 'invoiced');
    this.pdf.triggerDownload(pdfBlob, `${invoice.invoiceNumber}.pdf`);
  }

  async downloadPdf(invoice: InvoiceRecord, profile?: BusinessProfile | null): Promise<void> {
    const businessSnapshot =
      invoice.businessSnapshot ??
      (await this.resolveBusinessSnapshotFromProfile(profile, 'pdf.errors.missingProfileDownload'));
    const pdfBlob = this.pdf.buildInvoicePdf(invoice, businessSnapshot);
    this.pdf.triggerDownload(pdfBlob, `${invoice.invoiceNumber}.pdf`);
  }

  private async resolveBusinessSnapshotFromProfile(
    profile: BusinessProfile | null | undefined,
    missingProfileKey: string
  ): Promise<InvoiceBusinessSnapshot> {
    const businessProfile = profile ?? (await firstValueFrom(this.businessProfiles.observeProfile()));

    if (!businessProfile) {
      throw new Error(this.i18n.instant(missingProfileKey));
    }

    return this.toBusinessSnapshot(businessProfile);
  }

  private toBusinessSnapshot(profile: BusinessProfile): InvoiceBusinessSnapshot {
    const businessSnapshot: InvoiceBusinessSnapshot = {
      businessName: profile.businessName,
      contactEmail: profile.contactEmail
    };

    if (profile.phone) {
      businessSnapshot.phone = profile.phone;
    }

    if (profile.mailingAddress) {
      businessSnapshot.mailingAddress = profile.mailingAddress;
    }

    return businessSnapshot;
  }
}
