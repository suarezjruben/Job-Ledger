import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { ClientRecord, InvoiceRecord, JobRecord } from '../../core/models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { ClientsRepository } from '../../core/services/clients.repository';
import { InvoiceWorkflowService } from '../../core/services/invoice-workflow.service';
import { InvoicesRepository } from '../../core/services/invoices.repository';
import { JobImagesRepository } from '../../core/services/job-images.repository';
import { JobsRepository } from '../../core/services/jobs.repository';
import { JobFormComponent } from './job-form.component';

describe('JobFormComponent', () => {
  let fixture: ComponentFixture<JobFormComponent>;
  let component: JobFormComponent;
  let jobSubject: BehaviorSubject<JobRecord | undefined>;
  let invoiceSubject: BehaviorSubject<InvoiceRecord | undefined>;
  let invoicesRepository: jasmine.SpyObj<InvoicesRepository>;
  let jobsRepository: jasmine.SpyObj<JobsRepository>;
  let invoiceWorkflow: jasmine.SpyObj<InvoiceWorkflowService>;
  let router: jasmine.SpyObj<Router>;

  const client: ClientRecord = {
    id: 'client-1',
    displayName: 'Acme Co',
    archivedAt: null,
    createdAt: {} as never,
    updatedAt: {} as never
  };

  const buildLineItem = (id: string, description: string, total: number) => ({
    id,
    kind: 'labor' as const,
    description,
    quantity: 1,
    unitLabel: 'hour',
    unitPrice: total,
    total
  });

  const baseJob: JobRecord = {
    id: 'job-1',
    clientId: client.id,
    title: 'Kitchen repaint',
    status: 'invoiced',
    startDate: '2026-03-07',
    endDate: '2026-03-07',
    lineItems: [buildLineItem('line-1', 'Walls', 120)],
    invoiceId: 'invoice-1',
    attachmentCount: 0,
    archivedAt: null,
    createdAt: {} as never,
    updatedAt: {} as never
  };

  const baseInvoice: InvoiceRecord = {
    id: 'invoice-1',
    invoiceNumber: 'INV-0001',
    jobId: baseJob.id,
    clientId: client.id,
    status: 'issued',
    lineItems: [buildLineItem('line-1', 'Walls', 120)],
    subtotal: 120,
    clientSnapshot: {
      displayName: client.displayName
    },
    jobSnapshot: {
      title: baseJob.title,
      startDate: baseJob.startDate,
      endDate: baseJob.endDate
    },
    issuedAt: null,
    paidAt: null,
    archivedAt: null,
    createdAt: {} as never,
    updatedAt: {} as never
  };

  beforeEach(async () => {
    jobSubject = new BehaviorSubject<JobRecord | undefined>(baseJob);
    invoiceSubject = new BehaviorSubject<InvoiceRecord | undefined>(baseInvoice);

    invoicesRepository = jasmine.createSpyObj<InvoicesRepository>('InvoicesRepository', ['observeInvoice', 'deleteInvoice']);
    invoicesRepository.observeInvoice.and.callFake(() => invoiceSubject.asObservable());
    invoicesRepository.deleteInvoice.and.resolveTo();

    jobsRepository = jasmine.createSpyObj<JobsRepository>('JobsRepository', ['observeJob', 'updateJob', 'clearJobInvoice']);
    jobsRepository.observeJob.and.callFake(() => jobSubject.asObservable());
    jobsRepository.updateJob.and.resolveTo();
    jobsRepository.clearJobInvoice.and.resolveTo();

    invoiceWorkflow = jasmine.createSpyObj<InvoiceWorkflowService>('InvoiceWorkflowService', ['createDraftForJob']);
    invoiceWorkflow.createDraftForJob.and.resolveTo('invoice-2');

    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);

    await TestBed.configureTestingModule({
      imports: [JobFormComponent],
      providers: [
        {
          provide: Router,
          useValue: router
        },
        {
          provide: JobsRepository,
          useValue: jobsRepository
        },
        {
          provide: InvoicesRepository,
          useValue: invoicesRepository
        },
        {
          provide: ClientsRepository,
          useValue: {
            observeClients: () => of([client])
          }
        },
        {
          provide: JobImagesRepository,
          useValue: {
            observeImages: () => of([]),
            getImageDownloadUrl: () => Promise.resolve('')
          }
        },
        {
          provide: InvoiceWorkflowService,
          useValue: invoiceWorkflow
        },
        {
          provide: AppI18nService,
          useValue: {
            currentLocale: () => 'en-US',
            instant: (key: string) => key
          }
        }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).overrideComponent(JobFormComponent, {
      set: {
        template: ''
      }
    }).compileComponents();

    fixture = TestBed.createComponent(JobFormComponent);
    fixture.componentRef.setInput('jobId', baseJob.id);
    fixture.componentRef.setInput('showExistingActions', true);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('allows generating a new invoice when saved job line items differ from the linked invoice', () => {
    expect(component.canCreateInvoice()).toBeFalse();

    component.addLineItem();
    component.lineItems.at(1).patchValue({
      description: 'Trim',
      unitPrice: 45
    });
    fixture.detectChanges();

    expect(component.canCreateInvoice()).toBeTrue();
  });

  it('creates a new invoice from the current form line items when they differ from the linked invoice', async () => {
    component.addLineItem();
    component.lineItems.at(1).patchValue({
      description: 'Trim',
      unitPrice: 45
    });

    await component.createInvoice();

    expect(jobsRepository.updateJob).toHaveBeenCalledWith(
      baseJob.id,
      jasmine.objectContaining({
        lineItems: jasmine.arrayContaining([jasmine.objectContaining({ description: 'Trim', total: 45 })])
      })
    );
    expect(invoiceWorkflow.createDraftForJob).toHaveBeenCalledWith(
      jasmine.objectContaining({
        lineItems: jasmine.arrayContaining([jasmine.objectContaining({ description: 'Trim', total: 45 })])
      }),
      client
    );
    expect(router.navigate).toHaveBeenCalledWith(['/invoices', 'invoice-2']);
  });

  it('deletes the linked invoice and clears the job invoice reference after confirmation', async () => {
    spyOn(window, 'confirm').and.returnValue(true);

    await component.deleteInvoice(baseJob);

    expect(invoicesRepository.deleteInvoice).toHaveBeenCalledWith(baseJob.invoiceId!);
    expect(jobsRepository.clearJobInvoice).toHaveBeenCalledWith(baseJob.id, 'completed');
    expect(component.message()).toBe('jobs.form.invoiceDeleted');
  });
});
