import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { VirtualScrollerModule } from '@iharbeck/ngx-virtual-scroller';

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

      @for (log of logs(); track log.id) {
        <div class="log-item">
          <div class="time">{{ log.timeStamp | date: 'short' }}</div>
          <div class="pod" [ngStyle]="{'color':log.podColor}">{{ log.pod }}</div>
          <div class="type" [ngClass]="log.logLevel">{{ log.logLevel | LogLevelPipe }}</div>
          <div  class="line flexible-wrap"  [innerHTML]="log.view | highlightLog" [title]="log.line"></div>
        </div>
      }

    <button (click)="$loadMoreTrigger.next()">Load More</button>
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
  viewPort = viewChild<ElementRef>('scrollViewport');

  constructor() {
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
          return this.logApi
            .getLogs(
              this.logFilterState.selectedLogLevel(),
              this.logFilterState.selectedPod(),
              this.logFilterState.searchString(),
              this.logFilterState.selectedTimeRange(),
              this.page
            )
            .pipe(
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
                this.logs.update((items) => [...items, ...ni]);
                this.scrollToIndex(index);
              })
            );
        }),
        takeUntilDestroyed()
      )
      .subscribe();
    const logFilterState = toObservable(this.logFilterState.selectedLogLevel);
    const logPodFilterState = toObservable(this.logFilterState.selectedPod);
    const searchString = toObservable(this.logFilterState.searchString);
    const timeRange = toObservable(this.logFilterState.selectedTimeRange);
    combineLatest([logFilterState, logPodFilterState, searchString, timeRange])
      .pipe(
        switchMap(([level, pod, search, date]) => {
          this.page = 1;
          return this.logApi.getLogs(level, pod, search, date, this.page);
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
 
      const filteredLogs = logs.filter((log) => {
        if (!log) return false;

        log.timeStamp = new Date(log.timeStamp);

        return (
          (!search || log.line.includes(search)) &&
          (!logLevel || logLevel.includes(log.logLevel)) &&
          (!pod || pod.includes(log.pod)) &&
          (!date || new Date(log.timeStamp) > date)
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

      this.logs.update((x) => [...filteredLogs, ...x]);
    });
  }

  private scrollToIndex(index: number) {
    // const vp = this.viewport();
    // if (!vp) throw new Error('Viewport not initialized');
    // setTimeout(() => {
    //   vp.scrollToIndex(index);
    // }, 50);
    // setTimeout(() => {
    //   vp.scrollToIndex(index);
    // }, 100);
  }
}
const podColorCache = new Map<string, string>();

export function getPodColor(podName: string): string {
   if (podColorCache.has(podName)) {
    return podColorCache.get(podName)!;
  }

  // Hash the pod name to a numeric value
  let hash = 0;
  for (let i = 0; i < podName.length; i++) {
    hash = podName.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Generate RGB values in a vibrant cyberpunk range
  const baseR = 180 + (hash % 75);         // 180–255
  const baseG = 30 + ((hash >> 8) % 100);  // 30–130
  const baseB = 200 + ((hash >> 16) % 55); // 200–255

  let r = clamp(baseR);
  let g = clamp(baseG);
  let b = clamp(baseB);

  // Ensure it contrasts well with #20222b (dark background)
  if (getLuminance(r, g, b) < 0.4) {
    r = clamp(r + 40);
    g = clamp(g + 40);
    b = clamp(b + 40);
  }

  const color = `rgb(${r}, ${g}, ${b})`;
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