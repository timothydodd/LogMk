import { Component, output, input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { format, startOfDay } from 'date-fns';

export interface DateRange {
  start: Date;
  end: Date;
}

@Component({
  selector: 'app-date-range-picker',
  imports: [CommonModule, FormsModule],
  templateUrl: './date-range-picker.component.html',
  styleUrl: './date-range-picker.component.scss'
})
export class DateRangePickerComponent {
  // Inputs
  startDate = input<Date | null>(null);
  endDate = input<Date | null>(null);
  
  // Outputs
  dateRangeChange = output<DateRange>();
  cancel = output<void>();

  // Internal state
  private _startDateString = signal<string>('');
  private _endDateString = signal<string>('');

  // Computed properties
  startDateString = computed(() => {
    const start = this.startDate();
    if (start) {
      return format(start, 'yyyy-MM-dd\'T\'HH:mm');
    }
    return this._startDateString();
  });

  endDateString = computed(() => {
    const end = this.endDate();
    if (end) {
      return format(end, 'yyyy-MM-dd\'T\'HH:mm');
    }
    return this._endDateString();
  });

  canApply = computed(() => {
    const startStr = this.startDateString();
    const endStr = this.endDateString();
    return startStr && endStr && 
           new Date(startStr) <= new Date(endStr);
  });

  constructor() {
    // Initialize with current date/time if no values provided
    const now = new Date();
    const startOfToday = startOfDay(now);
    
    this._startDateString.set(format(startOfToday, 'yyyy-MM-dd\'T\'HH:mm'));
    this._endDateString.set(format(now, 'yyyy-MM-dd\'T\'HH:mm'));
  }

  onStartDateChange(value: string) {
    this._startDateString.set(value);
  }

  onEndDateChange(value: string) {
    this._endDateString.set(value);
  }

  onApply() {
    if (this.canApply()) {
      const start = new Date(this.startDateString());
      const end = new Date(this.endDateString());
      
      this.dateRangeChange.emit({ start, end });
    }
  }

  onCancel() {
    this.cancel.emit();
  }
}
