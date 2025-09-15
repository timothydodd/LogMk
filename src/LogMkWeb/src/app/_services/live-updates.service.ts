import { Injectable, signal } from '@angular/core';
import { Log } from './signalr.service';

@Injectable({
  providedIn: 'root'
})
export class LiveUpdatesService {
  private readonly LIVE_UPDATES_KEY = 'logmk-live-updates-enabled';

  // Signal for live updates state
  isLiveUpdatesEnabled = signal<boolean>(this.getStoredLiveUpdatesState());

  // Queue for incoming logs while paused
  private queuedLogs = signal<Log[]>([]);

  // Count of queued logs (computed for display)
  queuedLogsCount = signal<number>(0);

  constructor() {
    // Load initial state from localStorage
    this.isLiveUpdatesEnabled.set(this.getStoredLiveUpdatesState());
  }

  toggleLiveUpdates(): void {
    const newState = !this.isLiveUpdatesEnabled();
    this.isLiveUpdatesEnabled.set(newState);
    this.saveLiveUpdatesState(newState);

    // If resuming, clear the queue
    if (newState) {
      this.clearQueue();
    }
  }

  pauseLiveUpdates(): void {
    this.isLiveUpdatesEnabled.set(false);
    this.saveLiveUpdatesState(false);
  }

  resumeLiveUpdates(): void {
    this.isLiveUpdatesEnabled.set(true);
    this.saveLiveUpdatesState(true);
    this.clearQueue();
  }

  queueLog(log: Log): void {
    if (!this.isLiveUpdatesEnabled()) {
      this.queuedLogs.update(queue => [...queue, log]);
      this.queuedLogsCount.set(this.queuedLogs().length);
    }
  }

  queueLogs(logs: Log[]): void {
    if (!this.isLiveUpdatesEnabled()) {
      this.queuedLogs.update(queue => [...queue, ...logs]);
      this.queuedLogsCount.set(this.queuedLogs().length);
    }
  }

  getQueuedLogs(): Log[] {
    return this.queuedLogs();
  }

  clearQueue(): void {
    this.queuedLogs.set([]);
    this.queuedLogsCount.set(0);
  }

  private getStoredLiveUpdatesState(): boolean {
    try {
      const stored = localStorage.getItem(this.LIVE_UPDATES_KEY);
      return stored ? JSON.parse(stored) : true; // Default to enabled
    } catch {
      return true;
    }
  }

  private saveLiveUpdatesState(enabled: boolean): void {
    try {
      localStorage.setItem(this.LIVE_UPDATES_KEY, JSON.stringify(enabled));
    } catch (error) {
      console.warn('Failed to save live updates state:', error);
    }
  }
}