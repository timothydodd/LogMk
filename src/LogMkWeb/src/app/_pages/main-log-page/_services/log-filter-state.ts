import { Injectable, signal, effect } from '@angular/core';

interface FilterState {
  selectedLogLevel: string[] | null;
  selectedPod: string[] | null;
  searchString: string;
  selectedTimeRange: string | null; // Store as ISO string for localStorage
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
      }
    } catch (error) {
      console.warn('Failed to load filter state from localStorage:', error);
    }
  }

  private setupAutoSave(): void {
    // Save to localStorage whenever any filter changes
    effect(() => {
      const state: FilterState = {
        selectedLogLevel: this.selectedLogLevel(),
        selectedPod: this.selectedPod(),
        searchString: this.searchString(),
        selectedTimeRange: this.selectedTimeRange()?.toISOString() || null
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
  }
}
