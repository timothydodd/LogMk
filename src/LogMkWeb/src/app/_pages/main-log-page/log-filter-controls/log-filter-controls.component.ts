
import { ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { startOfToday, subDays, subHours, subMonths } from 'date-fns'; // Import date-fns for date manipulations
import { LucideAngularModule } from 'lucide-angular';
import { ToastrService } from 'ngx-toastr';
import { debounceTime } from 'rxjs';
import { DropdownComponent } from '../../../_components/dropdown/dropdown.component';
import { FilterPresetsModalComponent } from '../../../_components/filter-presets-modal/filter-presets-modal.component';
import { TimeFilterDropdownComponent, TimeFilter } from '../../../_components/time-filter-dropdown/time-filter-dropdown.component';
import { ExportService } from '../../../_services/export.service';
import { FilterPresetsService } from '../../../_services/filter-presets.service';
import { LogApiService } from '../../../_services/log.api';
import { TimestampService } from '../../../_services/timestamp.service';
import { ViewModeService } from '../../../_services/view-mode.service';
import { LogFilterState } from '../_services/log-filter-state';

@Component({
  selector: 'app-log-filter-controls',
  standalone: true,
  imports: [FormsModule, DropdownComponent, TimeFilterDropdownComponent, LucideAngularModule, FilterPresetsModalComponent],
  template: `
    <div class="compact-toolbar">
      <!-- Search Input -->
      <div class="filter-item search-wrapper">
        <lucide-icon name="search" size="14" class="input-icon"></lucide-icon>
        <input
          class="search-input"
          id="search"
          type="text"
          placeholder="Search logs..."
          [ngModel]="searchString()"
          (ngModelChange)="searchString.set($event)"
        />
      </div>

      <!-- Log Levels Filter -->
      <div class="filter-item">
        <app-dropdown
          id="log-level-select"
          [items]="logLevels"
          [multiple]="true"
          [searchable]="true"
          [showSelectAll]="true"
          searchPlaceholder="Search levels..."
          selectAllLabel="All Levels"
          placeholder="Log Levels"
          [maxTagsDisplay]="1"
          [showCount]="true"
          [minWidth]="140"
          size="compact"
          [ngModel]="logFilterState.selectedLogLevel()"
          (ngModelChange)="logFilterState.selectedLogLevel.set($event)"
        ></app-dropdown>
      </div>

      <!-- Pods Filter -->
      <div class="filter-item">
        <app-dropdown
          id="pod-select"
          [items]="pods()"
          [multiple]="true"
          [searchable]="true"
          [showSelectAll]="true"
          searchPlaceholder="Search pods..."
          selectAllLabel="All Pods"
          placeholder="Pods"
          [showCount]="true"
          [minWidth]="120"
          size="compact"
          [ngModel]="logFilterState.selectedPod()"
          (ngModelChange)="logFilterState.selectedPod.set($event)"
        ></app-dropdown>
      </div>

      <!-- Time Range Filter -->
      <div class="filter-item">
        <app-time-filter-dropdown
          [timeFilters]="timeFilters"
          [selectedFilter]="selectedTimeFilter()"
          (filterChange)="selectedTimeFilter.set($event)"
          placeholder="Time Range"
        ></app-time-filter-dropdown>
      </div>

      <!-- Actions Menu -->
      <div class="actions-menu">
        <button
          class="actions-btn"
          (click)="toggleActionsMenu()"
          [title]="'Actions menu'"
          [class.active]="showActionsMenu()"
        >
          <lucide-icon name="more-vertical" size="16"></lucide-icon>
        </button>

        @if (showActionsMenu()) {
          <div class="actions-dropdown">
            <!-- Clear Filters -->
            <button
              class="action-item"
              (click)="clearAllFilters()"
              [disabled]="!hasActiveFilters()"
            >
              <lucide-icon name="filter-x" size="14"></lucide-icon>
              Clear Filters
            </button>

            <!-- Timestamp Format Toggle -->
            <button
              class="action-item"
              (click)="toggleTimestampFormat()"
            >
              <lucide-icon name="clock" size="14"></lucide-icon>
              {{ timestampService.timestampFormat() === 'relative' ? 'Show Absolute Time' : 'Show Relative Time' }}
            </button>

            <!-- View Mode Toggle -->
            <button
              class="action-item"
              (click)="toggleViewMode()"
            >
              <lucide-icon name="{{ viewModeService.isCompact() ? 'maximize-2' : 'minimize-2' }}" size="14"></lucide-icon>
              {{ viewModeService.isCompact() ? 'Expanded View' : 'Compact View' }}
            </button>

            <!-- Filter Presets -->
            <button
              class="action-item"
              (click)="openPresetsModal()"
            >
              <lucide-icon name="bookmark" size="14"></lucide-icon>
              Filter Presets
            </button>

            <!-- Export Submenu -->
            <div class="action-item submenu-trigger" (click)="toggleExportSubmenu()">
              <lucide-icon name="download" size="14"></lucide-icon>
              Export Logs
              <lucide-icon name="chevron-down" size="12" [class.rotated]="showExportSubmenu()"></lucide-icon>
            </div>

            @if (showExportSubmenu()) {
              <div class="submenu">
                <button class="submenu-item" (click)="exportLogs('csv')">
                  CSV Format
                </button>
                <button class="submenu-item" (click)="exportLogs('json')">
                  JSON Format
                </button>
              </div>
            }
          </div>
        }
      </div>
    </div>

    <!-- Filter Presets Modal -->
    <app-filter-presets-modal #presetsModal></app-filter-presets-modal>
  `,
  styleUrl: './log-filter-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogFilterControlsComponent {
  logService = inject(LogApiService);
  logFilterState = inject(LogFilterState);
  exportService = inject(ExportService);
  toastr = inject(ToastrService);
  elementRef = inject(ElementRef);
  timestampService = inject(TimestampService);
  presetsService = inject(FilterPresetsService);
  viewModeService = inject(ViewModeService);

  presetsModal = viewChild<FilterPresetsModalComponent>('presetsModal');

  logLevels = ['Debug', 'Information', 'Warning', 'Error'];
  pods = signal<string[]>([]);
  searchString = signal<string>('');
  selectedTimeFilter = signal<TimeFilter | null>(null);
  showActionsMenu = signal<boolean>(false);
  showExportSubmenu = signal<boolean>(false);

  hasActiveFilters = computed(() => {
    return (
      (this.logFilterState.selectedLogLevel()?.length ?? 0) > 0 ||
      (this.logFilterState.selectedPod()?.length ?? 0) > 0 ||
      this.searchString().length > 0 ||
      this.logFilterState.selectedTimeRange() !== null ||
      this.logFilterState.customTimeRange() !== null
    );
  });

  hasLogsToExport = computed(() => {
    // For now, assume we have logs to export if filters are applied or not
    // In a real app, you might want to check the actual logs count
    return true;
  });

  timeFilters: TimeFilter[] = [
    { label: 'Any', value: null },
    { label: 'Last Hour', value: subHours(startOfToday(), 1) },
    { label: 'Last 3 Hours', value: subHours(startOfToday(), 3) },
    { label: 'Last 6 Hours', value: subHours(startOfToday(), 6) },
    { label: 'Last Day', value: subDays(startOfToday(), 1) },
    { label: 'Last 3 Days', value: subDays(startOfToday(), 3) },
    { label: 'Last Month', value: subMonths(startOfToday(), 1) },
    { label: 'Last 3 Months', value: subMonths(startOfToday(), 3) },
  ];
  constructor() {
    // Initialize search string from persistent state
    this.searchString.set(this.logFilterState.searchString());
    
    // Initialize time filter from persistent state
    const savedTimeRange = this.logFilterState.selectedTimeRange();
    if (savedTimeRange) {
      const matchingFilter = this.timeFilters.find(f => 
        f.value && savedTimeRange && Math.abs(f.value.getTime() - savedTimeRange.getTime()) < 1000
      );
      this.selectedTimeFilter.set(matchingFilter || this.timeFilters[0]);
    } else {
      this.selectedTimeFilter.set(this.timeFilters[3]); // Default to "Last 6 Hours"
    }

    toObservable(this.selectedTimeFilter)
      .pipe(takeUntilDestroyed())
      .subscribe((timeFilter) => {
        const t = timeFilter?.value ?? null;
        this.logFilterState.selectedTimeRange.set(t);
      });
      
    toObservable(this.searchString)
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((searchString) => {
        this.logFilterState.searchString.set(searchString);
      });
      
    this.logService.getPods().pipe(takeUntilDestroyed()).subscribe((pods) => {
      this.pods.set(pods.map((p) => p.name));
    });

  }

  clearAllFilters(): void {
    // Close menus
    this.showActionsMenu.set(false);
    this.showExportSubmenu.set(false);

    // Clear all filter states
    this.logFilterState.selectedLogLevel.set([]);
    this.logFilterState.selectedPod.set([]);
    this.searchString.set('');
    this.logFilterState.searchString.set('');
    this.logFilterState.selectedTimeRange.set(null);
    this.logFilterState.customTimeRange.set(null);
    this.selectedTimeFilter.set(this.timeFilters[0]); // Reset to 'Any'
  }

  toggleActionsMenu(): void {
    this.showActionsMenu.set(!this.showActionsMenu());
    // Close export submenu when actions menu is toggled
    if (!this.showActionsMenu()) {
      this.showExportSubmenu.set(false);
    }
  }

  toggleExportSubmenu(): void {
    this.showExportSubmenu.set(!this.showExportSubmenu());
  }

  toggleTimestampFormat(): void {
    this.showActionsMenu.set(false);
    this.timestampService.toggleFormat();
  }

  toggleViewMode(): void {
    this.showActionsMenu.set(false);
    this.viewModeService.toggleViewMode();
  }

  openPresetsModal(): void {
    this.showActionsMenu.set(false);
    this.showExportSubmenu.set(false);

    const modal = this.presetsModal();
    if (modal) {
      modal.open();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      if (this.showActionsMenu()) {
        this.showActionsMenu.set(false);
        this.showExportSubmenu.set(false);
      }
    }
  }

  exportLogs(format: 'csv' | 'json'): void {
    this.showActionsMenu.set(false);
    this.showExportSubmenu.set(false);

    // Get current filter state
    const filters = {
      logLevels: this.logFilterState.selectedLogLevel() || undefined,
      pods: this.logFilterState.selectedPod() || undefined,
      searchTerm: this.searchString() || undefined,
      timeRange: this.logFilterState.customTimeRange() || (
        this.logFilterState.selectedTimeRange() ? {
          start: this.logFilterState.selectedTimeRange()!,
          end: new Date()
        } : null
      )
    };

    // For now, we'll use a placeholder for getting filtered logs
    // In a real implementation, you'd get the actual filtered logs from the log service
    const mockLogs = this.generateMockExportLogs();

    try {
      this.exportService.exportFilteredLogs(mockLogs, filters, format);

      this.toastr.success(
        `Logs exported successfully in ${format.toUpperCase()} format`,
        'Export Complete',
        { timeOut: 3000 }
      );
    } catch (error) {
      this.toastr.error(
        'Failed to export logs. Please try again.',
        'Export Error',
        { timeOut: 5000 }
      );
    }
  }

  // Temporary method to generate mock logs for export demo
  // In production, this would come from your actual log data source
  private generateMockExportLogs() {
    const mockLogs = [];
    const deployments = ['production', 'staging', 'development'];
    const pods = ['web-app-123', 'api-server-456', 'database-789'];
    const levels = ['Information', 'Warning', 'Error', 'Debug'];
    const messages = [
      'User authentication successful',
      'Database connection established',
      'API request processed in 245ms',
      'Warning: High memory usage detected',
      'Error: Failed to connect to external service',
      'Debug: Processing batch job #1234'
    ];

    for (let i = 0; i < 50; i++) {
      const timestamp = new Date(Date.now() - Math.random() * 86400000 * 7); // Last 7 days
      mockLogs.push({
        id: i + 1,
        deployment: deployments[Math.floor(Math.random() * deployments.length)],
        timeStamp: timestamp, // Keep as Date object
        pod: pods[Math.floor(Math.random() * pods.length)],
        logLevel: levels[Math.floor(Math.random() * levels.length)],
        line: `${messages[Math.floor(Math.random() * messages.length)]} - ID: ${i + 1}`,
        view: `${messages[Math.floor(Math.random() * messages.length)]} - ID: ${i + 1}`,
        podColor: '#00eaff'
      });
    }

    return mockLogs;
  }
}
