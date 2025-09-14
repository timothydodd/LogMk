import { Injectable, signal, computed } from '@angular/core';

export interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  logLevels: string[] | null;
  pods: string[] | null;
  searchString: string;
  timeRange: Date | null;
  customTimeRange: { start: Date; end: Date } | null;
  createdAt: Date;
}

interface StoredPreset {
  id: string;
  name: string;
  description?: string;
  logLevels: string[] | null;
  pods: string[] | null;
  searchString: string;
  timeRange: string | null;
  customTimeRange: { start: string; end: string } | null;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class FilterPresetsService {
  private readonly STORAGE_KEY = 'logmk-filter-presets';

  presets = signal<FilterPreset[]>([]);

  hasPresets = computed(() => this.presets().length > 0);

  constructor() {
    this.loadPresets();
  }

  private loadPresets(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const storedPresets: StoredPreset[] = JSON.parse(stored);
        const presets = storedPresets.map(preset => this.deserializePreset(preset));
        this.presets.set(presets);
      }
    } catch (error) {
      console.warn('Failed to load filter presets from localStorage:', error);
      this.presets.set([]);
    }
  }

  private savePresets(): void {
    try {
      const storedPresets = this.presets().map(preset => this.serializePreset(preset));
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storedPresets));
    } catch (error) {
      console.warn('Failed to save filter presets to localStorage:', error);
    }
  }

  private serializePreset(preset: FilterPreset): StoredPreset {
    return {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      logLevels: preset.logLevels,
      pods: preset.pods,
      searchString: preset.searchString,
      timeRange: preset.timeRange?.toISOString() || null,
      customTimeRange: preset.customTimeRange ? {
        start: preset.customTimeRange.start.toISOString(),
        end: preset.customTimeRange.end.toISOString()
      } : null,
      createdAt: preset.createdAt.toISOString()
    };
  }

  private deserializePreset(stored: StoredPreset): FilterPreset {
    return {
      id: stored.id,
      name: stored.name,
      description: stored.description,
      logLevels: stored.logLevels,
      pods: stored.pods,
      searchString: stored.searchString,
      timeRange: stored.timeRange ? new Date(stored.timeRange) : null,
      customTimeRange: stored.customTimeRange ? {
        start: new Date(stored.customTimeRange.start),
        end: new Date(stored.customTimeRange.end)
      } : null,
      createdAt: new Date(stored.createdAt)
    };
  }

  saveCurrentFilters(
    name: string,
    description: string | undefined,
    currentFilters: {
      logLevels: string[] | null;
      pods: string[] | null;
      searchString: string;
      timeRange: Date | null;
      customTimeRange: { start: Date; end: Date } | null;
    }
  ): void {
    const preset: FilterPreset = {
      id: this.generateId(),
      name: name.trim(),
      description: description?.trim(),
      logLevels: currentFilters.logLevels,
      pods: currentFilters.pods,
      searchString: currentFilters.searchString,
      timeRange: currentFilters.timeRange,
      customTimeRange: currentFilters.customTimeRange,
      createdAt: new Date()
    };

    const currentPresets = this.presets();
    this.presets.set([...currentPresets, preset]);
    this.savePresets();
  }

  deletePreset(id: string): void {
    const currentPresets = this.presets();
    const updatedPresets = currentPresets.filter(preset => preset.id !== id);
    this.presets.set(updatedPresets);
    this.savePresets();
  }

  getPresetById(id: string): FilterPreset | undefined {
    return this.presets().find(preset => preset.id === id);
  }

  renamePreset(id: string, newName: string): void {
    const currentPresets = this.presets();
    const updatedPresets = currentPresets.map(preset =>
      preset.id === id
        ? { ...preset, name: newName.trim() }
        : preset
    );
    this.presets.set(updatedPresets);
    this.savePresets();
  }

  updatePresetDescription(id: string, newDescription: string): void {
    const currentPresets = this.presets();
    const updatedPresets = currentPresets.map(preset =>
      preset.id === id
        ? { ...preset, description: newDescription.trim() || undefined }
        : preset
    );
    this.presets.set(updatedPresets);
    this.savePresets();
  }

  private generateId(): string {
    return `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Check if current filters match a preset
  findMatchingPreset(currentFilters: {
    logLevels: string[] | null;
    pods: string[] | null;
    searchString: string;
    timeRange: Date | null;
    customTimeRange: { start: Date; end: Date } | null;
  }): FilterPreset | null {
    return this.presets().find(preset =>
      this.filtersEqual(preset, currentFilters)
    ) || null;
  }

  private filtersEqual(preset: FilterPreset, filters: any): boolean {
    // Compare arrays (null-safe)
    const logLevelsEqual = this.arrayEquals(preset.logLevels, filters.logLevels);
    const podsEqual = this.arrayEquals(preset.pods, filters.pods);

    // Compare strings
    const searchEqual = preset.searchString === filters.searchString;

    // For time comparison, we'll be lenient since exact matches are unlikely
    // Just check if both have same type (regular vs custom)
    const timeRangeTypeEqual = (preset.timeRange === null) === (filters.timeRange === null);
    const customTimeRangeTypeEqual = (preset.customTimeRange === null) === (filters.customTimeRange === null);

    return logLevelsEqual && podsEqual && searchEqual && timeRangeTypeEqual && customTimeRangeTypeEqual;
  }

  private arrayEquals(a: string[] | null, b: string[] | null): boolean {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    if (a.length !== b.length) return false;

    const sortedA = [...a].sort();
    const sortedB = [...b].sort();

    return sortedA.every((val, index) => val === sortedB[index]);
  }
}