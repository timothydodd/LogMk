
import { AfterViewInit, ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActiveElement, ChartEvent, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { combineLatest, switchMap } from 'rxjs';
import { LogApiService, LogStatistic, TimePeriod } from '../../../_services/log.api';
import { ChartType, ChartTypeService } from '../../../_services/chart-type.service';
import { LogFilterState } from '../_services/log-filter-state';
@Component({
  selector: 'app-log-stats',
  standalone: true,
  imports: [BaseChartDirective],

  template: `@if (stats() !== null) {
    <div class="chart-container"
         #chartContainer
         (mousedown)="onMouseDown($event)"
         (mousemove)="onMouseMove($event)"
         (mouseup)="onMouseUp($event)"
         (mouseleave)="onMouseLeave($event)">
      <canvas baseChart
              [data]="chartView()"
              [options]="chartOptions()"
              [type]="chartTypeService.getChartJsType()"
              (chartClick)="onChartClick($event, $any($event.active))"
              class="chart-canvas">
      </canvas>
      @if (isSelecting()) {
        <div class="selection-overlay"
             [style.left.px]="Math.min(selectionStart(), selectionEnd())"
             [style.width.px]="selectionWidth()"
             [style.top]="'0'"
             [style.height]="'100%'">
        </div>
      }
    </div>
  }`,
  styleUrl: './log-stats.component.scss',
  changeDetection: ChangeDetectionStrategy.Default,
})
export class LogStatsComponent implements AfterViewInit {
  logFilterState = inject(LogFilterState);
  logService = inject(LogApiService);
  chartTypeService = inject(ChartTypeService);

  chartCanvas = viewChild<BaseChartDirective>(BaseChartDirective);

  stats = signal<LogStatistic | null>(null);

  // Selection state
  isSelecting = signal<boolean>(false);
  selectionStart = signal<number>(0);
  selectionEnd = signal<number>(0);
  selectionWidth = computed(() => Math.abs(this.selectionEnd() - this.selectionStart()));

  // Make Math available in template
  Math = Math;

  private isDragging = false;
  private containerRect: DOMRect | null = null;

  chartView = computed(() => {
    return this.getChartData();
  });

  chartOptions = computed(() => {
    return this.getChartOptions();
  });

  private getChartOptions(): ChartOptions {
    const chartType = this.chartTypeService.selectedChartType();

    const baseOptions: ChartOptions = {
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
          stacked: chartType === 'area', // Only stack for area charts
          grid: {
            color: 'rgba(68, 71, 90, 0.4)'
          },
          ticks: {
            color: '#a0a0a0'
          }
        },
        y: {
          stacked: chartType === 'area', // Only stack for area charts
          beginAtZero: true,
          grid: {
            color: 'rgba(68, 71, 90, 0.4)'
          },
          ticks: {
            color: '#a0a0a0'
          }
        },
      },
    };

    return baseOptions;
  }
   
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
    // Initialize container rect for mouse calculations
    setTimeout(() => {
      this.updateContainerRect();
    });
  }

  private updateContainerRect(): void {
    const container = (event?.currentTarget as HTMLElement) || document.querySelector('.chart-container');
    if (container) {
      this.containerRect = container.getBoundingClientRect();
    }
  }

  onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return; // Only handle left click

    const container = event.currentTarget as HTMLElement;
    if (container) {
      this.containerRect = container.getBoundingClientRect();
    }
    if (!this.containerRect) return;

    const x = event.clientX - this.containerRect.left;

    this.isDragging = true;
    this.isSelecting.set(true);
    this.selectionStart.set(x);
    this.selectionEnd.set(x);

    event.preventDefault();
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging || !this.containerRect) return;

    const x = event.clientX - this.containerRect.left;
    // Clamp to container bounds
    const clampedX = Math.max(0, Math.min(x, this.containerRect.width));
    this.selectionEnd.set(clampedX);

    event.preventDefault();
  }

  onMouseUp(event: MouseEvent): void {
    if (!this.isDragging || !this.containerRect) return;

    this.isDragging = false;

    // Only process selection if there's a meaningful drag distance
    const minSelectionWidth = 10;
    if (this.selectionWidth() >= minSelectionWidth) {
      this.processTimeRangeSelection();
    }

    // Clear selection after processing
    setTimeout(() => {
      this.isSelecting.set(false);
      this.selectionStart.set(0);
      this.selectionEnd.set(0);
    }, 100);

    event.preventDefault();
  }

  onMouseLeave(event: MouseEvent): void {
    if (this.isDragging) {
      // Cancel selection if mouse leaves the chart area
      this.isDragging = false;
      this.isSelecting.set(false);
      this.selectionStart.set(0);
      this.selectionEnd.set(0);
    }
  }

  private processTimeRangeSelection(): void {
    var ele = this.chartCanvas();
 
    const chart = ele?.chart;
    const stats = this.stats();
    if (!chart || !stats || !this.containerRect) return;

    const startX = Math.min(this.selectionStart(), this.selectionEnd());
    const endX = Math.max(this.selectionStart(), this.selectionEnd());

    // Get the chart's plot area
    const chartArea = chart.chartArea;
    if (!chartArea) return;

    // Calculate which time periods are selected
    const timeKeys = Object.keys(stats.counts);
    const totalDataPoints = timeKeys.length;

    // Get canvas element to calculate relative positions
    const canvas = chart.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const canvasOffsetX = canvasRect.left - this.containerRect.left;

    // Convert pixel positions to data indices
    const chartWidth = chartArea.right - chartArea.left;
    const relativeStartX = Math.max(0, startX - canvasOffsetX - chartArea.left);
    const relativeEndX = Math.min(chartWidth, endX - canvasOffsetX - chartArea.left);

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
  getChartData() {
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
    const chartType = this.chartTypeService.selectedChartType();

    return [
      {
        label: 'Debug',
        data: this.getDataSet(stats, 'Debug'),
        backgroundColor: chartType === 'area' ? 'rgba(80, 250, 123, 0.3)' : 'rgba(80, 250, 123, 0.15)',
        borderColor: 'rgba(80, 250, 123, 0.7)',
        borderWidth: chartType === 'line' ? 2 : 1,
        fill: chartType === 'area' ? 'origin' : false,
        tension: chartType === 'line' || chartType === 'area' ? 0.4 : 0,
        pointRadius: chartType === 'line' ? 3 : 0,
        pointHoverRadius: chartType === 'line' ? 5 : 0,
      },
      {
        label: 'Information',
        data: this.getDataSet(stats, 'Information'),
        backgroundColor: chartType === 'area' ? 'rgba(0, 234, 255, 0.3)' : 'rgba(0, 234, 255, 0.15)',
        borderColor: 'rgba(0, 234, 255, 0.7)',
        borderWidth: chartType === 'line' ? 3 : 2,
        fill: chartType === 'area' ? '-1' : false,
        tension: chartType === 'line' || chartType === 'area' ? 0.4 : 0,
        pointRadius: chartType === 'line' ? 4 : 0,
        pointHoverRadius: chartType === 'line' ? 6 : 0,
      },
      {
        label: 'Warnings',
        data: this.getDataSet(stats, 'Warning'),
        backgroundColor: chartType === 'area' ? 'rgba(157, 0, 255, 0.3)' : 'rgba(157, 0, 255, 0.15)',
        borderColor: 'rgba(157, 0, 255, 0.7)',
        borderWidth: chartType === 'line' ? 3 : 2,
        fill: chartType === 'area' ? '-1' : false,
        tension: chartType === 'line' || chartType === 'area' ? 0.4 : 0,
        pointRadius: chartType === 'line' ? 4 : 0,
        pointHoverRadius: chartType === 'line' ? 6 : 0,
      },
      {
        label: 'Errors',
        data: this.getDataSet(stats, 'Error'),
        backgroundColor: chartType === 'area' ? 'rgba(255, 0, 170, 0.3)' : 'rgba(255, 0, 170, 0.15)',
        borderColor: 'rgba(255, 0, 170, 0.7)',
        borderWidth: chartType === 'line' ? 3 : 2,
        fill: chartType === 'area' ? '-1' : false,
        tension: chartType === 'line' || chartType === 'area' ? 0.4 : 0,
        pointRadius: chartType === 'line' ? 4 : 0,
        pointHoverRadius: chartType === 'line' ? 6 : 0,
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
