import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { VirtualScrollerModule } from '@iharbeck/ngx-virtual-scroller';

import { combineLatest, Subject, switchMap, tap } from 'rxjs';
import { LogApiService } from '../../../_services/log.api';
import { Log, SignalRService } from '../../../_services/signalr.service';
import { LogFilterState } from '../_services/log-filter-state';
@Component({
  selector: 'app-log-viewport',
  standalone: true,
  imports: [CommonModule, VirtualScrollerModule],
  template: `

      @for (log of logs(); track log.id) {
        <div class="log-item">
          <div class="time">{{ log.timeStamp | date: 'short' }}</div>
          <div class="pod">{{ log.pod }}</div>
          <div [ngClass]="log.logLevel" class="line">{{ log.line }}</div>
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
                const ni = z.items ?? [];
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
          const items = l.items ?? [];
          this.logs.set(items);
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

      const filteredLogs = logs.filter((log) => {
        if (!log) return false;

        log.timeStamp = new Date(log.timeStamp);

        return (
          (!search || log.line.includes(search)) &&
          (!logLevel || logLevel.includes(log.logLevel)) &&
          (!pod || pod.includes(log.pod)) &&
          (!date || new Date(log.timeStamp) > date)
        );
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
