import { Injectable, signal, effect } from '@angular/core';

interface MemorySettings {
  maxLogsInMemory: number;
  autoCleanupEnabled: boolean;
  cleanupThreshold: number; // Percentage of max logs that triggers cleanup
  cleanupAmount: number; // Percentage of logs to remove during cleanup
}

@Injectable({
  providedIn: 'root',
})
export class MemoryManagementService {
  private readonly STORAGE_KEY = 'logmk-memory-settings';

  // Default settings
  private readonly DEFAULT_SETTINGS: MemorySettings = {
    maxLogsInMemory: 5000,
    autoCleanupEnabled: true,
    cleanupThreshold: 90, // When memory usage reaches 90%
    cleanupAmount: 25 // Remove 25% of oldest logs
  };

  // Signals for reactive settings
  maxLogsInMemory = signal<number>(this.DEFAULT_SETTINGS.maxLogsInMemory);
  autoCleanupEnabled = signal<boolean>(this.DEFAULT_SETTINGS.autoCleanupEnabled);
  cleanupThreshold = signal<number>(this.DEFAULT_SETTINGS.cleanupThreshold);
  cleanupAmount = signal<number>(this.DEFAULT_SETTINGS.cleanupAmount);

  // Memory usage statistics
  currentLogCount = signal<number>(0);
  memoryUsagePercentage = signal<number>(0);

  constructor() {
    this.loadSettings();
    this.setupAutoSave();
    this.setupMemoryCalculation();
  }

  private loadSettings(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const settings: MemorySettings = JSON.parse(saved);

        this.maxLogsInMemory.set(settings.maxLogsInMemory ?? this.DEFAULT_SETTINGS.maxLogsInMemory);
        this.autoCleanupEnabled.set(settings.autoCleanupEnabled ?? this.DEFAULT_SETTINGS.autoCleanupEnabled);
        this.cleanupThreshold.set(settings.cleanupThreshold ?? this.DEFAULT_SETTINGS.cleanupThreshold);
        this.cleanupAmount.set(settings.cleanupAmount ?? this.DEFAULT_SETTINGS.cleanupAmount);
      }
    } catch (error) {
      console.warn('Failed to load memory settings from localStorage:', error);
      this.resetToDefaults();
    }
  }

  private setupAutoSave(): void {
    effect(() => {
      const settings: MemorySettings = {
        maxLogsInMemory: this.maxLogsInMemory(),
        autoCleanupEnabled: this.autoCleanupEnabled(),
        cleanupThreshold: this.cleanupThreshold(),
        cleanupAmount: this.cleanupAmount()
      };

      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
      } catch (error) {
        console.warn('Failed to save memory settings to localStorage:', error);
      }
    });
  }

  private setupMemoryCalculation(): void {
    effect(() => {
      const current = this.currentLogCount();
      const max = this.maxLogsInMemory();
      const percentage = max > 0 ? Math.round((current / max) * 100) : 0;
      this.memoryUsagePercentage.set(Math.min(percentage, 100));
    });
  }

  // Public methods for updating settings
  setMaxLogsInMemory(value: number): void {
    if (value >= 100 && value <= 50000) {
      this.maxLogsInMemory.set(value);
    }
  }

  setAutoCleanupEnabled(enabled: boolean): void {
    this.autoCleanupEnabled.set(enabled);
  }

  setCleanupThreshold(threshold: number): void {
    if (threshold >= 50 && threshold <= 100) {
      this.cleanupThreshold.set(threshold);
    }
  }

  setCleanupAmount(amount: number): void {
    if (amount >= 10 && amount <= 75) {
      this.cleanupAmount.set(amount);
    }
  }

  // Method to update current log count from log viewport
  updateCurrentLogCount(count: number): void {
    this.currentLogCount.set(count);
  }

  // Check if cleanup is needed
  shouldCleanup(): boolean {
    if (!this.autoCleanupEnabled()) return false;

    const usagePercentage = this.memoryUsagePercentage();
    const threshold = this.cleanupThreshold();

    return usagePercentage >= threshold;
  }

  // Calculate how many logs to remove during cleanup
  getCleanupCount(): number {
    const total = this.currentLogCount();
    const percentage = this.cleanupAmount();
    return Math.floor((total * percentage) / 100);
  }

  // Get suggested new log count after cleanup
  getTargetLogCountAfterCleanup(): number {
    const current = this.currentLogCount();
    const toRemove = this.getCleanupCount();
    return Math.max(0, current - toRemove);
  }

  // Reset to default settings
  resetToDefaults(): void {
    this.maxLogsInMemory.set(this.DEFAULT_SETTINGS.maxLogsInMemory);
    this.autoCleanupEnabled.set(this.DEFAULT_SETTINGS.autoCleanupEnabled);
    this.cleanupThreshold.set(this.DEFAULT_SETTINGS.cleanupThreshold);
    this.cleanupAmount.set(this.DEFAULT_SETTINGS.cleanupAmount);
  }

  // Get current settings as object
  getCurrentSettings(): MemorySettings {
    return {
      maxLogsInMemory: this.maxLogsInMemory(),
      autoCleanupEnabled: this.autoCleanupEnabled(),
      cleanupThreshold: this.cleanupThreshold(),
      cleanupAmount: this.cleanupAmount()
    };
  }

  // Get memory usage info
  getMemoryInfo() {
    return {
      currentLogCount: this.currentLogCount(),
      maxLogsInMemory: this.maxLogsInMemory(),
      memoryUsagePercentage: this.memoryUsagePercentage(),
      shouldCleanup: this.shouldCleanup(),
      estimatedMemoryMB: Math.round((this.currentLogCount() * 0.5) / 1024) // Rough estimate: 0.5KB per log entry
    };
  }
}