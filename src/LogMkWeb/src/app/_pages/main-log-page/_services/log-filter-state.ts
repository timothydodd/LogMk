import { Injectable, signal, effect } from '@angular/core';

interface FilterState {
  selectedLogLevel: string[] | null;
  selectedPod: string[] | null;
  searchString: string;
  selectedTimeRange: string | null; // Store as ISO string for localStorage
  customTimeRange: { start: string; end: string } | null; // Custom time range from graph clicks
}

@Injectable({
  providedIn: 'root',
})
export class LogFilterState {
  private readonly STORAGE_KEY = 'logmk-filter-state';

  selectedLogLevel = signal<string[] | null>(null);
  selectedPod = signal<string[] | null>(null);
  searchString = signal<string>('');
  selectedTimeRange = signal<Date | null>(null);
  customTimeRange = signal<{ start: Date; end: Date } | null>(null);

  constructor() {
    this.loadFromStorage();
    this.setupAutoSave();
  }

  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const state: FilterState = JSON.parse(saved);
        
        this.selectedLogLevel.set(state.selectedLogLevel);
        this.selectedPod.set(state.selectedPod);
        this.searchString.set(state.searchString || '');
        
        // Convert ISO string back to Date
        if (state.selectedTimeRange) {
          this.selectedTimeRange.set(new Date(state.selectedTimeRange));
        }
        
        // Convert custom time range back to Date objects
        if (state.customTimeRange) {
          this.customTimeRange.set({
            start: new Date(state.customTimeRange.start),
            end: new Date(state.customTimeRange.end)
          });
        }
      }
    } catch (error) {
      console.warn('Failed to load filter state from localStorage:', error);
    }
  }

  private setupAutoSave(): void {
    // Save to localStorage whenever any filter changes
    effect(() => {
      const customRange = this.customTimeRange();
      const state: FilterState = {
        selectedLogLevel: this.selectedLogLevel(),
        selectedPod: this.selectedPod(),
        searchString: this.searchString(),
        selectedTimeRange: this.selectedTimeRange()?.toISOString() || null,
        customTimeRange: customRange ? {
          start: customRange.start.toISOString(),
          end: customRange.end.toISOString()
        } : null
      };

      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        console.warn('Failed to save filter state to localStorage:', error);
      }
    });
  }

  clearFilters(): void {
    this.selectedLogLevel.set(null);
    this.selectedPod.set(null);
    this.searchString.set('');
    this.selectedTimeRange.set(null);
    this.customTimeRange.set(null);
  }

  setCustomTimeRange(start: Date, end: Date): void {
    this.customTimeRange.set({ start, end });
    // Clear the regular time range when setting custom range
    this.selectedTimeRange.set(null);
  }

  // Get the effective time range (custom takes priority over regular)
  getEffectiveTimeRange(): Date | { start: Date; end: Date } | null {
    const custom = this.customTimeRange();
    if (custom) {
      return custom;
    }
    return this.selectedTimeRange();
  }
}
