import { Injectable, signal } from '@angular/core';

export type ChartType = 'bar' | 'line' | 'area';
export type ChartJsType = 'bar' | 'line';

export interface ChartTypeOption {
  type: ChartType;
  label: string;
  icon: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChartTypeService {
  private readonly STORAGE_KEY = 'logmk-chart-type';

  // Default chart type
  private readonly defaultType: ChartType = 'area';

  // Available chart types
  readonly chartTypes: ChartTypeOption[] = [
    { type: 'bar', label: 'Bar Chart', icon: 'bar-chart-3' },
    { type: 'line', label: 'Line Chart', icon: 'trending-up' },
    { type: 'area', label: 'Area Chart', icon: 'area-chart' }
  ];

  // Reactive chart type signal
  selectedChartType = signal<ChartType>(this.loadChartType());

  constructor() {}

  private loadChartType(): ChartType {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored && this.isValidChartType(stored)) {
        return stored as ChartType;
      }
    } catch (error) {
      console.warn('Failed to load chart type from localStorage:', error);
    }
    return this.defaultType;
  }

  private saveChartType(type: ChartType): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, type);
    } catch (error) {
      console.warn('Failed to save chart type to localStorage:', error);
    }
  }

  private isValidChartType(type: string): boolean {
    return this.chartTypes.some(ct => ct.type === type);
  }

  setChartType(type: ChartType): void {
    if (this.isValidChartType(type)) {
      this.selectedChartType.set(type);
      this.saveChartType(type);
    }
  }

  getChartTypeOption(type: ChartType): ChartTypeOption | undefined {
    return this.chartTypes.find(ct => ct.type === type);
  }

  getCurrentTypeOption(): ChartTypeOption {
    return this.getChartTypeOption(this.selectedChartType()) || this.chartTypes[0];
  }

  getChartJsType(): ChartJsType {
    const type = this.selectedChartType();
    // Area charts use 'line' type with fill configuration
    return type === 'area' ? 'line' : type as ChartJsType;
  }
}