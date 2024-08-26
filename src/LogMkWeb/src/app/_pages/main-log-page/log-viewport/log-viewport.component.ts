import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';

import { combineLatest, filter, map, of, switchMap, take, tap } from 'rxjs';
import { LogApiService } from '../../../_services/log.api';
import { Log, SignalRService } from '../../../_services/signalr.service';
import { LogFilterState } from '../_services/log-filter-state';
@Component({
  selector: 'app-log-viewport',
  standalone: true,
  imports: [CommonModule, ScrollingModule],
  template: `
    <cdk-virtual-scroll-viewport itemSize="20" class="log-viewport" #scrollViewport>
      <div *cdkVirtualFor="let log of logs()" class="log-item">
        <div class="time">{{ log.timeStamp | date: 'short' }}</div>
        <div class="pod">{{ log.pod }}</div>
        <div [ngClass]="log.logLevel" class="line">{{ log.line }}</div>
      </div>
    </cdk-virtual-scroll-viewport>
  `,
  styleUrl: './log-viewport.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogViewportComponent {
  destroyRef = inject(DestroyRef);
  logApi = inject(LogApiService);
  signalRService = inject(SignalRService);
  logs = signal<Log[]>([]);
  viewport = viewChild<CdkVirtualScrollViewport>('scrollViewport');
  logFilterState = inject(LogFilterState);
  page = 1;
  ignoreScroll = true;

  constructor() {
    const viewPort = toObservable(this.viewport);

    viewPort
      .pipe(
        filter((vp) => !!vp),
        take(1),
        switchMap((vp) => {
          if (!vp) return of(null);
          return vp?.elementScrolled().pipe(map(() => vp));
        }),
        switchMap((e) => {
          if (!e || this.ignoreScroll) return of(null);
          const m = e.measureScrollOffset('top');

          if (m === 0) {
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

                  this.logs.update((items) => [...ni.reverse(), ...items]);
                  this.scrollToIndex(ni.length);
                })
              );
          }
          return of(null);
        }),
        takeUntilDestroyed()
      )
      .subscribe();
    const logFilterState = toObservable(this.logFilterState.selectedLogLevel);
    const logPodFilterState = toObservable(this.logFilterState.selectedPod);
    const searchString = toObservable(this.logFilterState.searchString);
    const timeRange = toObservable(this.logFilterState.selectedTimeRange);
    viewPort
      .pipe(
        take(1),
        switchMap(() => {
          return combineLatest([logFilterState, logPodFilterState, searchString, timeRange]);
        }),
        switchMap(([level, pod, search, date]) => {
          this.page = 1;
          return this.logApi.getLogs(level, pod, search, date, this.page);
        }),
        tap((l) => {
          const items = l.items ?? [];
          this.logs.set(items.reverse());
          this.scrollToBottom();
        }),
        switchMap(() => {
          return this.signalRService.logsReceived;
        }),
        takeUntilDestroyed()
      )
      .subscribe((logs) => {
        this.logs.update((items) => [...items, ...logs]);
        this.scrollToBottom();
      });
  }
  private scrollToIndex(index: number) {
    const vp = this.viewport();
    if (!vp) throw new Error('Viewport not initialized');

    setTimeout(() => {
      vp.scrollToIndex(index);
    }, 50);
    setTimeout(() => {
      vp.scrollToIndex(index);
    }, 100);
  }
  private scrollToBottom() {
    this.ignoreScroll = true;
    const vp = this.viewport();
    if (!vp) throw new Error('Viewport not initialized');

    setTimeout(() => {
      vp.scrollTo({
        bottom: 0,
        behavior: 'auto',
      });
    }, 50);
    setTimeout(() => {
      vp.scrollTo({
        bottom: 0,
        behavior: 'auto',
      });
      this.ignoreScroll = false;
    }, 100);
  }
}
