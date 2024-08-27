import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LogFilterState {
  selectedLogLevel = signal<string[] | null>(null);
  selectedPod = signal<string[] | null>(null);
  searchString = signal<string>('');
  selectedTimeRange = signal<Date | null>(null);
}
