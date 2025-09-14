
import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild, ElementRef, AfterViewInit } from '@angular/core';
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
    <div class="chart-container">
      <canvas baseChart
              #chartCanvas
              [data]="barChartView()"
              [options]="barChartOptions"
              [type]="'bar'"
              (chartClick)="onChartClick($event, $any($event.active))"
              (mousedown)="onMouseDown($event)"
              (mousemove)="onMouseMove($event)"
              (mouseup)="onMouseUp($event)"
              class="chart-canvas">
      </canvas>
      @if (isSelecting()) {
        <div class="selection-overlay"
             [style.left.px]="selectionStart()"
             [style.width.px]="selectionWidth()"
             [style.top.px]="0"
             [style.height.%]="100">
        </div>
      }
    </div>
  }`,
  styleUrl: './log-stats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogStatsComponent implements AfterViewInit {
  logFilterState = inject(LogFilterState);
  logService = inject(LogApiService);

  chartCanvas = viewChild<BaseChartDirective>('chartCanvas');

  stats = signal<LogStatistic | null>(null);

  // Selection state
  isSelecting = signal<boolean>(false);
  selectionStart = signal<number>(0);
  selectionEnd = signal<number>(0);
  selectionWidth = computed(() => Math.abs(this.selectionEnd() - this.selectionStart()));

  private isDragging = false;
  private chartRect: DOMRect | null = null;

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

  ngAfterViewInit(): void {
    // Initialize chart rect for mouse calculations
    setTimeout(() => {
      this.updateChartRect();
    });
  }

  private updateChartRect(): void {
    const canvas = this.chartCanvas()?.chart?.canvas;
    if (canvas) {
      this.chartRect = canvas.getBoundingClientRect();
    }
  }

  onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return; // Only handle left click

    this.updateChartRect();
    if (!this.chartRect) return;

    const x = event.clientX - this.chartRect.left;

    this.isDragging = true;
    this.isSelecting.set(true);
    this.selectionStart.set(x);
    this.selectionEnd.set(x);

    event.preventDefault();
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging || !this.chartRect) return;

    const x = event.clientX - this.chartRect.left;
    this.selectionEnd.set(x);

    event.preventDefault();
  }

  onMouseUp(event: MouseEvent): void {
    if (!this.isDragging || !this.chartRect) return;

    this.isDragging = false;

    // Only process selection if there's a meaningful drag distance
    const minSelectionWidth = 10;
    if (this.selectionWidth() >= minSelectionWidth) {
      this.processTimeRangeSelection();
    }

    // Clear selection after processing
    setTimeout(() => {
      this.isSelecting.set(false);
    }, 100);

    event.preventDefault();
  }

  private processTimeRangeSelection(): void {
    const chart = this.chartCanvas()?.chart;
    const stats = this.stats();
    if (!chart || !stats || !this.chartRect) return;

    const startX = Math.min(this.selectionStart(), this.selectionEnd());
    const endX = Math.max(this.selectionStart(), this.selectionEnd());

    // Get the chart's plot area
    const chartArea = chart.chartArea;
    if (!chartArea) return;

    // Calculate which time periods are selected
    const timeKeys = Object.keys(stats.counts);
    const totalDataPoints = timeKeys.length;

    // Convert pixel positions to data indices
    const chartWidth = chartArea.right - chartArea.left;
    const relativeStartX = Math.max(0, startX - chartArea.left);
    const relativeEndX = Math.min(chartWidth, endX - chartArea.left);

    const startIndex = Math.floor((relativeStartX / chartWidth) * totalDataPoints);
    const endIndex = Math.ceil((relativeEndX / chartWidth) * totalDataPoints);

    // Ensure valid indices
    const validStartIndex = Math.max(0, Math.min(startIndex, totalDataPoints - 1));
    const validEndIndex = Math.max(validStartIndex, Math.min(endIndex, totalDataPoints - 1));

    if (validStartIndex < timeKeys.length && validEndIndex < timeKeys.length) {
      const startTimeKey = timeKeys[validStartIndex];
      const endTimeKey = timeKeys[validEndIndex];

      const startDate = new Date(startTimeKey);
      const endDate = new Date(endTimeKey);

      let actualStartTime: Date;
      let actualEndTime: Date;

      if (stats.timePeriod === TimePeriod.Hour) {
        // For hourly data
        actualStartTime = new Date(startDate);
        actualEndTime = new Date(endDate.getTime() + 60 * 60 * 1000); // Add 1 hour to end
      } else {
        // For daily data
        actualStartTime = new Date(startDate);
        actualStartTime.setHours(0, 0, 0, 0);
        actualEndTime = new Date(endDate);
        actualEndTime.setHours(23, 59, 59, 999);
      }

      // Set custom time range in filter state
      this.logFilterState.setCustomTimeRange(actualStartTime, actualEndTime);
    }
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
