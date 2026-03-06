import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { fromEvent, merge, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { hasConfiguredFirebase } from '../../core/utils/firebase.utils';

@Component({
  selector: 'app-status-banner',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!online()) {
      <div class="status-banner warning">
        <strong>{{ 'status.offline.title' | translate }}</strong>
        {{ 'status.offline.body' | translate }}
      </div>
    }

    @if (showConfigWarning()) {
      <div class="status-banner info">
        <strong>{{ 'status.firebase.title' | translate }}</strong>
        {{ 'status.firebase.body' | translate }}
        <code>src/environments/environment*.ts</code>.
      </div>
    }
  `
})
export class AppStatusBannerComponent {
  readonly online = toSignal(
    merge(
      of(typeof navigator === 'undefined' ? true : navigator.onLine),
      fromEvent(window, 'online').pipe(map(() => true)),
      fromEvent(window, 'offline').pipe(map(() => false))
    ),
    { initialValue: true }
  );

  readonly showConfigWarning = computed(() => !hasConfiguredFirebase(environment.firebase));
}
