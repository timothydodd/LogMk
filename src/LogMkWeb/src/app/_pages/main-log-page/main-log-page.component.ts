
import { ChangeDetectionStrategy, Component, effect, inject, TemplateRef, viewChild, HostListener } from '@angular/core';
import { AuthService } from '../../_services/auth-service';
import { ToolbarService } from '../../_services/toolbar.service';
import { LogFilterControlsComponent } from './log-filter-controls/log-filter-controls.component';
import { LogStatsComponent } from './log-stats/log-stats.component';
import { LogViewportComponent } from './log-viewport/log-viewport.component';
import { LogFilterState } from './_services/log-filter-state';

@Component({
  selector: 'app-main-log-page',
  standalone: true,
  imports: [LogViewportComponent, LogFilterControlsComponent, LogStatsComponent],
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
  logFilterState = inject(LogFilterState);
  filterControls = viewChild(LogFilterControlsComponent);
  logViewport = viewChild(LogViewportComponent);

  constructor(){
    effect(() => {
      var sharedLink = this.filters();

      if (sharedLink) {
        this.toolbarService.setToolbarContent(sharedLink);
      }
    });

    // Listen for error filter event from navbar badge
    window.addEventListener('filterErrors', (event: any) => {
      const { logLevels } = event.detail;
      if (logLevels) {
        this.logFilterState.selectedLogLevel.set(logLevels);
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    // Don't trigger shortcuts if user is typing in an input
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;

    // Ctrl/Cmd + F - Focus search
    if (cmdOrCtrl && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      this.focusSearch();
      return;
    }

    // Ctrl/Cmd + Shift + C - Clear filters
    if (cmdOrCtrl && event.shiftKey && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      this.clearFilters();
      return;
    }

    // Single letter shortcuts (only when not in input fields)
    if (!cmdOrCtrl && !event.shiftKey && !event.altKey) {
      switch (event.key.toLowerCase()) {
        case 'e':
          event.preventDefault();
          this.showOnlyErrors();
          break;
        case 'w':
          event.preventDefault();
          this.showOnlyWarnings();
          break;
        case 'arrowup':
        case 'arrowdown':
          // Let the log viewport handle arrow key navigation
          break;
      }
    }
  }

  private focusSearch() {
    // Find and focus the search input
    const searchInput = document.querySelector('.search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }

  private clearFilters() {
    const controls = this.filterControls();
    if (controls) {
      controls.clearAllFilters();
    }
  }

  private showOnlyErrors() {
    this.logFilterState.selectedLogLevel.set(['Error']);
  }

  private showOnlyWarnings() {
    this.logFilterState.selectedLogLevel.set(['Warning']);
  }

  logOut() {
    this.authService.logout();
  }
}
