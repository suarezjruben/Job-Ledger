import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { ClientsRepository } from '../../core/services/clients.repository';
import { InvoicesRepository } from '../../core/services/invoices.repository';
import { JobImagesRepository } from '../../core/services/job-images.repository';
import { JobsRepository } from '../../core/services/jobs.repository';
import { InvoiceWorkflowService } from '../../core/services/invoice-workflow.service';
import { CalendarPageComponent } from './calendar-page.component';

describe('CalendarPageComponent', () => {
  let fixture: ComponentFixture<CalendarPageComponent>;
  let component: CalendarPageComponent;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [CalendarPageComponent],
      providers: [
        {
          provide: Router,
          useValue: router
        },
        {
          provide: ClientsRepository,
          useValue: {
            observeClients: () => of([])
          }
        },
        {
          provide: InvoicesRepository,
          useValue: {
            observeInvoice: () => of(undefined)
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
          provide: JobsRepository,
          useValue: {
            observeJobs: () => of([])
          }
        },
        {
          provide: InvoiceWorkflowService,
          useValue: {}
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

  it('navigates to the invoice detail page before closing the selected job modal', async () => {
    component.selectedJobId.set('job-123');
    router.navigate.and.resolveTo(true);

    await component.viewInvoice('invoice-456');

    expect(router.navigate).toHaveBeenCalledWith(['/invoices', 'invoice-456']);
    expect(component.selectedJobId()).toBeNull();
    expect(component.error()).toBe('');
  });

  it('keeps the modal open when navigation fails', async () => {
    component.selectedJobId.set('job-123');
    router.navigate.and.resolveTo(false);

    await component.viewInvoice('invoice-456');

    expect(component.selectedJobId()).toBe('job-123');
    expect(component.error()).toBe('calendar.errors.viewInvoice');
  });
});
