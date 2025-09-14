import { Injectable, signal } from '@angular/core';

export type ViewMode = 'compact' | 'expanded';

@Injectable({
  providedIn: 'root'
})
export class ViewModeService {
  private readonly STORAGE_KEY = 'logmk-view-mode';

  // Signal for the current view mode
  viewMode = signal<ViewMode>(this.loadViewMode());

  constructor() {
    // Watch for changes and persist to localStorage
    this.viewMode.set(this.loadViewMode());
  }

  toggleViewMode(): void {
    const currentMode = this.viewMode();
    const newMode: ViewMode = currentMode === 'compact' ? 'expanded' : 'compact';
    this.setViewMode(newMode);
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    this.saveViewMode(mode);
  }

  isCompact(): boolean {
    return this.viewMode() === 'compact';
  }

  isExpanded(): boolean {
    return this.viewMode() === 'expanded';
  }

  private loadViewMode(): ViewMode {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved && (saved === 'compact' || saved === 'expanded')) {
        return saved as ViewMode;
      }
    } catch (error) {
      console.warn('Failed to load view mode from localStorage:', error);
    }
    return 'expanded'; // Default to expanded view
  }

  private saveViewMode(mode: ViewMode): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, mode);
    } catch (error) {
      console.warn('Failed to save view mode to localStorage:', error);
    }
  }
}