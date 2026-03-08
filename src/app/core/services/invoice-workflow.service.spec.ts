import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { BusinessProfile, InvoiceBusinessSnapshot, InvoiceRecord } from '../models';
import { AppI18nService } from './app-i18n.service';
import { BusinessProfileRepository } from './business-profile.repository';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoiceWorkflowService } from './invoice-workflow.service';
import { InvoicesRepository } from './invoices.repository';
import { JobsRepository } from './jobs.repository';

describe('InvoiceWorkflowService', () => {
  let service: InvoiceWorkflowService;
  let businessProfiles: jasmine.SpyObj<BusinessProfileRepository>;
  let invoices: jasmine.SpyObj<InvoicesRepository>;
  let jobs: jasmine.SpyObj<JobsRepository>;
  let pdf: jasmine.SpyObj<InvoicePdfService>;

  const profile: BusinessProfile = {
    businessName: 'Job Ledger LLC',
    contactEmail: 'owner@example.com',
    phone: '555-0100',
    mailingAddress: {
      line1: '123 Main St',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701'
    },
    invoicePrefix: 'INV',
    nextInvoiceSequence: 2
  };

  const businessSnapshot: InvoiceBusinessSnapshot = {
    businessName: 'Job Ledger LLC',
    contactEmail: 'owner@example.com',
    phone: '555-0100',
    mailingAddress: {
      line1: '123 Main St',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701'
    }
  };

  const invoice: InvoiceRecord = {
    id: 'invoice-123',
    invoiceNumber: 'INV-0001',
    jobId: 'job-456',
    clientId: 'client-789',
    status: 'draft',
    lineItems: [
      {
        id: 'line-1',
        kind: 'labor',
        description: 'Paint walls',
        quantity: 2,
        unitLabel: 'hours',
        unitPriceCents: 5000,
        totalCents: 10000
      }
    ],
    subtotalCents: 10000,
    clientSnapshot: {
      displayName: 'Acme Co',
      billingEmail: 'billing@acme.com'
    },
    jobSnapshot: {
      title: 'Interior repaint',
      startDate: '2026-03-01',
      endDate: '2026-03-01'
    },
    issuedAt: null,
    paidAt: null,
    archivedAt: null,
    createdAt: {} as never,
    updatedAt: {} as never
  };

  beforeEach(() => {
    businessProfiles = jasmine.createSpyObj<BusinessProfileRepository>('BusinessProfileRepository', ['observeProfile']);
    invoices = jasmine.createSpyObj<InvoicesRepository>('InvoicesRepository', ['finalizeInvoice']);
    jobs = jasmine.createSpyObj<JobsRepository>('JobsRepository', ['setJobInvoice']);
    pdf = jasmine.createSpyObj<InvoicePdfService>('InvoicePdfService', ['buildInvoicePdf', 'triggerDownload']);

    businessProfiles.observeProfile.and.returnValue(of(profile));

    TestBed.configureTestingModule({
      providers: [
        InvoiceWorkflowService,
        {
          provide: AppI18nService,
          useValue: {
            instant: (key: string) => key
          }
        },
        {
          provide: BusinessProfileRepository,
          useValue: businessProfiles
        },
        {
          provide: InvoicesRepository,
          useValue: invoices
        },
        {
          provide: JobsRepository,
          useValue: jobs
        },
        {
          provide: InvoicePdfService,
          useValue: pdf
        }
      ]
    });

    service = TestBed.inject(InvoiceWorkflowService);
  });

  it('issues invoices with a frozen business snapshot and no storage lookup', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    pdf.buildInvoicePdf.and.returnValue(blob);
    invoices.finalizeInvoice.and.resolveTo();
    jobs.setJobInvoice.and.resolveTo();

    await service.finalizeInvoice(invoice, profile);

    expect(pdf.buildInvoicePdf).toHaveBeenCalledWith(
      jasmine.objectContaining({
        status: 'issued',
        businessSnapshot
      }),
      businessSnapshot
    );
    expect(invoices.finalizeInvoice).toHaveBeenCalledWith(invoice.id, businessSnapshot);
    expect(jobs.setJobInvoice).toHaveBeenCalledWith(invoice.jobId, invoice.id, 'invoiced');
    expect(pdf.triggerDownload).toHaveBeenCalledWith(blob, `${invoice.invoiceNumber}.pdf`);
  });

  it('uses the frozen invoice business snapshot for downloads', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    pdf.buildInvoicePdf.and.returnValue(blob);
    const currentProfile: BusinessProfile = {
      ...profile,
      businessName: 'New Business Name',
      contactEmail: 'new@example.com'
    };

    await service.downloadPdf(
      {
        ...invoice,
        status: 'issued',
        businessSnapshot
      },
      currentProfile
    );

    expect(businessProfiles.observeProfile).not.toHaveBeenCalled();
    expect(pdf.buildInvoicePdf).toHaveBeenCalledWith(
      jasmine.objectContaining({
        businessSnapshot
      }),
      businessSnapshot
    );
    expect(pdf.triggerDownload).toHaveBeenCalledWith(blob, `${invoice.invoiceNumber}.pdf`);
  });

  it('falls back to the current business profile for legacy invoices without a snapshot', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    pdf.buildInvoicePdf.and.returnValue(blob);

    await service.downloadPdf({
      ...invoice,
      status: 'issued'
    });

    expect(businessProfiles.observeProfile).toHaveBeenCalled();
    expect(pdf.buildInvoicePdf).toHaveBeenCalledWith(
      jasmine.objectContaining({
        status: 'issued'
      }),
      businessSnapshot
    );
    expect(pdf.triggerDownload).toHaveBeenCalledWith(blob, `${invoice.invoiceNumber}.pdf`);
  });
});
