import { CommonModule } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { VirtualScrollerComponent, VirtualScrollerModule } from '@iharbeck/ngx-virtual-scroller';
import { LucideAngularModule } from 'lucide-angular';
import { ToastrService } from 'ngx-toastr';
import { combineLatest, Subject, switchMap, tap } from 'rxjs';
import { ContextMenuComponent } from '../../../_components/context-menu/context-menu.component';
import { LogDetailsModalComponent } from '../../../_components/log-details-modal/log-details-modal.component';
import { TimestampFormatPipe } from '../../../_pipes/timestamp-format.pipe';
import { LogApiService } from '../../../_services/log.api';
import { Log, SignalRService } from '../../../_services/signalr.service';
import { ViewModeService } from '../../../_services/view-mode.service';
import { HighlightLogPipe, LogLevelPipe } from '../_services/highlight.directive';
import { LogFilterState } from '../_services/log-filter-state';
@Component({
  selector: 'app-log-viewport',
  standalone: true,
  imports: [CommonModule, VirtualScrollerModule, HighlightLogPipe, LogLevelPipe, LucideAngularModule, TimestampFormatPipe, LogDetailsModalComponent, ContextMenuComponent],
  template: `
    @if(parentScrollElement(); as parentScrollElement) {
    <virtual-scroller 
      #scrollViewport 
      [items]="logs()" 
      [bufferAmount]="10"
      [scrollThrottlingTime]="50"
      [enableUnequalChildrenSizes]="false"
      [checkResizeInterval]="1000"
      [scrollAnimationTime]="750"
      [parentScroll]="parentScrollElement"
      class="virtual-scroll-container">
      
      @for (log of scrollViewport.viewPortItems; track log.id; let i = $index) {
        <div class="log-item"
             [class.copied]="copiedLogId() === log.id"
             [class.selected]="selectedLogId() === log.id.toString()"
             [class.compact]="viewModeService.isCompact()"
             [class.expanded]="viewModeService.isExpanded()"
             (click)="selectedLogId.set(log.id.toString())"
             (dblclick)="openLogModal(log)"
             (contextmenu)="showContextMenu($event, log)"
             title="Double-click to view full log details">
          <div class="time">{{ log.timeStamp | timestampFormat }}</div>
          <div class="pod" [ngStyle]="{'color':log.podColor}">{{ log.pod }}</div>
          <div class="type" [ngClass]="log.logLevel | LogLevelPipe">{{ log.logLevel | LogLevelPipe }}</div>
          <div class="line flexible-wrap" [innerHTML]="log.view | highlightLog:logFilterState.searchString()" [title]="log.line"></div>
          <button
            class="copy-btn"
            (click)="copyLog(log); $event.stopPropagation()"
            [title]="'Copy log to clipboard'"
          >
            @if (copiedLogId() === log.id) {
              <lucide-icon name="check" size="14"></lucide-icon>
            } @else {
              <lucide-icon name="copy" size="14"></lucide-icon>
            }
          </button>
        </div>
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
  logs = signal<Log[]>([]);
  logFilterState = inject(LogFilterState);
  viewModeService = inject(ViewModeService);
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

  // Memory management
  private readonly MAX_LOGS_IN_MEMORY = 5000; // Limit logs to prevent memory leaks
  
  // Parent scroll element for virtual scroller
  parentScrollElement = signal<Element | Window | null>(null);
  
  // TrackBy function for better performance
  trackByLogId = (index: number, item: Log): string => {
    return item.id.toString();
  };

  constructor() {
    // Find the parent scroll container after render
    afterNextRender(() => {
      this.findParentScrollContainer();
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
          const customRange = this.logFilterState.customTimeRange();
          if (customRange) {
            return this.logApi
              .getLogs(
                this.logFilterState.selectedLogLevel(),
                this.logFilterState.selectedPod(),
                this.logFilterState.searchString(),
                customRange.start,
                customRange.end,
                this.page
              );
          } else {
            return this.logApi
              .getLogs(
                this.logFilterState.selectedLogLevel(),
                this.logFilterState.selectedPod(),
                this.logFilterState.searchString(),
                this.logFilterState.selectedTimeRange(),
                undefined,
                this.page
              );
          }
        }),
              tap((z) => {
                const ni = (z.items ?? []).map((z) => {
                  return {
                    ...z,
                    podColor: getPodColor(z.pod),
                    view: this.cleanLogLine(z.line),
                    };
                  });;
                if (ni.length === 0) return;
                const index = this.logs().length;
                this.logs.update((items) => {
                  const newItems = [...items, ...ni];
                  // Trim logs if we exceed memory limit
                  if (newItems.length > this.MAX_LOGS_IN_MEMORY) {
                    return newItems.slice(-this.MAX_LOGS_IN_MEMORY);
                  }
                  return newItems;
                });
                this.scrollToIndex(index);
              })
        ,
        takeUntilDestroyed()
      )
      .subscribe();
    const logFilterState = toObservable(this.logFilterState.selectedLogLevel);
    const logPodFilterState = toObservable(this.logFilterState.selectedPod);
    const searchString = toObservable(this.logFilterState.searchString);
    const timeRange = toObservable(this.logFilterState.selectedTimeRange);
    const customTimeRange = toObservable(this.logFilterState.customTimeRange);
    combineLatest([logFilterState, logPodFilterState, searchString, timeRange, customTimeRange])
      .pipe(
        switchMap(([level, pod, search, date, custom]) => {
          this.page = 1;
          if (custom) {
            return this.logApi.getLogs(level, pod, search, custom.start, custom.end, this.page);
          } else {
            return this.logApi.getLogs(level, pod, search, date, undefined, this.page);
          }
        }),
        tap((l) => {
          const items = (l.items ?? []).map((z) => {
            return {
              ...z,
              podColor: getPodColor(z.pod),
              view: this.cleanLogLine(z.line),
              };
            });
          this.logs.set(items);
        }),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        this.startSignalR();
      });
  }
  
   cleanLogLine(line: string): string {
  // Matches:
  // [2025-04-15 17:52:04] INFO ...
  // 04:09:34 fail: ...
  // 2025-04-17T00:15:51Z WRN ...
  return line.replace(
    /^(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]\s+\b(INFO|DEBUG|ERROR|WARN|TRACE|FATAL)\b\s*|^\d{2}:\d{2}:\d{2}\s+\w+:\s*|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\s+\b(INFO|DEBUG|ERROR|WARN|TRACE|FATAL|INF|DBG|ERR|WRN|TRC|FTL)\b\s*)/,
    ''
  );
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
      }).map(z=>{
        return {
          ...z,
          podColor: getPodColor(z.pod),
          view: this.cleanLogLine(z.line),
        };
      });

      this.logs.update((x) => {
        const newLogs = [...x,...filteredLogs, ].sort((a, b) => {

        var timedif =new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime();
        if (timedif > 0) return 1;
        if (timedif < 0) return -1;
        if(a.id > b.id) return 1;
        if(a.id < b.id) return -1;
        return 0;
        });
        // Trim logs if we exceed memory limit
        if (newLogs.length > this.MAX_LOGS_IN_MEMORY) {
          return newLogs.slice(0, this.MAX_LOGS_IN_MEMORY);
        }
        return newLogs;
      });
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

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    // Only handle arrow keys and only when not in input fields
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    const logs = this.logs();
    const currentLogId = this.selectedLogId();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (logs.length > 0) {
          let currentIndex = logs.findIndex(log => log.id.toString() === currentLogId);
          if (currentIndex === -1) currentIndex = -1; // Start from beginning if no selection
          const newIndex = currentIndex < logs.length - 1 ? currentIndex + 1 : logs.length - 1;
          this.selectedLogId.set(logs[newIndex].id.toString());
          this.scrollToSelectedLog(newIndex);
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (logs.length > 0) {
          let currentIndex = logs.findIndex(log => log.id.toString() === currentLogId);
          if (currentIndex === -1) currentIndex = 1; // Start from end if no selection
          const newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
          this.selectedLogId.set(logs[newIndex].id.toString());
          this.scrollToSelectedLog(newIndex);
        }
        break;

      case 'Enter':
        event.preventDefault();
        if (currentLogId) {
          const selectedLog = logs.find(log => log.id.toString() === currentLogId);
          if (selectedLog) {
            this.copyLog(selectedLog);
          }
        }
        break;

      case 'Space':
        event.preventDefault();
        if (currentLogId) {
          const selectedLog = logs.find(log => log.id.toString() === currentLogId);
          if (selectedLog) {
            this.openLogModal(selectedLog);
          }
        }
        break;
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

  private scrollToSelectedLog(index: number) {
    const viewport = this.viewPort();
    if (viewport) {
      viewport.scrollToIndex(index, true);
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
}
const podColorCache = new Map<string, string>();

export function getPodColor(podName: string): string {
  if (podColorCache.has(podName)) {
    return podColorCache.get(podName)!;
  }

  // Generate multiple hash values for better distribution with overflow protection
  let hash1 = 0;
  let hash2 = 0;
  for (let i = 0; i < podName.length; i++) {
    const char = podName.charCodeAt(i);
    hash1 = (char + ((hash1 << 5) - hash1)) >>> 0; // Use unsigned right shift to keep 32-bit
    hash2 = (char + ((hash2 << 3) - hash2) + i) >>> 0;
  }

  // Create distinct color palette with wider ranges and better separation
  const colorSchemes = [
    // Bright, distinct color ranges for better visibility
    { r: [220, 255], g: [50, 120], b: [50, 120] },   // Warm reds/oranges
    { r: [50, 120], g: [220, 255], b: [50, 120] },   // Bright greens  
    { r: [50, 120], g: [50, 120], b: [220, 255] },   // Bright blues
    { r: [220, 255], g: [220, 255], b: [50, 120] },  // Bright yellows
    { r: [220, 255], g: [50, 120], b: [220, 255] },  // Bright magentas
    { r: [50, 120], g: [220, 255], b: [220, 255] },  // Bright cyans
    { r: [180, 220], g: [140, 200], b: [50, 100] },  // Orange variations
    { r: [140, 200], g: [50, 100], b: [180, 220] },  // Purple variations
    { r: [50, 100], g: [180, 220], b: [140, 200] },  // Teal variations
    { r: [240, 255], g: [160, 200], b: [160, 200] }, // Light corals
    { r: [160, 200], g: [240, 255], b: [160, 200] }, // Light greens
    { r: [160, 200], g: [160, 200], b: [240, 255] }  // Light blues
  ];

  // Select color scheme based on first hash
  const schemeIndex = hash1 % colorSchemes.length;
  const scheme = colorSchemes[schemeIndex];

  // Generate RGB values within the selected scheme's ranges with safety checks
  const rRange = Math.max(1, scheme.r[1] - scheme.r[0]);
  const gRange = Math.max(1, scheme.g[1] - scheme.g[0]);
  const bRange = Math.max(1, scheme.b[1] - scheme.b[0]);
  
  const r = scheme.r[0] + (hash1 % rRange);
  const g = scheme.g[0] + (hash2 % gRange);
  const b = scheme.b[0] + (Math.abs(hash1 ^ hash2) % bRange);

  // Ensure minimum contrast for readability
  let finalR = clamp(r);
  let finalG = clamp(g);
  let finalB = clamp(b);

  // Boost colors that are too dim for dark theme
  if (getLuminance(finalR, finalG, finalB) < 0.3) {
    finalR = clamp(finalR + 60);
    finalG = clamp(finalG + 60);
    finalB = clamp(finalB + 60);
  }

  const color = `rgb(${finalR}, ${finalG}, ${finalB})`;
  podColorCache.set(podName, color);
  return color;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}

// Relative luminance calculation (WCAG contrast model)
function getLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };
  const l = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return l;
}