
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActiveElement, ChartEvent, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { combineLatest, switchMap } from 'rxjs';
import { LogApiService, LogStatistic, TimePeriod } from '../../../_services/log.api';
import { LogFilterState } from '../_services/log-filter-state';
@Component({
  selector: 'app-log-stats',
  standalone: true,
  imports: [BaseChartDirective],

  template: `@if (stats() !== null) {
    <canvas baseChart [data]="barChartView()" [options]="barChartOptions" [type]="'bar'" 
            (chartClick)="onChartClick($event, $any($event.active))" 
            class="chart-canvas"> 
    </canvas>
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
    interaction: {
      intersect: false,
      mode: 'index'
    },
    onHover: (event, elements) => {
      if (event.native?.target) {
        (event.native.target as HTMLElement).style.cursor = elements.length > 0 ? 'pointer' : 'default';
      }
    },
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
    const customTimeRange = toObservable(this.logFilterState.customTimeRange);

    combineLatest([logFilterState, logPodFilterState, searchString, timeRange, customTimeRange])
      .pipe(
        switchMap(([loglevel, podName, search, startDate, custom]) => {
          // Use custom time range if available, otherwise use regular time range
          if (custom) {
            return this.logService.getStats(loglevel, podName, search, custom.start, custom.end);
          } else {
            return this.logService.getStats(loglevel, podName, search, startDate);
          }
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
        backgroundColor: 'rgba(0, 234, 255, 0.15)', // Electric cyan
        borderColor: 'rgba(0, 234, 255, 0.7)',
        borderWidth: 2,
      },
      {
        label: 'Warnings',
        data: this.getDataSet(stats, 'Warning'),
        backgroundColor: 'rgba(157, 0, 255, 0.15)', // Neon purple
        borderColor: 'rgba(157, 0, 255, 0.7)',
        borderWidth: 2,
      },
      {
        label: 'Errors',
        data: this.getDataSet(stats, 'Error'),
        backgroundColor: 'rgba(255, 0, 170, 0.15)', // Hot magenta
        borderColor: 'rgba(255, 0, 170, 0.7)',
        borderWidth: 2,
      },
      {
        label: 'Other',
        data: this.getDataSet(stats, 'Any'),
        backgroundColor: 'rgba(30, 30, 40, 0.15)', // Dark cyber gray
        borderColor: 'rgba(30, 30, 40, 0.4)',
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

  onChartClick(event: ChartEvent | any, activeElements: ActiveElement[]): void {
    if (activeElements && activeElements.length > 0) {
      const activePoint = activeElements[0];
      const dataIndex = activePoint.index;
      const stats = this.stats();
      
      if (stats && dataIndex !== undefined) {
        const timeKeys = Object.keys(stats.counts);
        const clickedTimeKey = timeKeys[dataIndex];
        
        if (clickedTimeKey) {
          const clickedDate = new Date(clickedTimeKey);
          let startTime: Date;
          let endTime: Date;
          
          if (stats.timePeriod === TimePeriod.Hour) {
            // For hourly data, filter by the clicked hour
            startTime = new Date(clickedDate);
            endTime = new Date(clickedDate.getTime() + 60 * 60 * 1000); // Add 1 hour
          } else {
            // For daily data, filter by the clicked day
            startTime = new Date(clickedDate);
            startTime.setHours(0, 0, 0, 0);
            endTime = new Date(clickedDate);
            endTime.setHours(23, 59, 59, 999);
          }
          
          // Set custom time range in filter state
          this.logFilterState.setCustomTimeRange(startTime, endTime);
        }
      }
    }
  }

}
