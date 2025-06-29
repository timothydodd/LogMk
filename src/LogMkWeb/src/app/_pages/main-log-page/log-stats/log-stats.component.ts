
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { combineLatest, switchMap } from 'rxjs';
import { LogApiService, LogStatistic, TimePeriod } from '../../../_services/log.api';
import { LogFilterState } from '../_services/log-filter-state';
@Component({
  selector: 'app-log-stats',
  standalone: true,
  imports: [BaseChartDirective],

  template: `@if (stats() !== null) {
    <canvas baseChart [data]="barChartView()" [options]="barChartOptions" [type]="'bar'"> </canvas>
  }`,
  styleUrl: './log-stats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogStatsComponent {
  logFilterState = inject(LogFilterState);
  logService = inject(LogApiService);

  stats = signal<LogStatistic | null>(null);

  barChartView = computed(() => {
    return this.getBarChat();
  });
  barChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        stacked: true, // Enable stacking for the x-axis
         grid: {
          color: 'rgba(68, 71, 90, 0.4)'  // Use theme border color
        },
        ticks: {
          color: '#a0a0a0'  // Use theme muted text color
        }
      },
      y: {
        stacked: true, // Enable stacking for the y-axis
        beginAtZero: true,
         grid: {
          color: 'rgba(68, 71, 90, 0.4)'  // Use theme border color
        },
        ticks: {
          color: '#a0a0a0'  // Use theme muted text color
        }
      },
    },
  };
   
  constructor() {
    const logFilterState = toObservable(this.logFilterState.selectedLogLevel);
    const logPodFilterState = toObservable(this.logFilterState.selectedPod);
    const searchString = toObservable(this.logFilterState.searchString);
    const timeRange = toObservable(this.logFilterState.selectedTimeRange);

    combineLatest([logFilterState, logPodFilterState, searchString, timeRange])
      .pipe(
        switchMap(([loglevel, podName, search, startDate]) => {
          return this.logService.getStats(loglevel, podName, search, startDate);
        }),
        takeUntilDestroyed()
      )
      .subscribe((s) => {
        this.stats.set(s);
      });
  }
  getBarChat() {
    const stats = this.stats();

    if (stats?.timePeriod === TimePeriod.Hour) {
      const hours = Object.keys(stats.counts).map((h) => {
        const date = new Date(h);
        const hour = date.getHours();
        return `${hour}:00`;
      });
      const ds = this.getData(stats);
      return {
        labels: hours,
        datasets: ds,
      };
    } else if (stats?.timePeriod === TimePeriod.Day) {
      // get date from Date and format it to short date string

      const days = Object.keys(stats.counts).map((d) => new Date(d).toLocaleDateString());

      return {
        labels: days,
        datasets: this.getData(stats),
      };
    }

    return {
      labels: [],
      datasets: [],
    };
  }
  private getData(stats: LogStatistic) {
    return [
      {
        label: 'Information',
        data: this.getDataSet(stats, 'Information'),
        backgroundColor: 'rgba(59, 130, 246, 0.3)', // Primary blue
        borderColor: 'rgba(59, 130, 246, 0.8)',
        borderWidth: 1,
      },
      {
        label: 'Warnings',
        data: this.getDataSet(stats, 'Warning'),
        backgroundColor: 'rgba(241, 250, 140, 0.3)', // Theme warning yellow
        borderColor: 'rgba(241, 250, 140, 0.8)',
        borderWidth: 1,
      },
      {
        label: 'Errors',
        data: this.getDataSet(stats, 'Error'),
        backgroundColor: 'rgba(255, 85, 85, 0.3)', // Theme danger red
        borderColor: 'rgba(255, 85, 85, 0.8)',
        borderWidth: 1,
      },
      {
        label: 'Other',
        data: this.getDataSet(stats, 'Any'),
        backgroundColor: 'rgba(98, 114, 164, 0.3)', // Theme secondary
        borderColor: 'rgba(98, 114, 164, 0.8)',
        borderWidth: 1,
      },
    ];
  }
  private getDataSet(stats: LogStatistic, logLevel: string) {
    const data = [];
    for (const k of Object.keys(stats.counts)) {
      const kv = stats.counts[k];
      if (kv[logLevel] === undefined) {
        data.push(0);
      } else {
        data.push(kv[logLevel]);
      }
    }
    return data;
  }
}
