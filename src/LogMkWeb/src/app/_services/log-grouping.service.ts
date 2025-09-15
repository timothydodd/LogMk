import { Injectable, signal } from '@angular/core';
import { Log } from './signalr.service';

export interface LogGroup {
  id: string;
  logs: Log[];
  count: number;
  isExpanded: boolean;
  representative: Log; // The first log in the group
  firstTimestamp: Date;
  lastTimestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class LogGroupingService {
  private readonly LOG_GROUPING_KEY = 'logmk-log-grouping-enabled';

  // Signal for grouping state
  isGroupingEnabled = signal<boolean>(this.getStoredGroupingState());

  constructor() {
    // Load initial state from localStorage
    this.isGroupingEnabled.set(this.getStoredGroupingState());
  }

  toggleGrouping(): void {
    const newState = !this.isGroupingEnabled();
    this.isGroupingEnabled.set(newState);
    this.saveGroupingState(newState);
  }

  /**
   * Groups consecutive logs with identical content
   */
  groupLogs(logs: Log[]): (Log | LogGroup)[] {
    if (!this.isGroupingEnabled() || logs.length === 0) {
      return logs;
    }

    const result: (Log | LogGroup)[] = [];
    let currentGroup: Log[] = [];
    let lastLogContent = '';

    for (const log of logs) {
      const logContent = this.normalizeLogContent(log);

      if (logContent === lastLogContent && currentGroup.length > 0) {
        // Add to current group
        currentGroup.push(log);
      } else {
        // Finalize previous group if it exists
        if (currentGroup.length > 0) {
          if (currentGroup.length > 1) {
            // Create a group
            result.push(this.createLogGroup(currentGroup));
          } else {
            // Single log, add as-is
            result.push(currentGroup[0]);
          }
        }

        // Start new group
        currentGroup = [log];
        lastLogContent = logContent;
      }
    }

    // Handle the last group
    if (currentGroup.length > 0) {
      if (currentGroup.length > 1) {
        result.push(this.createLogGroup(currentGroup));
      } else {
        result.push(currentGroup[0]);
      }
    }

    return result;
  }

  /**
   * Expands all groups in a list of grouped logs
   */
  expandAllGroups(items: (Log | LogGroup)[]): (Log | LogGroup)[] {
    return items.map(item => {
      if (this.isLogGroup(item)) {
        return { ...item, isExpanded: true };
      }
      return item;
    });
  }

  /**
   * Collapses all groups in a list of grouped logs
   */
  collapseAllGroups(items: (Log | LogGroup)[]): (Log | LogGroup)[] {
    return items.map(item => {
      if (this.isLogGroup(item)) {
        return { ...item, isExpanded: false };
      }
      return item;
    });
  }

  /**
   * Toggles expansion state of a specific group
   */
  toggleGroupExpansion(items: (Log | LogGroup)[], groupId: string): (Log | LogGroup)[] {
    return items.map(item => {
      if (this.isLogGroup(item) && item.id === groupId) {
        return { ...item, isExpanded: !item.isExpanded };
      }
      return item;
    });
  }

  /**
   * Type guard to check if an item is a LogGroup
   */
  isLogGroup(item: Log | LogGroup): item is LogGroup {
    return 'count' in item && 'representative' in item;
  }

  /**
   * Flattens grouped logs back to individual logs (for export, etc.)
   */
  flattenGroups(items: (Log | LogGroup)[]): Log[] {
    const result: Log[] = [];

    for (const item of items) {
      if (this.isLogGroup(item)) {
        result.push(...item.logs);
      } else {
        result.push(item);
      }
    }

    return result;
  }

  private createLogGroup(logs: Log[]): LogGroup {
    const representative = logs[0];
    const timestamps = logs.map(log => new Date(log.timeStamp));

    return {
      id: `group-${representative.id}-${logs.length}`,
      logs,
      count: logs.length,
      isExpanded: false,
      representative,
      firstTimestamp: new Date(Math.min(...timestamps.map(t => t.getTime()))),
      lastTimestamp: new Date(Math.max(...timestamps.map(t => t.getTime())))
    };
  }

  private normalizeLogContent(log: Log): string {
    // Use the cleaned view content for comparison
    // This ignores timestamps and focuses on the actual log message
    return log.view.trim().toLowerCase();
  }

  private getStoredGroupingState(): boolean {
    try {
      const stored = localStorage.getItem(this.LOG_GROUPING_KEY);
      return stored ? JSON.parse(stored) : false; // Default to disabled
    } catch {
      return false;
    }
  }

  private saveGroupingState(enabled: boolean): void {
    try {
      localStorage.setItem(this.LOG_GROUPING_KEY, JSON.stringify(enabled));
    } catch (error) {
      console.warn('Failed to save log grouping state:', error);
    }
  }
}