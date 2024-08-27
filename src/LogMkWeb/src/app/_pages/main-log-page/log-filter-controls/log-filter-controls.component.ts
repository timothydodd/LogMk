import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { startOfToday, subDays, subHours, subMonths } from 'date-fns'; // Import date-fns for date manipulations
import { LucideAngularModule } from 'lucide-angular';
import { debounceTime } from 'rxjs';
import { LogApiService } from '../../../_services/log.api';
import { LogFilterState } from '../_services/log-filter-state';

@Component({
  selector: 'app-log-filter-controls',
  standalone: true,
  imports: [CommonModule, FormsModule, NgSelectModule, LucideAngularModule],
  template: `
    <div>
      <lucide-icon name="search"></lucide-icon>
      <input
        class="form-control"
        id="search"
        type="text"
        placeholder="Search"
        [ngModel]="searchString()"
        (ngModelChange)="searchString.set($event)"
      />
    </div>
    <div>
      <lucide-icon name="gauge"></lucide-icon>
      <ng-select
        id="log-level-select"
        [items]="logLevels"
        [multiple]="true"
        [ngModel]="logFilterState.selectedLogLevel()"
        (ngModelChange)="logFilterState.selectedLogLevel.set($event)"
      ></ng-select>
    </div>
    <div>
      <lucide-icon name="box"></lucide-icon>
      <ng-select
        id="pod-select"
        [items]="pods()"
        [multiple]="true"
        [ngModel]="logFilterState.selectedPod()"
        (ngModelChange)="logFilterState.selectedPod.set($event)"
      ></ng-select>
    </div>
    <div>
      <lucide-icon name="clock"></lucide-icon>
      <ng-select
        id="time-filter-select"
        [items]="timeFilters"
        [ngModel]="selectedTimeFilter()"
        (ngModelChange)="selectedTimeFilter.set($event)"
        bindLabel="label"
      ></ng-select>
    </div>
  `,
  styleUrl: './log-filter-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogFilterControlsComponent {
  logService = inject(LogApiService);
  logFilterState = inject(LogFilterState);

  logLevels = ['Debug', 'Information', 'Warning', 'Error'];
  pods = signal<string[]>([]);
  searchString = signal<string>('');
  selectedTimeFilter = signal<TimeFilter | null>(null);
  timeFilters: TimeFilter[] = [
    { label: 'Any', value: null },
    { label: 'Last Hour', value: subHours(startOfToday(), 1) },
    { label: 'Last 6 Hours', value: subHours(startOfToday(), 6) },
    { label: 'Last Day', value: subDays(startOfToday(), 1) },
    { label: 'Last 3 Days', value: subDays(startOfToday(), 3) },
    { label: 'Last Month', value: subMonths(startOfToday(), 1) },
    { label: 'Last 3 Months', value: subMonths(startOfToday(), 3) },
  ];
  constructor() {
    toObservable(this.selectedTimeFilter)
      .pipe(takeUntilDestroyed())
      .subscribe((timeFilter) => {
        const t = timeFilter?.value ?? null;

        this.logFilterState.selectedTimeRange.set(t);
      });
    toObservable(this.searchString)
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((searchString) => {
        this.logFilterState.searchString.set(searchString);
      });
    this.logService.getPods().subscribe((pods) => {
      this.pods.set(pods.map((p) => p.name));
    });
    this.selectedTimeFilter.set(this.timeFilters[3]);
  }
}

export interface TimeFilter {
  label: string;
  value: Date | null;
}
