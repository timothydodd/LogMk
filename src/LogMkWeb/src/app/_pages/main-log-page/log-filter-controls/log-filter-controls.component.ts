
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { startOfToday, subDays, subHours, subMonths } from 'date-fns'; // Import date-fns for date manipulations
import { LucideAngularModule } from 'lucide-angular';
import { debounceTime } from 'rxjs';
import { DropdownComponent } from '../../../_components/dropdown/dropdown.component';
import { TimeFilterDropdownComponent, TimeFilter } from '../../../_components/time-filter-dropdown/time-filter-dropdown.component';
import { LogApiService } from '../../../_services/log.api';
import { LogFilterState } from '../_services/log-filter-state';

@Component({
  selector: 'app-log-filter-controls',
  standalone: true,
  imports: [FormsModule, DropdownComponent, TimeFilterDropdownComponent, LucideAngularModule],
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
      <app-dropdown
        id="log-level-select"
        [items]="logLevels"
        [multiple]="true"
        placeholder="Select log levels"
        [maxTagsDisplay]="2"
        [ngModel]="logFilterState.selectedLogLevel()"
        (ngModelChange)="logFilterState.selectedLogLevel.set($event)"
      ></app-dropdown>
    </div>
    <div>
      <lucide-icon name="box"></lucide-icon>
      <app-dropdown
        id="pod-select"
        [items]="pods()"
        [multiple]="true"
        placeholder="Select pods"
        [showCount]="true"
        [ngModel]="logFilterState.selectedPod()"
        (ngModelChange)="logFilterState.selectedPod.set($event)"
      ></app-dropdown>
    </div>
    <div>
      <lucide-icon name="clock"></lucide-icon>
      <app-time-filter-dropdown
        [timeFilters]="timeFilters"
        [selectedFilter]="selectedTimeFilter()"
        (filterChange)="selectedTimeFilter.set($event)"
        placeholder="Select time range"
      ></app-time-filter-dropdown>
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
    { label: 'Last 3 Hours', value: subHours(startOfToday(), 3) },
    { label: 'Last 6 Hours', value: subHours(startOfToday(), 6) },
    { label: 'Last Day', value: subDays(startOfToday(), 1) },
    { label: 'Last 3 Days', value: subDays(startOfToday(), 3) },
    { label: 'Last Month', value: subMonths(startOfToday(), 1) },
    { label: 'Last 3 Months', value: subMonths(startOfToday(), 3) },
  ];
  constructor() {
    // Initialize search string from persistent state
    this.searchString.set(this.logFilterState.searchString());
    
    // Initialize time filter from persistent state
    const savedTimeRange = this.logFilterState.selectedTimeRange();
    if (savedTimeRange) {
      const matchingFilter = this.timeFilters.find(f => 
        f.value && savedTimeRange && Math.abs(f.value.getTime() - savedTimeRange.getTime()) < 1000
      );
      this.selectedTimeFilter.set(matchingFilter || this.timeFilters[0]);
    } else {
      this.selectedTimeFilter.set(this.timeFilters[3]); // Default to "Last 6 Hours"
    }

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
      
    this.logService.getPods().pipe(takeUntilDestroyed()).subscribe((pods) => {
      this.pods.set(pods.map((p) => p.name));
    });

  }
}
