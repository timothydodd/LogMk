import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ChartVisibilityService {
  private readonly STORAGE_KEY = 'logmk-chart-visibility';

  // Chart is visible by default
  private readonly defaultVisibility = true;

  // Reactive visibility signal
  isChartVisible = signal<boolean>(this.loadVisibility());

  constructor() {}

  private loadVisibility(): boolean {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored !== null) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load chart visibility from localStorage:', error);
    }
    return this.defaultVisibility;
  }

  private saveVisibility(visible: boolean): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(visible));
    } catch (error) {
      console.warn('Failed to save chart visibility to localStorage:', error);
    }
  }

  toggleVisibility(): void {
    const newVisibility = !this.isChartVisible();
    this.isChartVisible.set(newVisibility);
    this.saveVisibility(newVisibility);
  }

  setVisibility(visible: boolean): void {
    this.isChartVisible.set(visible);
    this.saveVisibility(visible);
  }
}