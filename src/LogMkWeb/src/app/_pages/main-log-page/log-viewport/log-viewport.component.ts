import { CommonModule } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { ToastrService } from 'ngx-toastr';
import { combineLatest, Subject, switchMap, tap } from 'rxjs';
import { ContextMenuComponent } from '../../../_components/context-menu/context-menu.component';
import { LogDetailsModalComponent } from '../../../_components/log-details-modal/log-details-modal.component';
import { VirtualScrollerComponent } from '../../../_components/scroller/ngx-virtual-scroller.component';
import { TimestampFormatPipe } from '../../../_pipes/timestamp-format.pipe';
import { AudioService } from '../../../_services/audio.service';
import { LineNumbersService } from '../../../_services/line-numbers.service';
import { LiveUpdatesService } from '../../../_services/live-updates.service';
import { LogGroup, LogGroupingService } from '../../../_services/log-grouping.service';
import { LogApiService } from '../../../_services/log.api';
import { LogProcessingService } from '../../../_services/log-processing.service';
import { MemoryManagementService } from '../../../_services/memory-management.service';
import { Log, SignalRService } from '../../../_services/signalr.service';
import { ViewModeService } from '../../../_services/view-mode.service';
import { HighlightLogPipe, LogLevelPipe } from '../_services/highlight.directive';
import { LogFilterState } from '../_services/log-filter-state';
@Component({
  selector: 'app-log-viewport',
  standalone: true,
  imports: [CommonModule, VirtualScrollerComponent, HighlightLogPipe, LogLevelPipe, LucideAngularModule, TimestampFormatPipe, LogDetailsModalComponent, ContextMenuComponent],
  template: `
    @if(parentScrollElement(); as parentScrollElement) {
    <virtual-scroller
      #scrollViewport
      [items]="groupedLogs()"
      [bufferAmount]="10"
      [scrollThrottlingTime]="50"
      [enableUnequalChildrenSizes]="true"
      [checkResizeInterval]="1000"
      [scrollAnimationTime]="750"
      [parentScroll]="parentScrollElement"
      class="virtual-scroll-container">

      @for (item of scrollViewport.viewPortItems; track trackByItem($index, item); let i = $index) {
        @if (isLogGroup(item)) {
          <!-- Log Group Display -->
          <div class="log-group"
               [class.compact]="viewModeService.isCompact()"
               [class.expanded]="viewModeService.isExpanded()">
            <!-- Group Header -->
            <div class="log-group-header"
                 (click)="toggleGroupExpansion(item.id)"
                 [title]="'Click to ' + (item.isExpanded ? 'collapse' : 'expand') + ' group'">
              <button class="group-toggle">
                <lucide-icon
                  [name]="item.isExpanded ? 'chevron-down' : 'chevron-right'"
                  size="14">
                </lucide-icon>
              </button>
              <span class="group-badge">{{ item.count }}</span>
              <div class="group-content">
                @if (lineNumbersService.isLineNumbersEnabled()) {
                  <div class="line-number">{{ getLineNumber(i) }}</div>
                }
                <div class="time">{{ item.representative.timeStamp | timestampFormat }}</div>
                <div class="pod" [ngStyle]="{'color': item.representative.podColor}">{{ item.representative.pod }}</div>
                <div class="type" [ngClass]="item.representative.logLevel | LogLevelPipe">{{ item.representative.logLevel | LogLevelPipe }}</div>
                <div class="line flexible-wrap" [innerHTML]="item.representative.view | highlightLog:logFilterState.searchString()" [title]="item.representative.line"></div>
              </div>
            </div>

            <!-- Expanded Group Content -->
            @if (item.isExpanded) {
              <div class="group-items">
                @for (groupLog of item.logs; track groupLog.id) {
                  <div class="log-item grouped-item"
                       [class.copied]="copiedLogId() === groupLog.id.toString()"
                       [class.selected]="selectedLogId() === groupLog.id.toString()"
                       [class.compact]="viewModeService.isCompact()"
                       [attr.data-log-id]="groupLog.id.toString()"
                       [class.expanded]="viewModeService.isExpanded()"
                       (click)="selectItem(groupLog.id.toString())"
                       (dblclick)="openLogModal(groupLog)"
                       (contextmenu)="showContextMenu($event, groupLog)">
                    <div class="desktop-layout">
                      @if (lineNumbersService.isLineNumbersEnabled()) {
                        <div class="line-number">{{ getLineNumber(i) }}.{{ $index + 1 }}</div>
                      }
                      <div class="time">{{ groupLog.timeStamp | timestampFormat }}</div>
                      <div class="pod" [ngStyle]="{'color':groupLog.podColor}">{{ groupLog.pod }}</div>
                      <div class="type" [ngClass]="groupLog.logLevel | LogLevelPipe">{{ groupLog.logLevel | LogLevelPipe }}</div>
                      <div class="line flexible-wrap" [innerHTML]="groupLog.view | highlightLog:logFilterState.searchString()" [title]="groupLog.line"></div>
                      <button class="copy-btn" (click)="copyLog(groupLog); $event.stopPropagation()">
                        @if (copiedLogId() === groupLog.id.toString()) {
                          <lucide-icon name="check" size="14"></lucide-icon>
                        } @else {
                          <lucide-icon name="copy" size="14"></lucide-icon>
                        }
                      </button>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        } @else {
          <!-- Regular Log Display -->
          <div class="log-item"
               [class.copied]="copiedLogId() === item.id.toString()"
               [class.selected]="selectedLogId() === item.id.toString()"
               [class.compact]="viewModeService.isCompact()"
               [attr.data-log-id]="item.id.toString()"
               [class.expanded]="viewModeService.isExpanded()"
               [class.mobile-even]="i % 2 === 0"
               [class.mobile-odd]="i % 2 === 1"
               (click)="selectItem(item.id.toString())"
               (dblclick)="openLogModal(item)"
               (contextmenu)="showContextMenu($event, item)"
               title="Double-click to view full log details">

          <!-- Desktop Layout (flex row) -->
          <div class="desktop-layout">
            @if (lineNumbersService.isLineNumbersEnabled()) {
              <div class="line-number">{{ getLineNumber(i) }}</div>
            }
            <div class="time">{{ item.timeStamp | timestampFormat }}</div>
            <div class="pod" [ngStyle]="{'color':item.podColor}">{{ item.pod }}</div>
            <div class="type" [ngClass]="item.logLevel | LogLevelPipe">{{ item.logLevel | LogLevelPipe }}</div>
            <div class="line flexible-wrap" [innerHTML]="item.view | highlightLog:logFilterState.searchString()" [title]="item.line"></div>
            <button
              class="copy-btn"
              (click)="copyLog(item); $event.stopPropagation()"
              [title]="'Copy log to clipboard'"
            >
              @if (copiedLogId() === item.id.toString()) {
                <lucide-icon name="check" size="14"></lucide-icon>
              } @else {
                <lucide-icon name="copy" size="14"></lucide-icon>
              }
            </button>
          </div>

          <!-- Mobile Layout (two rows) -->
          <div class="mobile-layout">
            <div class="mobile-row-1">
              @if (lineNumbersService.isLineNumbersEnabled()) {
                <div class="line-number">{{ getLineNumber(i) }}</div>
              }
              <div class="time">{{ item.timeStamp | timestampFormat }}</div>
              <div class="pod" [ngStyle]="{'color':item.podColor}">{{ item.pod }}</div>
              <div class="type" [ngClass]="item.logLevel | LogLevelPipe">{{ item.logLevel | LogLevelPipe }}</div>
              <button
                class="copy-btn"
                (click)="copyLog(item); $event.stopPropagation()"
                [title]="'Copy log to clipboard'"
              >
                @if (copiedLogId() === item.id.toString()) {
                  <lucide-icon name="check" size="14"></lucide-icon>
                } @else {
                  <lucide-icon name="copy" size="14"></lucide-icon>
                }
              </button>
            </div>
            <div class="mobile-row-2">
              <div class="line flexible-wrap" [innerHTML]="item.view | highlightLog:logFilterState.searchString()" [title]="item.line"></div>
            </div>
          </div>
        </div>
        }
      }

      @if (logs().length > 0) {
        <div class="load-more-container">
          <button (click)="$loadMoreTrigger.next()" class="btn btn-primary">
            Load More Logs
          </button>
        </div>
      }
    </virtual-scroller>
    }

    <!-- Log Details Modal -->
    <app-log-details-modal #logDetailsModal></app-log-details-modal>

    <!-- Context Menu -->
    <app-context-menu
      #contextMenu
      (actionSelected)="onContextMenuAction($event)"
      (menuClosed)="onContextMenuClosed()"
    ></app-context-menu>
  `,
  styleUrl: './log-viewport.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogViewportComponent {
  destroyRef = inject(DestroyRef);
  logApi = inject(LogApiService);
  signalRService = inject(SignalRService);
  logProcessingService = inject(LogProcessingService);
  logs = signal<Log[]>([]);
  groupedLogs = signal<(Log | LogGroup)[]>([]);
  logFilterState = inject(LogFilterState);
  viewModeService = inject(ViewModeService);
  liveUpdatesService = inject(LiveUpdatesService);
  groupingService = inject(LogGroupingService);
  lineNumbersService = inject(LineNumbersService);
  audioService = inject(AudioService);
  memoryManagementService = inject(MemoryManagementService);
  page = 1;
  ignoreScroll = true;
  $loadMoreTrigger = new Subject<void>();
  viewPort = viewChild<VirtualScrollerComponent>('scrollViewport');
  contextMenu = viewChild<ContextMenuComponent>('contextMenu');
  logDetailsModal = viewChild<LogDetailsModalComponent>('logDetailsModal');
  private elementRef = inject(ElementRef);
  private toastr = inject(ToastrService);
  copiedLogId = signal<string | null>(null);
  selectedLogId = signal<string | null>(null);




  // Synchronize selection between template clicks and virtual scroller
  selectItem(itemId: string) {
    this.selectedLogId.set(itemId);
  }

  // Memory management is now handled by MemoryManagementService
  
  // Parent scroll element for virtual scroller
  parentScrollElement = signal<Element | Window | null>(null);
  
  // TrackBy function for better performance
  trackByLogId = (index: number, item: Log): string => {
    return item.id.toString();
  };

  // TrackBy function for grouped logs
  trackByItem = (index: number, item: Log | LogGroup): string => {
    if (this.groupingService.isLogGroup(item)) {
      return item.id;
    }
    return item.id.toString();
  };

  // Get line number for display
  getLineNumber = (index: number): number => {
    return index + 1;
  };

  // Type guard for template
  isLogGroup = (item: Log | LogGroup): item is LogGroup => {
    return this.groupingService.isLogGroup(item);
  };

  // Toggle group expansion
  toggleGroupExpansion(groupId: string): void {
    this.groupedLogs.update(items =>
      this.groupingService.toggleGroupExpansion(items, groupId)
    );
  };

  constructor() {
    // Find the parent scroll container after render
    afterNextRender(() => {
      this.findParentScrollContainer();
    });

    // Update grouped logs whenever logs or grouping state changes
    effect(() => {
      const logs = this.logs();
      const isGroupingEnabled = this.groupingService.isGroupingEnabled();

      // Update memory management service with current log count
      this.memoryManagementService.updateCurrentLogCount(logs.length);

      if (isGroupingEnabled) {
        this.groupedLogs.set(this.groupingService.groupLogs(logs));
      } else {
        this.groupedLogs.set(logs);
      }
    });
    
    // const vpO = toObservable(this.viewPort);
    // vpO.subscribe((vp: any) => {
    //   if (vp) {
    //     vp.element.nativeElement.style.height = vp.element.nativeElement.parentElement?.clientHeight + 'px';
    //   }
    // });
    this.$loadMoreTrigger
      .asObservable()
      .pipe(
        switchMap(() => {
          this.page++;

          // Extract include/exclude arrays from tri-state values using service
          const filters = this.logProcessingService.extractTriStateFilters(
            this.logFilterState.triStateLogLevel(),
            this.logFilterState.triStatePod()
          );

          const customRange = this.logFilterState.customTimeRange();
          if (customRange) {
            return this.logApi
              .getLogs(
                filters.includeLogLevel,
                filters.includePod,
                this.logFilterState.searchString(),
                customRange.start,
                customRange.end,
                this.page,
                200,
                filters.excludeLogLevel,
                filters.excludePod,
                ''
              );
          } else {
            return this.logApi
              .getLogs(
                filters.includeLogLevel,
                filters.includePod,
                this.logFilterState.searchString(),
                this.logFilterState.selectedTimeRange(),
                undefined,
                this.page,
                200,
                filters.excludeLogLevel,
                filters.excludePod,
                ''
              );
          }
        }),
              tap((z) => {
                if (!z.items || z.items.length === 0) return;

                // Use service to process and append logs
                const index = this.logs().length;
                this.logs.update((existingLogs) => {
                  return this.logProcessingService.processAppendLogs(
                    z.items ?? [],
                    existingLogs,
                    this.memoryManagementService.maxLogsInMemory()
                  );
                });
                this.scrollToIndex(index);
              })
        ,
        takeUntilDestroyed()
      )
      .subscribe();
    const searchString = toObservable(this.logFilterState.searchString);
    const timeRange = toObservable(this.logFilterState.selectedTimeRange);
    const customTimeRange = toObservable(this.logFilterState.customTimeRange);
    const triStateLogLevel = toObservable(this.logFilterState.triStateLogLevel);
    const triStatePod = toObservable(this.logFilterState.triStatePod);
    combineLatest([searchString, timeRange, customTimeRange, triStateLogLevel, triStatePod])
      .pipe(
        switchMap(([search, date, custom, triLogLevel, triPod]) => {
          this.page = 1;

          // Extract include/exclude arrays from tri-state values using service
          const filters = this.logProcessingService.extractTriStateFilters(triLogLevel, triPod);

          if (custom) {
            return this.logApi.getLogs(filters.includeLogLevel, filters.includePod, search, custom.start, custom.end, this.page, 200, filters.excludeLogLevel, filters.excludePod, '');
          } else {
            return this.logApi.getLogs(filters.includeLogLevel, filters.includePod, search, date, undefined, this.page, 200, filters.excludeLogLevel, filters.excludePod, '');
          }
        }),
        tap((l) => {
          // Use service to transform logs
          const transformedLogs = this.logProcessingService.transformLogs(l.items ?? []);
          this.logs.set(transformedLogs);
        }),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        this.startSignalR();
      });
  }

  monitoring = false;
  private startSignalR() {
    if (this.monitoring) return;

    this.monitoring = true;

    this.signalRService.logsReceived.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((logs) => {

      if (!logs || logs.length === 0) return;
      const search = this.logFilterState.searchString();
      const logLevel = this.logFilterState.selectedLogLevel();
      const pod = this.logFilterState.selectedPod();
      const date = this.logFilterState.selectedTimeRange();
      const customRange = this.logFilterState.customTimeRange();

      // Filter logs based on current filter state
      const filteredLogs = logs.filter((log) => {
        if (!log) return false;

        log.timeStamp = new Date(log.timeStamp);
        const logTime = new Date(log.timeStamp);

        // Check time range (custom takes priority)
        let timeMatches = true;
        if (customRange) {
          timeMatches = logTime >= customRange.start && logTime <= customRange.end;
        } else if (date) {
          timeMatches = logTime > date;
        }

        return (
          (!search || log.line.includes(search)) &&
          (!logLevel || logLevel.includes(log.logLevel)) &&
          (!pod || pod.includes(log.pod)) &&
          timeMatches
        );
      });

      // Apply exclude filters to real-time logs (still needed for SignalR since it sends all logs)
      const excludeFilteredLogs = this.applyExcludeFilters(filteredLogs);

      // If live updates are paused, queue the logs instead of displaying them
      if (!this.liveUpdatesService.isLiveUpdatesEnabled()) {
        this.liveUpdatesService.queueLogs(excludeFilteredLogs);
        return;
      }

      // Process queued logs if any when resuming
      const queuedLogs = this.liveUpdatesService.getQueuedLogs();
      const allLogsToProcess = [...queuedLogs, ...excludeFilteredLogs];

      // Play sound alerts for new logs (not queued ones)
      excludeFilteredLogs.forEach(log => {
        this.audioService.playAlert(log.logLevel);
      });

      // Use service to process new logs with transformation, sorting, deduplication, and memory management
      this.logs.update((existingLogs) => {
        return this.logProcessingService.processNewLogs(
          allLogsToProcess,
          existingLogs,
          {
            transform: true,
            sort: true,
            deduplicate: true,
            maxLogs: this.memoryManagementService.maxLogsInMemory()
          }
        );
      });

      // Clear queued logs after processing
      if (queuedLogs.length > 0) {
        this.liveUpdatesService.clearQueue();
      }

      // No auto-scroll needed since newest logs appear at top
    });
  }

  private scrollToIndex(index: number) {
    const vp = this.viewPort();
    if (!vp) {
      console.warn('Virtual scroller not initialized');
      return;
    }
    
    // Use setTimeout to ensure the DOM has updated
    setTimeout(() => {
      try {
        vp.scrollToIndex(index, true, 0, 0);
      } catch (error) {
        console.warn('Error scrolling to index:', error);
      }
    }, 50);
  }

  copyLog(log: Log) {
    const logText = `[${new Date(log.timeStamp).toISOString()}] [${log.pod}] [${log.logLevel}] ${log.line}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(logText).then(() => {
        this.copiedLogId.set(log.id.toString());
        this.toastr.success('Log copied to clipboard', '', {
          timeOut: 2000,
          positionClass: 'toast-bottom-right'
        });

        // Reset the copied state after animation
        setTimeout(() => {
          this.copiedLogId.set(null);
        }, 2000);
      }).catch(() => {
        this.toastr.error('Failed to copy log', '', {
          timeOut: 2000,
          positionClass: 'toast-bottom-right'
        });
      });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = logText;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        this.copiedLogId.set(log.id.toString());
        this.toastr.success('Log copied to clipboard', '', {
          timeOut: 2000,
          positionClass: 'toast-bottom-right'
        });
        setTimeout(() => {
          this.copiedLogId.set(null);
        }, 2000);
      } catch (err) {
        this.toastr.error('Failed to copy log', '', {
          timeOut: 2000,
          positionClass: 'toast-bottom-right'
        });
      }
      document.body.removeChild(textArea);
    }
  }


  // Context menu methods
  showContextMenu(event: MouseEvent, log: Log) {
    const menu = this.contextMenu();
    if (menu) {
      menu.show(event, log);
    }
  }

  onContextMenuAction(event: { action: string; log: Log }) {
    const { action, log } = event;

    switch (action) {
      case 'copy':
        this.copyLog(log);
        break;

      case 'details':
        this.openLogModal(log);
        break;

      case 'filter-level':
        // Filter by this log level only
        this.logFilterState.selectedLogLevel.set([log.logLevel]);
        this.toastr.info(`Filtered to show only "${log.logLevel}" logs`, 'Filter Applied');
        break;

      case 'filter-pod':
        // Filter by this pod only
        this.logFilterState.selectedPod.set([log.pod]);
        this.toastr.info(`Filtered to show only "${log.pod}" pod`, 'Filter Applied');
        break;

      case 'hide-level':
        // Hide this log level
        const currentLevels = this.logFilterState.selectedLogLevel() || ['Debug', 'Information', 'Warning', 'Error'];
        const filteredLevels = currentLevels.filter(level => level !== log.logLevel);
        this.logFilterState.selectedLogLevel.set(filteredLevels);
        this.toastr.info(`Hidden "${log.logLevel}" logs`, 'Filter Applied');
        break;

      case 'hide-pod':
        // Hide this pod
        const currentPods = this.logFilterState.selectedPod();
        if (currentPods && currentPods.length > 0) {
          const filteredPods = currentPods.filter(pod => pod !== log.pod);
          this.logFilterState.selectedPod.set(filteredPods.length > 0 ? filteredPods : null);
          this.toastr.info(`Hidden "${log.pod}" pod`, 'Filter Applied');
        }
        break;
    }
  }

  onContextMenuClosed() {
    // Clean up or handle menu close if needed
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    // Close context menu when clicking outside
    const menu = this.contextMenu();
    if (menu) {
      menu.hide();
    }
  }

  private scrollToSelectedLog(logIndex: number) {
    const viewport = this.viewPort();
    if (!viewport) return;

    const logs = this.logs();
    const groupedLogs = this.groupedLogs();

    if (logIndex < 0 || logIndex >= logs.length) return;

    const targetLogId = logs[logIndex].id.toString();

    // Find the index in the grouped logs array
    let groupedIndex = -1;

    for (let i = 0; i < groupedLogs.length; i++) {
      const item = groupedLogs[i];

      if (this.groupingService.isLogGroup(item)) {
        // Check if the target log is in this group
        const groupContainsTarget = item.logs.some(log => log.id.toString() === targetLogId);
        if (groupContainsTarget) {
          groupedIndex = i;
          break;
        }
      } else {
        // Individual log
        if (item.id.toString() === targetLogId) {
          groupedIndex = i;
          break;
        }
      }
    }

    if (groupedIndex !== -1) {
      // For virtual scrolling, we need to ensure smooth scrolling and proper viewport management
      try {
        // Use scrollToIndex with alignment to keep item in view
        viewport.scrollToIndex(groupedIndex, true, 0, 50); // 50px offset from top for better visibility

        // Additional step: after scroll, ensure the selected item is properly highlighted
        // Use setTimeout to wait for virtual scroller to render the item
        setTimeout(() => {
          this.ensureSelectedItemVisible(targetLogId);
        }, 100);
      } catch (error) {
        // Fallback: manual scroll calculation for virtual scroller
        console.warn('Virtual scroller navigation fallback', error);
        this.fallbackScrollToItem(groupedIndex);
      }
    }
  }

  private ensureSelectedItemVisible(targetLogId: string) {
    // Check if the selected item is in the DOM and properly highlighted
    const selectedElement = this.elementRef.nativeElement.querySelector(`[data-log-id="${targetLogId}"]`);
    if (selectedElement) {
      // Ensure it's visible in the viewport
      selectedElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }

  private fallbackScrollToItem(index: number) {
    const viewport = this.viewPort();
    if (!viewport) return;

    // Try to use the scrollToIndex method with different parameters as fallback
    try {
      viewport.scrollToIndex(index, false, 0, 0);
    } catch (error) {
      console.warn('Fallback scroll also failed:', error);
    }
  }


  openLogModal(log: Log): void {
    const modal = this.logDetailsModal();
    if (modal) {
      modal.open(log);
    }
  }

  private findParentScrollContainer(): void {
    // Start from this component's host element
    let element = this.elementRef.nativeElement.parentElement;
    
    // Look for the main scroll container - usually has classes like 'scroll-box', 'scroller', or 'main-content'
    while (element && element !== document.body) {
      const computedStyle = window.getComputedStyle(element);
      const hasScroll = computedStyle.overflowY === 'auto' || 
                       computedStyle.overflowY === 'scroll' ||
                       computedStyle.overflow === 'auto' ||
                       computedStyle.overflow === 'scroll';
      
      // Check for common scroll container class names
      const isScrollContainer = element.classList.contains('scroll-box') ||
                               element.classList.contains('scroller') ||
                               element.classList.contains('main-content') ||
                               element.classList.contains('content-area');
      
      if (hasScroll || isScrollContainer) {
        this.parentScrollElement.set(element);
        console.log('Found parent scroll container:', element);
        return;
      }
      
      element = element.parentElement;
    }
    
    // Fallback to window if no scroll container found
    this.parentScrollElement.set(window);
    console.log('Using window as scroll container');
  }

  private applyExcludeFilters(logs: Log[]): Log[] {
    const excludeLogLevel = this.logFilterState.excludeLogLevel();
    const excludePod = this.logFilterState.excludePod();
    const excludeSearchString = this.logFilterState.excludeSearchString();

    // If no exclude filters are set, return original logs
    if ((!excludeLogLevel || excludeLogLevel.length === 0) &&
        (!excludePod || excludePod.length === 0) &&
        !excludeSearchString) {
      return logs;
    }

    return logs.filter(log => {
      // Exclude by log level
      if (excludeLogLevel && excludeLogLevel.length > 0 && excludeLogLevel.includes(log.logLevel)) {
        return false;
      }

      // Exclude by pod
      if (excludePod && excludePod.length > 0 && excludePod.includes(log.pod)) {
        return false;
      }

      // Exclude by search string
      if (excludeSearchString && log.line.includes(excludeSearchString)) {
        return false;
      }

      return true;
    });
  }

}