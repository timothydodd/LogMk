import { CommonModule } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { VirtualScrollerComponent, VirtualScrollerModule } from '@iharbeck/ngx-virtual-scroller';

import { combineLatest, Subject, switchMap, tap } from 'rxjs';
import { LogApiService } from '../../../_services/log.api';
import { Log, SignalRService } from '../../../_services/signalr.service';
import { HighlightLogPipe, LogLevelPipe } from '../_services/highlight.directive';
import { LogFilterState } from '../_services/log-filter-state';
@Component({
  selector: 'app-log-viewport',
  standalone: true,
  imports: [CommonModule, VirtualScrollerModule,HighlightLogPipe,LogLevelPipe],
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
      
      @for (log of scrollViewport.viewPortItems; track log.id) {
        <div class="log-item">
          <div class="time">{{ log.timeStamp | date: 'short' }}</div>
          <div class="pod" [ngStyle]="{'color':log.podColor}">{{ log.pod }}</div>
          <div class="type" [ngClass]="log.logLevel | LogLevelPipe">{{ log.logLevel | LogLevelPipe }}</div>
          <div class="line flexible-wrap" [innerHTML]="log.view | highlightLog" [title]="log.line"></div>
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
  page = 1;
  ignoreScroll = true;
  $loadMoreTrigger = new Subject<void>();
  viewPort = viewChild<VirtualScrollerComponent>('scrollViewport');
  private elementRef = inject(ElementRef);
  
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
      }).sort((a, b) => {

        var timedif =new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime();
        if (timedif > 0) return 1;
        if (timedif < 0) return -1;
        if(a.id > b.id) return 1;
        if(a.id < b.id) return -1;
        return 0;
      });

      this.logs.update((x) => {
        const newLogs = [...filteredLogs, ...x];
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

  // Generate multiple hash values for better distribution
  let hash1 = 0;
  let hash2 = 0;
  for (let i = 0; i < podName.length; i++) {
    hash1 = podName.charCodeAt(i) + ((hash1 << 5) - hash1);
    hash2 = podName.charCodeAt(i) + ((hash2 << 3) - hash2) + i;
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
    { r: [255, 255], g: [160, 200], b: [160, 200] }, // Light corals
    { r: [160, 200], g: [255, 255], b: [160, 200] }, // Light greens
    { r: [160, 200], g: [160, 200], b: [255, 255] }  // Light blues
  ];

  // Select color scheme based on first hash
  const schemeIndex = Math.abs(hash1) % colorSchemes.length;
  const scheme = colorSchemes[schemeIndex];

  // Generate RGB values within the selected scheme's ranges
  const r = scheme.r[0] + (Math.abs(hash1) % (scheme.r[1] - scheme.r[0]));
  const g = scheme.g[0] + (Math.abs(hash2) % (scheme.g[1] - scheme.g[0]));
  const b = scheme.b[0] + (Math.abs(hash1 ^ hash2) % (scheme.b[1] - scheme.b[0]));

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