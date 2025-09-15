import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LineNumbersService {
  private readonly LINE_NUMBERS_KEY = 'logmk-line-numbers-enabled';

  // Signal for line numbers state
  isLineNumbersEnabled = signal<boolean>(this.getStoredLineNumbersState());

  constructor() {
    // Load initial state from localStorage
    this.isLineNumbersEnabled.set(this.getStoredLineNumbersState());
  }

  toggleLineNumbers(): void {
    const newState = !this.isLineNumbersEnabled();
    this.isLineNumbersEnabled.set(newState);
    this.saveLineNumbersState(newState);
  }

  private getStoredLineNumbersState(): boolean {
    try {
      const stored = localStorage.getItem(this.LINE_NUMBERS_KEY);
      return stored ? JSON.parse(stored) : false; // Default to disabled
    } catch {
      return false;
    }
  }

  private saveLineNumbersState(enabled: boolean): void {
    try {
      localStorage.setItem(this.LINE_NUMBERS_KEY, JSON.stringify(enabled));
    } catch (error) {
      console.warn('Failed to save line numbers state:', error);
    }
  }
}