import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../_services/auth-service';
import { LogFilterControlsComponent } from './log-filter-controls/log-filter-controls.component';
import { LogStatsComponent } from './log-stats/log-stats.component';
import { LogViewportComponent } from './log-viewport/log-viewport.component';

@Component({
  selector: 'app-main-log-page',
  standalone: true,
  imports: [CommonModule, LogViewportComponent, LogFilterControlsComponent, LogStatsComponent],
  template: `
    <app-log-filter-controls></app-log-filter-controls>
    <app-log-stats></app-log-stats>
    <app-log-viewport></app-log-viewport>
  `,
  styleUrl: './main-log-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLogPageComponent {
  authService = inject(AuthService);
  logOut() {
    this.authService.logout();
  }
}
