import { Component, ElementRef, HostListener, viewChild, input, output, signal, computed, inject, AfterRenderRef, afterNextRender, runInInjectionContext, Injector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { DateRangePickerComponent, DateRange } from '../date-range-picker/date-range-picker.component';
import { LogFilterState } from '../../_pages/main-log-page/_services/log-filter-state';

export interface TimeFilter {
  label: string;
  value: Date | null;
}

@Component({
  selector: 'app-time-filter-dropdown',
  imports: [CommonModule, LucideAngularModule, DateRangePickerComponent],
  templateUrl: './time-filter-dropdown.component.html',
  styleUrl: './time-filter-dropdown.component.scss'
})
export class TimeFilterDropdownComponent {
  // Inputs
  timeFilters = input<TimeFilter[]>([]);
  selectedFilter = input<TimeFilter | null>(null);
  placeholder = input<string>('Select time range');
  
  // Outputs
  filterChange = output<TimeFilter | null>();
  
  // ViewChild
  trigger = viewChild<ElementRef>('trigger');
  dropdownPanel = viewChild<ElementRef>('dropdownPanel');
  
  // Injected dependencies
  private elementRef = inject(ElementRef);
  private injector = inject(Injector);
  logFilterState = inject(LogFilterState);
  
  // Component state
  isOpen = signal(false);
  showDateRangePicker = signal(false);
  customRangeSelected = signal(false);
  
  // Computed properties
  displayValue = computed(() => {
    const customRange = this.logFilterState.customTimeRange();
    if (customRange) {
      const start = customRange.start.toLocaleString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      const end = customRange.end.toLocaleString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      return `📊 ${start} - ${end}`;
    }
    
    if (this.customRangeSelected()) {
      return "📅 Custom Date Range";
    }
    
    const selected = this.selectedFilter();
    if (selected) {
      return selected.label;
    }
    
    return this.placeholder();
  });
  
  hasCustomRange = computed(() => {
    return this.logFilterState.customTimeRange() !== null;
  });

  constructor() {
    // Initialize state based on existing custom range
    const existingCustomRange = this.logFilterState.customTimeRange();
    if (existingCustomRange) {
      this.customRangeSelected.set(true);
      this.showDateRangePicker.set(true); // Show controls if there's already a custom range
    }
  }
  
  toggle() {
    this.isOpen.set(!this.isOpen());
    // Don't hide date picker when opening/closing if custom range is selected
    if (!this.isOpen() && !this.customRangeSelected()) {
      this.showDateRangePicker.set(false);
    }
    
    // Scroll selected item into view when opening
    if (this.isOpen()) {
      runInInjectionContext(this.injector, () => {
        afterNextRender(() => {
          this.scrollSelectedIntoView();
        });
      });
    }
  }
  
  selectFilter(filter: TimeFilter) {
    this.filterChange.emit(filter);
    this.logFilterState.customTimeRange.set(null); // Clear custom range when selecting preset
    this.customRangeSelected.set(false);
    this.isOpen.set(false);
    this.showDateRangePicker.set(false);
  }
  
  selectCustomRange() {
    this.customRangeSelected.set(true);
    this.showDateRangePicker.set(true);
    this.filterChange.emit(null); // Clear preset filter
  }
  
  hideCustomPicker() {
    this.showDateRangePicker.set(false);
    this.customRangeSelected.set(false);
  }
  
  onCustomDateRangeSelected(dateRange: DateRange) {
    this.logFilterState.setCustomTimeRange(dateRange.start, dateRange.end);
    this.filterChange.emit(null); // Clear preset filter when using custom range
    this.isOpen.set(false);
    // Keep date picker visible since we now have a custom range
  }
  
  private scrollSelectedIntoView() {
    const panel = this.dropdownPanel()?.nativeElement;
    if (!panel) return;
    
    const selectedItem = panel.querySelector('.dropdown-item.selected');
    if (selectedItem) {
      selectedItem.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }
  
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
      this.showDateRangePicker.set(false);
    }
  }
}
