import { Injectable } from '@angular/core';
import { Log } from './signalr.service';

export interface TriStateValue {
  included?: string[];
  excluded?: string[];
}

export interface ExtractedFilters {
  includeLogLevel: string[] | null;
  excludeLogLevel: string[] | null;
  includePod: string[] | null;
  excludePod: string[] | null;
}

/**
 * Consolidated log processing service
 * Handles all log transformation, filtering, sorting, and deduplication logic
 */
@Injectable({
  providedIn: 'root'
})
export class LogProcessingService {

  // Counter for generating unique client-side IDs for logs that arrive without one (e.g. SignalR real-time logs)
  private nextClientId = -1;

  /**
   * Core log transformation: assign pod colors and clean log lines
   * This is the main entry point for transforming raw logs into display-ready logs
   */
  transformLogs(logs: Log[]): Log[] {
    return logs.map(log => ({
      ...log,
      id: log.id || this.nextClientId--,
      podColor: this.getPodColor(log.pod),
      view: this.cleanLogLine(log.line),
    }));
  }

  /**
   * Generate consistent RGB color for pod name using hash function
   * Same pod name always gets the same color
   */
  private getPodColor(podName: string): string {
    let hash = 0;
    for (let i = 0; i < podName.length; i++) {
      hash = podName.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Convert hash to RGB with good contrast
    const r = (hash & 0xFF0000) >> 16;
    const g = (hash & 0x00FF00) >> 8;
    const b = hash & 0x0000FF;

    // Ensure minimum brightness for readability
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    const minBrightness = 80;

    let finalR = r;
    let finalG = g;
    let finalB = b;

    if (brightness < minBrightness) {
      const factor = minBrightness / brightness;
      finalR = Math.min(255, Math.floor(r * factor));
      finalG = Math.min(255, Math.floor(g * factor));
      finalB = Math.min(255, Math.floor(b * factor));
    }

    return `rgb(${finalR}, ${finalG}, ${finalB})`;
  }

  /**
   * Clean log line by removing timestamp prefixes and log level markers
   * Handles multiple timestamp formats commonly found in logs
   */
  cleanLogLine(line: string): string {
    if (!line) return '';

    return line.replace(
      /^(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]\s+\b(INFO|DEBUG|ERROR|WARN|TRACE|FATAL)\b\s*|^\d{2}:\d{2}:\d{2}\s+\w+:\s*|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\s+\b(INFO|DEBUG|ERROR|WARN|TRACE|FATAL|INF|DBG|ERR|WRN|TRC|FTL)\b\s*)/,
      ''
    );
  }

  /**
   * Extract filter arrays from tri-state values
   * Handles the common pattern of converting tri-state selections to arrays
   */
  extractTriStateFilters(
    triStateLogLevel: TriStateValue | null,
    triStatePod: TriStateValue | null
  ): ExtractedFilters {
    return {
      includeLogLevel: triStateLogLevel?.included?.length ? triStateLogLevel.included : null,
      excludeLogLevel: triStateLogLevel?.excluded?.length ? triStateLogLevel.excluded : null,
      includePod: triStatePod?.included?.length ? triStatePod.included : null,
      excludePod: triStatePod?.excluded?.length ? triStatePod.excluded : null,
    };
  }

  /**
   * Sort logs by timestamp (DESC) then sequence number (ASC)
   * Ensures newest logs appear first, with ties broken by sequence number
   */
  sortLogs(logs: Log[]): Log[] {
    return [...logs].sort((a, b) => {
      const timeDiff = new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.sequenceNumber - b.sequenceNumber; // Lower sequence first for same timestamp
    });
  }

  /**
   * Deduplicate logs by comparing against existing logs
   * Filters out logs that already exist based on timestamp and ID
   */
  deduplicateLogs(newLogs: Log[], existingLogs: Log[]): Log[] {
    if (existingLogs.length === 0) return newLogs;

    const newestExisting = existingLogs[0];
    const newestTimestamp = new Date(newestExisting.timeStamp).getTime();

    return newLogs.filter(log => {
      const logTimestamp = new Date(log.timeStamp).getTime();
      // Keep logs that are newer than the newest existing log
      // Or logs with the same timestamp but different ID
      return logTimestamp > newestTimestamp ||
             (logTimestamp === newestTimestamp && log.id !== newestExisting.id);
    });
  }

  /**
   * Apply memory management to logs array
   * Keeps only the most recent logs up to the specified limit
   */
  applyMemoryLimit(logs: Log[], maxLogs: number): Log[] {
    if (logs.length <= maxLogs) {
      return logs;
    }

    // Keep the most recent logs (already sorted DESC by timestamp)
    return logs.slice(0, maxLogs);
  }

  /**
   * Complete processing pipeline for new logs
   * Transforms, sorts, deduplicates, and applies memory limits
   */
  processNewLogs(
    newLogs: Log[],
    existingLogs: Log[],
    options: {
      transform?: boolean;
      sort?: boolean;
      deduplicate?: boolean;
      maxLogs?: number;
    } = {}
  ): Log[] {
    const {
      transform = true,
      sort = true,
      deduplicate = true,
      maxLogs
    } = options;

    let processed = newLogs;

    // Step 1: Transform (add colors and clean lines)
    if (transform) {
      processed = this.transformLogs(processed);
    }

    // Step 2: Sort
    if (sort) {
      processed = this.sortLogs(processed);
    }

    // Step 3: Deduplicate
    if (deduplicate) {
      processed = this.deduplicateLogs(processed, existingLogs);
    }

    // Step 4: Combine with existing logs
    const combined = [...processed, ...existingLogs];

    // Step 5: Apply memory limit
    if (maxLogs !== undefined) {
      return this.applyMemoryLimit(combined, maxLogs);
    }

    return combined;
  }

  /**
   * Process logs for append operation (load more)
   * Transforms and applies memory management
   */
  processAppendLogs(
    newLogs: Log[],
    existingLogs: Log[],
    maxLogs?: number
  ): Log[] {
    const transformed = this.transformLogs(newLogs);
    const combined = [...existingLogs, ...transformed];

    if (maxLogs !== undefined) {
      return this.applyMemoryLimit(combined, maxLogs);
    }

    return combined;
  }
}
