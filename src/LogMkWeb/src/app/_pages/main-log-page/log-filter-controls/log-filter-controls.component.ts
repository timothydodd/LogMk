
import { ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { startOfToday, subDays, subHours, subMonths } from 'date-fns'; // Import date-fns for date manipulations
import { LucideAngularModule } from 'lucide-angular';

import { debounceTime } from 'rxjs';
import { SelectComponent, ModalContainerService, ToastService } from '@rd-ui';
import { FilterPresetsModalComponent } from '../../../_components/filter-presets-modal/filter-presets-modal.component';
import { TimeFilter, TimeFilterDropdownComponent } from '../../../_components/time-filter-dropdown/time-filter-dropdown.component';
import { AudioService } from '../../../_services/audio.service';
import { ChartTypeService } from '../../../_services/chart-type.service';
import { ChartVisibilityService } from '../../../_services/chart-visibility.service';
import { ExportService } from '../../../_services/export.service';
import { FilterPresetsService } from '../../../_services/filter-presets.service';
import { LineNumbersService } from '../../../_services/line-numbers.service';
import { LiveUpdatesService } from '../../../_services/live-updates.service';
import { LogGroupingService } from '../../../_services/log-grouping.service';
import { LogProcessingService } from '../../../_services/log-processing.service';
import { LogApiService } from '../../../_services/log.api';
import { MemoryManagementService } from '../../../_services/memory-management.service';
import { TimestampService } from '../../../_services/timestamp.service';
import { ViewModeService } from '../../../_services/view-mode.service';
import { LogFilterState } from '../_services/log-filter-state';

@Component({
  selector: 'app-log-filter-controls',
  standalone: true,
  imports: [FormsModule, SelectComponent, TimeFilterDropdownComponent, LucideAngularModule],
  template: `
    <div class="compact-toolbar filter-container-base">
      <!-- Search Input -->
      <div class="filter-item search-wrapper search-wrapper-base">
        <lucide-icon name="search" size="14" class="input-icon"></lucide-icon>
        <input
          class="search-input search-input-base compact-control"
          id="search"
          type="text"
          placeholder="Search logs..."
          [ngModel]="searchString()"
          (ngModelChange)="searchString.set($event)"
        />
      </div>

      <!-- Log Levels Filter -->
      <div class="filter-item">
        <rd-select
          id="log-level-select"
          [items]="logLevels"
          [triState]="true"
          [searchable]="true"
          searchPlaceholder="Search levels..."
          placeholder="Log Levels"
          [minWidth]="140"
          size="compact"
          [ngModel]="logFilterState.triStateLogLevel()"
          (ngModelChange)="logFilterState.triStateLogLevel.set($event)"
        ></rd-select>
      </div>

      <!-- Pods Filter -->
      <div class="filter-item">
        <rd-select
          id="pod-select"
          [items]="pods()"
          [triState]="true"
          [searchable]="true"
          searchPlaceholder="Search pods..."
          placeholder="Pods"
          [minWidth]="120"
          size="compact"
          [ngModel]="logFilterState.triStatePod()"
          (ngModelChange)="logFilterState.triStatePod.set($event)"
        ></rd-select>
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


      <!-- Clear Filters Button -->
      <button
        class="clear-filters-btn action-btn-base"
        (click)="clearAllFilters()"
        [disabled]="!hasActiveFilters()"
        [title]="'Clear all filters'"
      >
        <lucide-icon name="filter-x" size="16"></lucide-icon>
      </button>

      <!-- Actions Menu -->
      <div class="actions-menu">
        <button
          class="actions-btn action-btn-base"
          (click)="toggleActionsMenu()"
          [title]="'Actions menu'"
          [class.active]="showActionsMenu()"
        >
          <lucide-icon name="more-vertical" size="16"></lucide-icon>
        </button>

        @if (showActionsMenu()) {
          <div class="actions-dropdown dropdown-menu-base">
            <!-- Display Settings Category -->
            <div class="category-header category-header-base submenu-trigger" (click)="toggleDisplayCategory()">
              <lucide-icon name="eye" size="12"></lucide-icon>
              Display
              <lucide-icon name="chevron-down" size="12" [class.rotated]="showDisplayCategory()"></lucide-icon>
            </div>

            @if (showDisplayCategory()) {
              <div class="category-content">
                <button
                  class="action-item dropdown-item-base"
                  (click)="toggleTimestampFormat()"
                >
                  <lucide-icon name="clock" size="14"></lucide-icon>
                  {{ timestampService.timestampFormat() === 'relative' ? 'Show Absolute Time' : 'Show Relative Time' }}
                </button>

                <button
                  class="action-item dropdown-item-base"
                  (click)="toggleViewMode()"
                >
                  <lucide-icon name="{{ viewModeService.isCompact() ? 'maximize-2' : 'minimize-2' }}" size="14"></lucide-icon>
                  {{ viewModeService.isCompact() ? 'Expanded View' : 'Compact View' }}
                </button>

                <button
                  class="action-item dropdown-item-base"
                  (click)="toggleLogGrouping()"
                >
                  <lucide-icon name="group" size="14"></lucide-icon>
                  {{ groupingService.isGroupingEnabled() ? 'Disable Grouping' : 'Enable Grouping' }}
                </button>

                <button
                  class="action-item dropdown-item-base"
                  (click)="toggleLineNumbers()"
                >
                  <lucide-icon name="hash" size="14"></lucide-icon>
                  {{ lineNumbersService.isLineNumbersEnabled() ? 'Hide Line Numbers' : 'Show Line Numbers' }}
                </button>
              </div>
            }

            <!-- Live Updates Category -->
            <div class="category-header category-header-base submenu-trigger" (click)="toggleLiveUpdatesCategory()">
              <lucide-icon name="activity" size="12"></lucide-icon>
              Live Updates
              <lucide-icon name="chevron-down" size="12" [class.rotated]="showLiveUpdatesCategory()"></lucide-icon>
            </div>

            @if (showLiveUpdatesCategory()) {
              <div class="category-content">
                <button
                  class="action-item dropdown-item-base"
                  (click)="toggleLiveUpdates()"
                >
                  <lucide-icon name="{{ liveUpdatesService.isLiveUpdatesEnabled() ? 'pause' : 'play' }}" size="14"></lucide-icon>
                  {{ liveUpdatesService.isLiveUpdatesEnabled() ? 'Pause Live Updates' : 'Resume Live Updates' }}
                  @if (liveUpdatesService.queuedLogsCount() > 0) {
                    <span class="badge">{{ liveUpdatesService.queuedLogsCount() }}</span>
                  }
                </button>

                <button
                  class="action-item dropdown-item-base"
                  (click)="toggleSoundAlerts()"
                >
                  <lucide-icon name="{{ audioService.soundSettings().enabled ? 'volume-2' : 'volume-x' }}" size="14"></lucide-icon>
                  {{ audioService.soundSettings().enabled ? 'Disable Sound Alerts' : 'Enable Sound Alerts' }}
                </button>
              </div>
            }

            <!-- Chart Settings Category -->
            <div class="category-header category-header-base submenu-trigger" (click)="toggleChartCategory()">
              <lucide-icon name="eye" size="12"></lucide-icon>
              Chart Display
              <lucide-icon name="chevron-down" size="12" [class.rotated]="showChartCategory()"></lucide-icon>
            </div>

            @if (showChartCategory()) {
              <div class="category-content">
                <button
                  class="action-item dropdown-item-base"
                  (click)="toggleChartVisibility()"
                >
                  <lucide-icon name="{{ chartVisibilityService.isChartVisible() ? 'eye-off' : 'eye' }}" size="14"></lucide-icon>
                  {{ chartVisibilityService.isChartVisible() ? 'Hide Chart' : 'Show Chart' }}
                </button>
              </div>
            }

            <!-- Chart Type Category -->
            <div class="category-header category-header-base submenu-trigger" (click)="toggleChartTypeCategory()">
              <lucide-icon name="bar-chart-3" size="12"></lucide-icon>
              Chart Type
              <lucide-icon name="chevron-down" size="12" [class.rotated]="showChartTypeCategory()"></lucide-icon>
            </div>

            @if (showChartTypeCategory()) {
              <div class="category-content">
                @for (chartType of chartTypeService.chartTypes; track chartType.type) {
                  <button
                    class="action-item dropdown-item-base"
                    [class.active]="chartTypeService.selectedChartType() === chartType.type"
                    (click)="selectChartType(chartType.type)">
                    <lucide-icon name="{{ chartType.icon }}" size="14"></lucide-icon>
                    {{ chartType.label }}
                  </button>
                }
              </div>
            }

            <!-- Filter Presets Category -->
            <div class="category-header category-header-base submenu-trigger" (click)="toggleDataCategory()">
              <lucide-icon name="bookmark" size="12"></lucide-icon>
              Filter Presets
              <lucide-icon name="chevron-down" size="12" [class.rotated]="showDataCategory()"></lucide-icon>
            </div>

            @if (showDataCategory()) {
              <div class="category-content">
                <button
                  class="action-item dropdown-item-base"
                  (click)="openPresetsModal()"
                >
                  <lucide-icon name="bookmark" size="14"></lucide-icon>
                  Manage Presets
                </button>
              </div>
            }

            <!-- Export Category -->
            <div class="category-header category-header-base submenu-trigger" (click)="toggleExportCategory()">
              <lucide-icon name="download" size="12"></lucide-icon>
              Export Logs
              <lucide-icon name="chevron-down" size="12" [class.rotated]="showExportCategory()"></lucide-icon>
            </div>

            @if (showExportCategory()) {
              <div class="category-content">
                <button class="action-item dropdown-item-base" (click)="exportLogs('csv')">
                  <lucide-icon name="download" size="14"></lucide-icon>
                  Export as CSV
                </button>
                <button class="action-item dropdown-item-base" (click)="exportLogs('json')">
                  <lucide-icon name="download" size="14"></lucide-icon>
                  Export as JSON
                </button>
              </div>
            }

            <!-- Memory Management Category -->
            <div class="category-header category-header-base submenu-trigger" (click)="toggleMemoryCategory()">
              <lucide-icon name="database" size="12"></lucide-icon>
              Memory Management
              <lucide-icon name="chevron-down" size="12" [class.rotated]="showMemoryCategory()"></lucide-icon>
            </div>

            @if (showMemoryCategory()) {
              <div class="category-content">
                <div class="memory-info">
                  <div class="memory-stat">
                    <span class="stat-label">Current Logs:</span>
                    <span class="stat-value">{{ memoryManagementService.currentLogCount() }}</span>
                  </div>
                  <div class="memory-stat">
                    <span class="stat-label">Max Logs:</span>
                    <span class="stat-value">{{ memoryManagementService.maxLogsInMemory() }}</span>
                  </div>
                  <div class="memory-usage-bar">
                    <div class="usage-bar"
                         [style.width.%]="memoryManagementService.memoryUsagePercentage()"
                         [class.warning]="memoryManagementService.memoryUsagePercentage() > 75"
                         [class.critical]="memoryManagementService.memoryUsagePercentage() > 90">
                    </div>
                    <span class="usage-text">{{ memoryManagementService.memoryUsagePercentage() }}%</span>
                  </div>
                </div>

                <div class="memory-controls">
                  <div class="memory-setting">
                    <label for="maxLogs">Max Logs in Memory:</label>
                    <input
                      id="maxLogs"
                      type="number"
                      min="100"
                      max="50000"
                      step="100"
                      class="memory-input search-input-base"
                      [ngModel]="memoryManagementService.maxLogsInMemory()"
                      (ngModelChange)="updateMaxLogs($event)">
                  </div>

                  <div class="memory-setting">
                    <label class="checkbox-label">
                      <input
                        type="checkbox"
                        [ngModel]="memoryManagementService.autoCleanupEnabled()"
                        (ngModelChange)="memoryManagementService.setAutoCleanupEnabled($event)">
                      <span class="checkmark"></span>
                      Auto-cleanup enabled
                    </label>
                  </div>

                  @if (memoryManagementService.autoCleanupEnabled()) {
                    <div class="memory-setting">
                      <label for="cleanupThreshold">Cleanup at {{ memoryManagementService.cleanupThreshold() }}% usage:</label>
                      <input
                        id="cleanupThreshold"
                        type="range"
                        min="50"
                        max="100"
                        step="5"
                        class="memory-slider"
                        [ngModel]="memoryManagementService.cleanupThreshold()"
                        (ngModelChange)="memoryManagementService.setCleanupThreshold($event)">
                    </div>

                    <div class="memory-setting">
                      <label for="cleanupAmount">Remove {{ memoryManagementService.cleanupAmount() }}% of logs:</label>
                      <input
                        id="cleanupAmount"
                        type="range"
                        min="10"
                        max="75"
                        step="5"
                        class="memory-slider"
                        [ngModel]="memoryManagementService.cleanupAmount()"
                        (ngModelChange)="memoryManagementService.setCleanupAmount($event)">
                    </div>
                  }

                  <button
                    class="action-item memory-reset-btn"
                    (click)="resetMemorySettings()">
                    <lucide-icon name="rotate-ccw" size="14"></lucide-icon>
                    Reset to Defaults
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styleUrl: './log-filter-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogFilterControlsComponent {
  logService = inject(LogApiService);
  logFilterState = inject(LogFilterState);
  logProcessingService = inject(LogProcessingService);
  exportService = inject(ExportService);
  toast = inject(ToastService);
  elementRef = inject(ElementRef);
  timestampService = inject(TimestampService);
  presetsService = inject(FilterPresetsService);
  viewModeService = inject(ViewModeService);
  liveUpdatesService = inject(LiveUpdatesService);
  groupingService = inject(LogGroupingService);
  lineNumbersService = inject(LineNumbersService);
  audioService = inject(AudioService);
  chartVisibilityService = inject(ChartVisibilityService);
  chartTypeService = inject(ChartTypeService);
  memoryManagementService = inject(MemoryManagementService);
  modalContainerService = inject(ModalContainerService);

  logLevels = ['Debug', 'Information', 'Warning', 'Error'];
  pods = signal<string[]>([]);
  searchString = signal<string>('');
  selectedTimeFilter = signal<TimeFilter | null>(null);
  showActionsMenu = signal<boolean>(false);
  showDisplayCategory = signal<boolean>(true);
  showLiveUpdatesCategory = signal<boolean>(true);
  showChartCategory = signal<boolean>(true);
  showChartTypeCategory = signal<boolean>(true);
  showDataCategory = signal<boolean>(true);
  showExportCategory = signal<boolean>(true);
  showMemoryCategory = signal<boolean>(true);

  hasActiveFilters = computed(() => {
    const triStateLogLevel = this.logFilterState.triStateLogLevel();
    const triStatePod = this.logFilterState.triStatePod();

    return (
      (this.logFilterState.selectedLogLevel()?.length ?? 0) > 0 ||
      (this.logFilterState.selectedPod()?.length ?? 0) > 0 ||
      this.searchString().length > 0 ||
      this.logFilterState.selectedTimeRange() !== null ||
      this.logFilterState.customTimeRange() !== null ||
      (triStateLogLevel?.included?.length ?? 0) > 0 ||
      (triStateLogLevel?.excluded?.length ?? 0) > 0 ||
      (triStatePod?.included?.length ?? 0) > 0 ||
      (triStatePod?.excluded?.length ?? 0) > 0
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
    // Clear all filter states
    this.logFilterState.selectedLogLevel.set([]);
    this.logFilterState.selectedPod.set([]);
    this.searchString.set('');
    this.logFilterState.searchString.set('');
    this.logFilterState.selectedTimeRange.set(null);
    this.logFilterState.customTimeRange.set(null);
    this.logFilterState.triStateLogLevel.set(null);
    this.logFilterState.triStatePod.set(null);
    this.selectedTimeFilter.set(this.timeFilters[0]); // Reset to 'Any'
  }


  toggleActionsMenu(): void {
    this.showActionsMenu.set(!this.showActionsMenu());
  }

  toggleDisplayCategory(): void {
    this.showDisplayCategory.set(!this.showDisplayCategory());
  }

  toggleLiveUpdatesCategory(): void {
    this.showLiveUpdatesCategory.set(!this.showLiveUpdatesCategory());
  }

  toggleChartCategory(): void {
    this.showChartCategory.set(!this.showChartCategory());
  }

  toggleChartTypeCategory(): void {
    this.showChartTypeCategory.set(!this.showChartTypeCategory());
  }

  toggleDataCategory(): void {
    this.showDataCategory.set(!this.showDataCategory());
  }

  toggleExportCategory(): void {
    this.showExportCategory.set(!this.showExportCategory());
  }

  toggleMemoryCategory(): void {
    this.showMemoryCategory.set(!this.showMemoryCategory());
  }

  toggleTimestampFormat(): void {
    this.showActionsMenu.set(false);
    this.timestampService.toggleFormat();
  }

  toggleViewMode(): void {
    this.showActionsMenu.set(false);
    this.viewModeService.toggleViewMode();
  }

  toggleLiveUpdates(): void {
    this.showActionsMenu.set(false);

    const wasEnabled = this.liveUpdatesService.isLiveUpdatesEnabled();
    this.liveUpdatesService.toggleLiveUpdates();

    if (wasEnabled) {
      this.toast.warning('Live updates paused. New logs will be queued.', 'Live Updates');
    } else {
      const queuedCount = this.liveUpdatesService.queuedLogsCount();
      this.toast.success(
        queuedCount > 0 ? `Live updates resumed. ${queuedCount} queued logs processed.` : 'Live updates resumed',
        'Live Updates'
      );
    }
  }

  toggleLogGrouping(): void {
    this.showActionsMenu.set(false);
    this.groupingService.toggleGrouping();

    const isEnabled = this.groupingService.isGroupingEnabled();
    this.toast.info(
      isEnabled ? 'Log grouping enabled. Consecutive identical logs will be grouped.' : 'Log grouping disabled. All logs shown individually.',
      'Log Grouping'
    );
  }

  toggleLineNumbers(): void {
    this.showActionsMenu.set(false);
    this.lineNumbersService.toggleLineNumbers();

    const isEnabled = this.lineNumbersService.isLineNumbersEnabled();
    this.toast.info(
      isEnabled ? 'Line numbers shown for easy reference.' : 'Line numbers hidden.',
      'Line Numbers',
      2000
    );
  }

  toggleSoundAlerts(): void {
    this.showActionsMenu.set(false);
    this.audioService.toggleEnabled();

    const isEnabled = this.audioService.soundSettings().enabled;
    this.toast.info(
      isEnabled ? 'Sound alerts enabled for errors and warnings.' : 'Sound alerts disabled.',
      'Sound Alerts',
      2000
    );

    // Play test sound when enabling
    if (isEnabled) {
      setTimeout(() => {
        this.audioService.playTestSound();
      }, 500);
    }
  }

  toggleChartVisibility(): void {
    this.showActionsMenu.set(false);
    this.chartVisibilityService.toggleVisibility();

    const isVisible = this.chartVisibilityService.isChartVisible();
    this.toast.info(
      isVisible ? 'Chart is now visible.' : 'Chart is now hidden to maximize log space.',
      'Chart Display',
      2000
    );
  }

  selectChartType(chartType: any): void {
    this.showActionsMenu.set(false);
    this.chartTypeService.setChartType(chartType);

    const typeOption = this.chartTypeService.getChartTypeOption(chartType);
    this.toast.info(
      `Chart type changed to ${typeOption?.label || chartType}.`,
      'Chart Type',
      2000
    );
  }

  openPresetsModal(): void {
    this.showActionsMenu.set(false);
    this.modalContainerService.openComponent(FilterPresetsModalComponent);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      if (this.showActionsMenu()) {
        this.showActionsMenu.set(false);
      }
    }
  }

  exportLogs(format: 'csv' | 'json'): void {
    this.showActionsMenu.set(false);

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

      this.toast.success(
        `Logs exported successfully in ${format.toUpperCase()} format`,
        'Export Complete'
      );
    } catch (error) {
      this.toast.error(
        'Failed to export logs. Please try again.',
        'Export Error'
      );
    }
  }

  // Temporary method to generate mock logs for export demo
  // In production, this would come from your actual log data source
  private generateMockExportLogs() {
    const rawMockLogs = [];
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

    // Generate raw logs
    for (let i = 0; i < 50; i++) {
      const timestamp = new Date(Date.now() - Math.random() * 86400000 * 7); // Last 7 days
      const pod = pods[Math.floor(Math.random() * pods.length)];
      const level = levels[Math.floor(Math.random() * levels.length)];
      const message = messages[Math.floor(Math.random() * messages.length)];

      rawMockLogs.push({
        id: i + 1,
        deployment: deployments[Math.floor(Math.random() * deployments.length)],
        timeStamp: timestamp,
        pod: pod,
        logLevel: level,
        line: `[${timestamp.toISOString()}] ${level}: ${message} - ID: ${i + 1}`, // Include timestamp in line
        view: '', // Will be set by transformation
        podColor: '', // Will be set by transformation
        sequenceNumber: i + 1
      });
    }

    // Use service to transform logs with proper pod colors and cleaned lines
    return this.logProcessingService.transformLogs(rawMockLogs as any);
  }

  // Memory management methods
  updateMaxLogs(value: number): void {
    this.memoryManagementService.setMaxLogsInMemory(value);
  }

  resetMemorySettings(): void {
    this.memoryManagementService.resetToDefaults();
    this.toast.info('Memory settings reset to defaults', 'Memory Management', 2000);
  }
}
