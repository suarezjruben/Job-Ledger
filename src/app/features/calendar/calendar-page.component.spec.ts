import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { ClientRecord, InvoiceRecord, JobRecord } from '../../core/models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { ClientsRepository } from '../../core/services/clients.repository';
import { InvoicesRepository } from '../../core/services/invoices.repository';
import { InvoiceWorkflowService } from '../../core/services/invoice-workflow.service';
import { JobImagesRepository } from '../../core/services/job-images.repository';
import { JobsRepository } from '../../core/services/jobs.repository';
import { CalendarPageComponent } from './calendar-page.component';

describe('CalendarPageComponent', () => {
  let fixture: ComponentFixture<CalendarPageComponent>;
  let component: CalendarPageComponent;
  let router: jasmine.SpyObj<Router>;
  let jobsRepository: jasmine.SpyObj<JobsRepository>;
  let invoicesRepository: jasmine.SpyObj<InvoicesRepository>;
  let invoiceWorkflow: jasmine.SpyObj<InvoiceWorkflowService>;
  let jobsSubject: BehaviorSubject<JobRecord[]>;
  let invoiceSubject: BehaviorSubject<InvoiceRecord | undefined>;

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
    jobsSubject = new BehaviorSubject<JobRecord[]>([baseJob]);
    invoiceSubject = new BehaviorSubject<InvoiceRecord | undefined>(baseInvoice);

    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    jobsRepository = jasmine.createSpyObj<JobsRepository>('JobsRepository', ['observeJobs', 'clearJobInvoice']);
    jobsRepository.observeJobs.and.returnValue(jobsSubject.asObservable());
    jobsRepository.clearJobInvoice.and.resolveTo();

    invoicesRepository = jasmine.createSpyObj<InvoicesRepository>('InvoicesRepository', ['observeInvoice', 'deleteInvoice']);
    invoicesRepository.observeInvoice.and.callFake(() => invoiceSubject.asObservable());
    invoicesRepository.deleteInvoice.and.resolveTo();

    invoiceWorkflow = jasmine.createSpyObj<InvoiceWorkflowService>('InvoiceWorkflowService', ['createDraftForJob']);
    invoiceWorkflow.createDraftForJob.and.resolveTo('invoice-2');

    await TestBed.configureTestingModule({
      imports: [CalendarPageComponent],
      providers: [
        {
          provide: Router,
          useValue: router
        },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap({})),
            snapshot: {
              queryParamMap: convertToParamMap({})
            }
          }
        },
        {
          provide: ClientsRepository,
          useValue: {
            observeClients: () => of([client])
          }
        },
        {
          provide: InvoicesRepository,
          useValue: invoicesRepository
        },
        {
          provide: JobImagesRepository,
          useValue: {
            observeImages: () => of([]),
            getImageDownloadUrl: () => Promise.resolve('')
          }
        },
        {
          provide: JobsRepository,
          useValue: jobsRepository
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
    }).overrideComponent(CalendarPageComponent, {
      set: {
        template: ''
      }
    }).compileComponents();

    fixture = TestBed.createComponent(CalendarPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('navigates to the invoice detail page without issuing a second navigation back to the calendar', async () => {
    component.selectedJobId.set(baseJob.id);
    router.navigate.and.resolveTo(true);

    await component.viewInvoice('invoice-456');

    expect(router.navigate.calls.count()).toBe(1);
    expect(router.navigate).toHaveBeenCalledWith(['/invoices', 'invoice-456']);
    expect(component.selectedJobId()).toBeNull();
    expect(component.error()).toBe('');
  });

  it('keeps the modal open when invoice navigation fails', async () => {
    component.selectedJobId.set(baseJob.id);
    router.navigate.and.resolveTo(false);

    await component.viewInvoice('invoice-456');

    expect(router.navigate.calls.count()).toBe(1);
    expect(component.selectedJobId()).toBe(baseJob.id);
    expect(component.error()).toBe('calendar.errors.viewInvoice');
  });

  it('allows generating a new invoice for an invoiced job when line items differ from the linked invoice', async () => {
    component.selectedJobId.set(baseJob.id);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.canCreateInvoice(baseJob)).toBeFalse();

    jobsSubject.next([
      {
        ...baseJob,
        lineItems: [...baseJob.lineItems, buildLineItem('line-2', 'Trim', 45)]
      }
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.canCreateInvoice(component.selectedJob()!)).toBeTrue();
  });

  it('deletes the linked invoice and clears the job invoice reference after confirmation', async () => {
    component.selectedJobId.set(baseJob.id);
    fixture.detectChanges();
    await fixture.whenStable();
    spyOn(window, 'confirm').and.returnValue(true);

    await component.deleteInvoice(baseJob);

    expect(invoicesRepository.deleteInvoice).toHaveBeenCalledWith(baseJob.invoiceId!);
    expect(jobsRepository.clearJobInvoice).toHaveBeenCalledWith(baseJob.id, 'completed');
    expect(component.message()).toBe('jobs.form.invoiceDeleted');
  });
});
