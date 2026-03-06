import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppStatusBannerComponent } from './shared/components/app-status-banner.component';
import { AppI18nService } from './core/services/app-i18n.service';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppStatusBannerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  private readonly theme = inject(ThemeService);
  private readonly i18n = inject(AppI18nService);

  constructor() {
    void this.theme;
    void this.i18n;
  }
}
