import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DOCUMENT, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { JobFormComponent, JobFormSavedEvent } from './job-form.component';

interface JobFormNavigationState {
  jobFormError?: string;
}

@Component({
  selector: 'app-job-form-page',
  standalone: true,
  imports: [JobFormComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="route-modal-page">
      <button
        type="button"
        class="route-modal-backdrop"
        (click)="close()"
        [attr.aria-label]="'common.close' | translate"
      ></button>

      <div class="route-modal-shell job-form-route-shell">
        <section class="page-grid single">
          <article class="panel stack-lg job-form-page-panel">
            <app-job-form
              [jobId]="jobId()"
              [initialStartDate]="startDate()"
              [initialEndDate]="endDate()"
              [initialError]="initialError()"
              [showExistingActions]="true"
              (cancelled)="close()"
              (saved)="handleSaved($event)"
            />
          </article>
        </section>
      </div>
    </section>
  `,
  styles: [
    `
      .job-form-route-shell {
        overflow: visible;
      }

      .panel.job-form-page-panel {
        max-height: calc(100vh - 2rem);
        overflow: auto;
        padding: 0 1.4rem 1.4rem;
      }

      @media (max-width: 720px) {
        .panel.job-form-page-panel {
          max-height: calc(100vh - 1.5rem);
        }
      }
    `
  ]
})
export class JobFormPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly document = inject(DOCUMENT);

  readonly initialError = signal<string | null>(null);
  readonly jobId = toSignal(this.route.paramMap.pipe(map((params) => params.get('jobId'))), {
    initialValue: null
  });
  readonly startDate = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('start') ?? '')), {
    initialValue: this.route.snapshot.queryParamMap.get('start') ?? ''
  });
  readonly endDate = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => params.get('end') ?? params.get('start') ?? '')
    ),
    {
      initialValue:
        this.route.snapshot.queryParamMap.get('end') ?? this.route.snapshot.queryParamMap.get('start') ?? ''
    }
  );

  constructor() {
    this.consumeNavigationState();
    this.destroyRef.onDestroy(() => this.initialError.set(null));
  }

  async handleSaved(event: JobFormSavedEvent): Promise<void> {
    if (event.mode !== 'create') {
      return;
    }

    await this.router.navigate(['/jobs', event.jobId], {
      replaceUrl: true,
      state: event.queuedUploadError
        ? ({ jobFormError: event.queuedUploadError } satisfies JobFormNavigationState)
        : undefined
    });
  }

  async close(): Promise<void> {
    if (this.shouldUseHistoryBack()) {
      this.location.back();
      return;
    }

    await this.router.navigate(['/calendar']);
  }

  private consumeNavigationState(): void {
    const windowRef = this.document.defaultView;
    const historyState = (windowRef?.history.state ?? {}) as JobFormNavigationState;

    if (!historyState.jobFormError || !windowRef) {
      return;
    }

    this.initialError.set(historyState.jobFormError);

    const nextState = { ...historyState };
    delete nextState.jobFormError;
    windowRef.history.replaceState(nextState, '', windowRef.location.href);
  }

  private shouldUseHistoryBack(): boolean {
    return (this.document.defaultView?.history.state?.navigationId ?? 0) > 1;
  }
}
