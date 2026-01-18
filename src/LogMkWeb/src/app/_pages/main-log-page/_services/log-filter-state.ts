import { Injectable, signal, effect } from '@angular/core';
import { TriStateValue } from '@rd-ui';

interface FilterState {
  selectedLogLevel: string[] | null;
  selectedPod: string[] | null;
  searchString: string;
  selectedTimeRange: string | null; // Store as ISO string for localStorage
  customTimeRange: { start: string; end: string } | null; // Custom time range from graph clicks
  excludeLogLevel: string[] | null;
  excludePod: string[] | null;
  excludeSearchString: string;
  // New tri-state properties
  triStateLogLevel: TriStateValue | null;
  triStatePod: TriStateValue | null;
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
  excludeLogLevel = signal<string[] | null>(null);
  excludePod = signal<string[] | null>(null);
  excludeSearchString = signal<string>('');

  // New tri-state signals
  triStateLogLevel = signal<TriStateValue | null>(null);
  triStatePod = signal<TriStateValue | null>(null);

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
        this.excludeLogLevel.set(state.excludeLogLevel || null);
        this.excludePod.set(state.excludePod || null);
        this.excludeSearchString.set(state.excludeSearchString || '');

        // Load tri-state values
        this.triStateLogLevel.set(state.triStateLogLevel || null);
        this.triStatePod.set(state.triStatePod || null);

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
        } : null,
        excludeLogLevel: this.excludeLogLevel(),
        excludePod: this.excludePod(),
        excludeSearchString: this.excludeSearchString(),
        triStateLogLevel: this.triStateLogLevel(),
        triStatePod: this.triStatePod()
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
    this.excludeLogLevel.set(null);
    this.excludePod.set(null);
    this.excludeSearchString.set('');
    this.triStateLogLevel.set(null);
    this.triStatePod.set(null);
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
