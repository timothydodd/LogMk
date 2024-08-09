import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LogFilterState {
  selectedLogLevel = signal<string>('All');
}
