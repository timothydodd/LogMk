import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LogFilterState {
  selectedLogLevel = signal<string>('All');
  selectedPod = signal<string>('All');
  searchString = signal<string>('');
  selectedTimeRange = signal<Date | null>(null);
}
