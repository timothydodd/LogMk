import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, TemplateRef, viewChild } from '@angular/core';
import { AuthService } from '../../_services/auth-service';
import { ToolbarService } from '../../_services/toolbar.service';
import { LogFilterControlsComponent } from './log-filter-controls/log-filter-controls.component';
import { LogStatsComponent } from './log-stats/log-stats.component';
import { LogViewportComponent } from './log-viewport/log-viewport.component';

@Component({
  selector: 'app-main-log-page',
  standalone: true,
  imports: [CommonModule, LogViewportComponent, LogFilterControlsComponent, LogStatsComponent],
  template: `
   <ng-template #filters>
    <app-log-filter-controls></app-log-filter-controls>
  </ng-template>
    <app-log-stats></app-log-stats>
    <app-log-viewport></app-log-viewport>
  `,
  styleUrl: './main-log-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLogPageComponent {
  authService = inject(AuthService);
  filters = viewChild<TemplateRef<any>>('filters');
  toolbarService = inject(ToolbarService);
  constructor(){
    effect(() => {
      var sharedLink = this.filters();


      if (sharedLink) {
        this.toolbarService.setToolbarContent(sharedLink);
      }
    });
  }
  logOut() {
    this.authService.logout();
  }
}
